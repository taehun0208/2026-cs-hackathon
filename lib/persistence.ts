import { emptyState, missions, type LabState } from "./missions.ts";
import { normalizeLabState } from "./lab-state.ts";
import { abortable } from "./async-deadline.ts";

export const DRAFT_KEY = "haebogi-lab-v1";
export type SaveStatus = {
  phase:
    | "loading"
    | "idle"
    | "saving"
    | "saved"
    | "error"
    | "recovery"
    | "conflict"
    | "deleting";
  ready: boolean;
  localSaved: boolean;
  savedAt: string | null;
  expiresAt: string | null;
  message: string;
};
type Draft = {
  format: 2;
  state: LabState;
  dirty: boolean;
  savedAt: string | null;
  expiresAt: string | null;
};
type ServerRecord = {
  state: LabState | null;
  savedAt: string | null;
  expiresAt: string | null;
};
const fingerprint = (state: LabState) => JSON.stringify(state);
export const hasWork = (s: LabState) =>
  !!s.profile || Object.values(s.progress).some(Boolean);
export function readDraft(raw: string | null): Draft | null {
  try {
    const x = JSON.parse(raw ?? "null");
    const s = x?.format === 2 ? x.state : x;
    if (
      s?.version !== 1 ||
      !s.progress ||
      typeof s.progress !== "object" ||
      Array.isArray(s.progress)
    )
      return null;
    return {
      format: 2,
      state: normalizeLabState(s),
      dirty: x.format !== 2 || x.dirty !== false,
      savedAt: typeof x.savedAt === "string" ? x.savedAt : null,
      expiresAt: typeof x.expiresAt === "string" ? x.expiresAt : null,
    };
  } catch {
    return null;
  }
}
export function mergeDraft(remote: LabState, draft: Draft | null): LabState {
  if (!draft?.dirty) return remote;
  const merged = { ...remote, progress: { ...remote.progress } };
  for (const m of missions) {
    const a = draft.state.progress[m.id],
      b = remote.progress[m.id];
    if (a && (!b || a.updatedAt > b.updatedAt)) merged.progress[m.id] = a;
  }
  if (draft.state.profile) merged.profile = draft.state.profile;
  return normalizeLabState(merged);
}

