import {
  analyticsEventSchema,
  type AnalyticsEvent,
  type AnalyticsConsent,
  type Journey,
  type ParticipantCode,
} from "./analytics-schema.ts";
import type { LabState, Reflection, TrackId } from "./missions.ts";
import { abortable } from "./async-deadline.ts";
export const ANALYTICS_PAUSED_KEY = "haebogi-analytics-paused";
const SESSION_KEY = "haebogi-analytics-session";
export type AnalyticsStatus = AnalyticsConsent & {
  phase: "loading" | "ready" | "saving" | "error";
  message: string;
};
const off: AnalyticsConsent = {
  enabled: false,
  token: null,
  participantCode: null,
};
export function createAnalyticsClient(options: {
  fetcher?: typeof fetch;
  session: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  preferences: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  onStatus?: (state: AnalyticsStatus) => void;
  now?: () => number;
  flushMs?: number;
  timeoutMs?: number;
}) {
  const now = options.now ?? Date.now,
    fetcher = options.fetcher ?? fetch;
  let status: AnalyticsStatus = { ...off, phase: "loading", message: "" },
    revision = 0,
    disposed = false;
  let queue: AnalyticsEvent[] = [],
    timer: ReturnType<typeof setTimeout> | undefined,
    sending: Promise<void> | null = null;
  let active: { context: Journey; started: number } | null = null,
    fallbackSession: string | undefined;
  const sessions = new Map<string, string>();
  const pending = new Map<
    TrackId,
    {
      endedAt: string;
      executionId: string;
      context: Journey;
      token: string;
      kind: NonNullable<Reflection["nextPlan"]>["candidates"][number]["kind"];
      targetTrack: TrackId;
    }
  >();
  const emitStatus = (patch: Partial<AnalyticsStatus>) => {
    status = { ...status, ...patch };
    if (!disposed) options.onStatus?.({ ...status });
  };
  const request = async (method: string, body?: unknown) => {
    const signal = AbortSignal.timeout(options.timeoutMs ?? 3000);
    const response = await abortable(
      fetcher("/api/analytics", {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal,
        keepalive: true,
      }),
      signal,
    );
    const data = await abortable(response.json(), signal);
    if (!response.ok) throw new Error("ANALYTICS_UNAVAILABLE");
    return data;
  };
  const getSession = () => {
    try {
      const raw = JSON.parse(options.session.getItem(SESSION_KEY) ?? "null");
      const valid =
        raw &&
        /^[0-9a-f-]{36}$/i.test(raw.id) &&
        typeof raw.last === "number" &&
        now() - raw.last >= 0 &&
        now() - raw.last < 1800000;
      const id = valid ? raw.id : crypto.randomUUID();
      options.session.setItem(SESSION_KEY, JSON.stringify({ id, last: now() }));
      return id as string;
    } catch {
      return (fallbackSession ??= crypto.randomUUID());
    }
  };
  const pause = (writePreference = true) => {
    revision++;
    queue = [];
    active = null;
    pending.clear();
    sessions.clear();
    clearTimeout(timer);
    try {
      if (writePreference)
        options.preferences.setItem(ANALYTICS_PAUSED_KEY, "1");
      options.session.removeItem(SESSION_KEY);
    } catch {}
    emitStatus({ ...off, phase: "ready", message: "" });
  };
  function track(
    name: AnalyticsEvent["name"],
    data: AnalyticsEvent["data"],
    context?: Journey | null,
  ) {
    if (!status.enabled || !status.token || disposed) return;
    const scope = context === undefined ? active?.context : context;
    if (
      !["page_view", "comparison_view"].includes(name) &&
      (!scope || !sessions.has(scope.journeyId))
    )
      return;
    const sessionId = scope
      ? (sessions.get(scope.journeyId) ?? getSession())
      : getSession();
    const parsed = analyticsEventSchema.safeParse({
      version: 1,
      id: crypto.randomUUID(),
      sessionId,
      name,
      data,
      ...(["page_view", "comparison_view"].includes(name)
        ? {}
        : scope
          ? { context: scope }
          : {}),
    });
    if (!parsed.success) return;
    if (queue.length >= 60) {
      emitStatus({
        message: "활동 기록 일부가 누락될 수 있어요. 체험은 계속할 수 있어요.",
      });
      return;
    }
    queue.push(parsed.data);
    clearTimeout(timer);
    timer = setTimeout(() => void api.flush(), options.flushMs ?? 600);
    if (queue.length >= 20) void api.flush();
  }
  const api = {
    async load() {
      const token = ++revision;
      emitStatus({ phase: "loading", message: "" });
      try {
        const choice = (await request("GET")) as AnalyticsConsent;
        if (token !== revision || disposed) return;
        let paused = false;
        try {
          paused = options.preferences.getItem(ANALYTICS_PAUSED_KEY) === "1";
        } catch {}
        if (paused && choice.enabled) {
          await api.setConsent(false, null);
          return;
        }
        emitStatus({ ...choice, phase: "ready" });
      } catch {
        if (token === revision && !disposed)
          emitStatus({
            ...off,
            phase: "error",
            message: "참여 설정을 확인하지 못했어요. 활동은 수집하지 않아요.",
          });
      }
    },
    async setConsent(enabled: boolean, participantCode: ParticipantCode) {
      pause();
      const token = revision;
      emitStatus({ phase: "saving" });
      try {
        const choice = (await request("PUT", {
          enabled,
          participantCode: enabled ? participantCode : null,
        })) as AnalyticsConsent;
        if (token !== revision || disposed) return;
        if (enabled) {
          try {
            options.preferences.removeItem(ANALYTICS_PAUSED_KEY);
          } catch {}
        }
        emitStatus({
          ...choice,
          phase: "ready",
          message: enabled
            ? "참여를 켰어요. 다음 체험부터 활동을 기록해요."
            : "참여를 끄고 서버의 활동 기록을 지웠어요.",
        });
      } catch {
        if (token === revision && !disposed)
          emitStatus({
            ...off,
            phase: "error",
            message: enabled
              ? "참여를 켜지 못했어요. 다시 시도해주세요."
              : "이 기기의 수집은 멈췄어요. 서버 기록 삭제는 다시 시도해주세요.",
          });
      }
    },
    track,
    context: () => active?.context ?? null,
    begin(
      trackId: TrackId,
      surface: Journey["surface"],
      contentVersion: string,
      entry: "new" | "resume",
    ) {
      api.end("left");
      if (!status.enabled || disposed) return null;
      const context: Journey = {
        journeyId: crypto.randomUUID(),
        surface,
        track: trackId,
        contentVersion,
      };
      sessions.set(context.journeyId, getSession());
      active = { context, started: now() };
      track("mission_start", { entry }, context);
      return context;
    },
    end(outcome: "left" | "submitted" | "completed") {
      if (!active) return;
      const previous = active;
      active = null;
      track(
        "mission_end",
        {
          outcome,
          elapsedMs: Math.max(0, Math.min(3600000, now() - previous.started)),
        },
        previous.context,
      );
    },
    reflectionSubmitted(trackId: TrackId, reflection: Reflection) {
      const context = active?.context,
        execution = reflection.execution,
        plan = reflection.nextPlan;
      const candidate = plan?.candidates.find((c) => c.id === plan.selectedId);
      if (
        !status.enabled ||
        !status.token ||
        !context ||
        context.track !== trackId ||
        !execution ||
        !candidate
      )
        return;
      pending.set(trackId, {
        context,
        endedAt: reflection.endedAt,
        executionId: execution.id,
        token: status.token,
        kind: candidate.kind,
        targetTrack: candidate.track,
      });
      track("reflection_submit", { executionId: execution.id }, context);
    },
    saved(snapshot: LabState) {
      for (const [trackId, p] of pending) {
        const r = snapshot.progress[trackId]?.reflection;
        if (
          r?.endedAt !== p.endedAt ||
          r.execution?.id !== p.executionId ||
          p.token !== status.token
        )
          continue;
        pending.delete(trackId);
        track("reflection_saved", { executionId: p.executionId }, p.context);
        track(
          "next_action_committed",
          {
            kind: p.kind,
            targetTrack: p.targetTrack,
            executionId: p.executionId,
          },
          p.context,
        );
      }
    },
    pause,
    flush(): Promise<void> {
      clearTimeout(timer);
      if (sending) return sending;
      if (!status.enabled || !status.token || !queue.length)
        return Promise.resolve();
      const batch = queue.splice(0, 20),
        token = status.token,
        version = revision;
      sending = (async () => {
        try {
          const response = await request("POST", { token, events: batch });
          if (version === revision && response.accepted < batch.length)
            emitStatus({
              message: "중복·사용 한도로 일부 활동은 집계되지 않을 수 있어요.",
            });
        } catch {
          if (version === revision)
            emitStatus({
              message:
                "활동 기록에 연결하지 못했어요. 체험은 계속할 수 있어요.",
            });
        } finally {
          sending = null;
          if (queue.length && status.enabled)
            timer = setTimeout(() => void api.flush(), options.flushMs ?? 600);
        }
      })();
      return sending;
    },
    dispose() {
      api.end("left");
      void api.flush();
      disposed = true;
      revision++;
      clearTimeout(timer);
      pending.clear();
    },
  };
  return api;
}