// One queue owns autosave, coach pre-save and deletion. All status updates are
// tied to an epoch so late responses cannot revive a deleted or replaced draft.
export function createPersistence(options: {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  onState: (state: LabState) => void;
  onStatus: (status: SaveStatus) => void;
  onSaved?: (state: LabState) => void;
  fetcher?: typeof fetch;
  debounceMs?: number;
  timeoutMs?: number;
}) {
  const fetcher = options.fetcher ?? fetch;
  let state = emptyState(),
    synced = fingerprint(state),
    active = false,
    epoch = 0,
    disposed = false;
  let tail: Promise<unknown> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let status: SaveStatus = {
    phase: "loading",
    ready: false,
    localSaved: false,
    savedAt: null,
    expiresAt: null,
    message: "",
  };
  const emit = (patch: Partial<SaveStatus>) => {
    status = { ...status, ...patch };
    if (!disposed) options.onStatus({ ...status });
  };
  const cancelTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const request = (method: string, body?: LabState, signal?: AbortSignal) => {
    const deadline = AbortSignal.timeout(options.timeoutMs ?? 8000);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    return abortable(
      (async () => {
        const response = await fetcher("/api/state", {
          method,
          headers: { "Content-Type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: combined,
        });
        const responseBody = await abortable(response.text(), combined);
        return new Response(responseBody, {
          status: response.status,
          headers: response.headers,
        });
      })(),
      combined,
    );
  };
  const writeLocal = () => {
    try {
      options.storage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          format: 2,
          state,
          dirty: fingerprint(state) !== synced,
          savedAt: status.savedAt,
          expiresAt: status.expiresAt,
        } satisfies Draft),
      );
      emit({ localSaved: true });
    } catch {
      emit({ localSaved: false });
    }
  };
  function enqueue(
    snapshot: LabState,
    signal?: AbortSignal,
  ): Promise<Response> {
    const token = epoch;
    const job = tail
      .catch(() => {})
      .then(async () => {
        if (!active || token !== epoch || disposed)
          throw new Error("SAVE_CANCELED");
        emit({ phase: "saving", message: "" });
        try {
          const response = await request("POST", snapshot, signal);
          if (token !== epoch || disposed) throw new Error("SAVE_CANCELED");
          const data = await response.clone().json();
          if (!response.ok) {
            if (response.status === 409) {
              active = false;
              emit({
                phase: "conflict",
                ready: false,
                message:
                  data.error ??
                  "기록 기준이 달라요. 초안을 내려받고 새로고침해주세요.",
              });
            }
            throw new Error("SAVE_FAILED");
          }
          if (!data.savedAt || !data.expiresAt)
            throw new Error("INVALID_SAVE_RECEIPT");
          // Optional telemetry cannot change the outcome of a successful save.
          try {
            options.onSaved?.(snapshot);
          } catch {}
          synced = fingerprint(snapshot);
          emit({ savedAt: data.savedAt, expiresAt: data.expiresAt });
          writeLocal();
          if (fingerprint(state) === synced)
            emit({ phase: "saved", message: "" });
          return response;
        } catch (error) {
          if (token === epoch && !disposed && status.phase !== "conflict")
            emit({
              phase: "error",
              message: "서버에 저장하지 못했어요. 연결 후 다시 시도해주세요.",
            });
          throw error;
        }
      });
    tail = job.catch(() => {});
    return job;
  }
  const api = {
    async load() {
      const token = ++epoch;
      active = false;
      cancelTimer();
      let draft: Draft | null = null;
      try {
        draft = readDraft(options.storage.getItem(DRAFT_KEY));
      } catch {
        /* Storage may be unavailable. */
      }
      if (draft) {
        state = draft.state;
        options.onState(state);
      }
      emit({
        phase: "loading",
        ready: false,
        localSaved: !!draft,
        savedAt: draft?.savedAt ?? null,
        expiresAt: draft?.expiresAt ?? null,
        message: "",
      });
      try {
        const response = await request("GET");
        if (!response.ok) throw new Error("LOAD_FAILED");
        const remote = (await response.json()) as ServerRecord;
        if (token !== epoch || disposed) return;
        emit({ savedAt: remote.savedAt, expiresAt: remote.expiresAt });
        if (!remote.state && draft && hasWork(draft.state)) {
          emit({
            phase: "recovery",
            ready: false,
            message:
              "서버 기록이 없거나 만료됐어요. 기기 초안을 다시 저장할까요?",
          });
          return;
        }
        const remoteState = remote.state
          ? normalizeLabState(remote.state)
          : emptyState();
        synced = fingerprint(remoteState);
        state = mergeDraft(remoteState, draft);
        active = true;
        options.onState(state);
        emit({
          phase: remote.savedAt ? "saved" : "idle",
          ready: true,
          message: "",
        });
        if (hasWork(state)) writeLocal();
        if (fingerprint(state) !== synced) api.stage(state);
      } catch {
        if (token === epoch && !disposed)
          emit({
            phase: "error",
            ready: !!draft,
            message: draft
              ? "서버 기록을 확인하지 못했어요. 기기 초안은 계속 편집할 수 있어요."
              : "서버 기록을 확인하지 못했어요. 연결 후 다시 시도해주세요.",
          });
      }
    },
    stage(next: LabState) {
      if (
        disposed ||
        status.phase === "deleting" ||
        status.phase === "recovery" ||
        status.phase === "conflict" ||
        status.phase === "loading"
      )
        return;
      state = next;
      if (fingerprint(next) === synced) return;
      writeLocal();
      cancelTimer();
      if (!active) return;
      emit({ phase: "saving", message: "" });
      timer = setTimeout(() => {
        void enqueue(state).catch(() => {});
      }, options.debounceMs ?? 900);
    },
    saveNow(signal?: AbortSignal) {
      cancelTimer();
      return enqueue(state, signal);
    },
    async retry() {
      if (!active) return api.load();
      await api.saveNow().catch(() => {});
    },
    async restore() {
      if (status.phase !== "recovery") return;
      active = true;
      synced = "";
      emit({ phase: "saving", ready: true, message: "" });
      writeLocal();
      await api.saveNow().catch(() => {});
    },
    async remove() {
      if (status.phase === "deleting") return false;
      const token = ++epoch;
      active = false;
      cancelTimer();
      emit({ phase: "deleting", ready: false, message: "" });
      try {
        await tail;
        const response = await request("DELETE");
        if (!response.ok) throw new Error("DELETE_FAILED");
        if (token !== epoch || disposed) return false;
        // Keep deletion locked if this browser cannot remove its own draft.
        options.storage.removeItem(DRAFT_KEY);
        state = emptyState();
        synced = fingerprint(state);
        options.onState(state);
        active = true;
        emit({
          phase: "idle",
          ready: true,
          localSaved: false,
          savedAt: null,
          expiresAt: null,
          message: "",
        });
        return true;
      } catch {
        if (token === epoch && !disposed)
          emit({
            phase: "error",
            ready: false,
            message:
              "삭제를 완료하지 못했어요. 초안을 유지했으니 다시 시도해주세요.",
          });
        return false;
      }
    },
    externalReset() {
      ++epoch;
      active = false;
      cancelTimer();
      state = emptyState();
      synced = fingerprint(state);
      options.onState(state);
      emit({
        phase: "conflict",
        ready: false,
        localSaved: false,
        savedAt: null,
        expiresAt: null,
        message:
          "다른 탭에서 기록을 삭제했어요. 새로고침해 새 체험을 시작해주세요.",
      });
    },
    dispose() {
      disposed = true;
      ++epoch;
      active = false;
      cancelTimer();
    },
  };
  return api;
}
