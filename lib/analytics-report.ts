import {
  analyticsEventSchema,
  pilotCodes,
  type AnalyticsEvent,
} from "./analytics-schema.ts";
export type EventRow = {
  owner: string;
  participantCode: string | null;
  receivedAt: number;
  event: unknown;
};
const ratio = (n: number, d: number) =>
  d
    ? { numerator: n, denominator: d, rate: Math.round((n / d) * 1000) / 1000 }
    : { numerator: 0, denominator: 0, rate: null };
export function summarizeAnalytics(
  rows: EventRow[],
  options: { includeQA?: boolean; cohort?: "all" | "pilot" | "general" } = {},
) {
  let invalid = 0,
    qaExcluded = 0,
    duplicates = 0;
  const ids = new Set<string>();
  const accepted: { row: EventRow; event: AnalyticsEvent }[] = [];
  for (const row of rows) {
    if (row.participantCode === "QA" && !options.includeQA) {
      qaExcluded++;
      continue;
    }
    const pilot = !!row.participantCode && row.participantCode !== "QA";
    if (
      (options.cohort === "pilot" && !pilot) ||
      (options.cohort === "general" && pilot)
    )
      continue;
    const event = analyticsEventSchema.safeParse(row.event);
    if (
      !event.success ||
      !row.owner ||
      !Number.isFinite(row.receivedAt) ||
      (row.participantCode !== null &&
        !pilotCodes.includes(
          row.participantCode as (typeof pilotCodes)[number],
        ))
    ) {
      invalid++;
      continue;
    }
    if (ids.has(event.data.id)) {
      duplicates++;
      continue;
    }
    ids.add(event.data.id);
    accepted.push({ row, event: event.data });
  }
  const sessions = new Set<string>(),
    codes = new Map<string, Set<string>>(),
    owners = new Set<string>();
  const readyComparisons = new Set<string>(),
    groups = new Map<string, typeof accepted>();
  for (const item of accepted) {
    const { row, event } = item;
    owners.add(row.owner);
    const session = row.owner + ":" + event.sessionId;
    sessions.add(session);
    if (row.participantCode) {
      const set = codes.get(row.participantCode) ?? new Set();
      set.add(row.owner);
      codes.set(row.participantCode, set);
    }
    if (event.name === "comparison_view" && event.data.completedCount >= 2)
      readyComparisons.add(session);
    if ("context" in event) {
      const key = row.owner + ":" + event.context.journeyId;
      const items = groups.get(key) ?? [];
      items.push(item);
      groups.set(key, items);
    }
  }
  const roles = new Map<
    string,
    {
      surface: string;
      track: string;
      contentVersion: string;
      starts: number;
      resumes: number;
      editedRun: number;
      helpUsed: number;
      savedReflection: number;
      submittedReflection: number;
      submittedWithoutSave: number;
      gameChecks: number;
      gameRetries: number;
      nextAction: number;
      gameCompleted: number;
      leftWithoutSaved: number;
      unresolved: number;
    }
  >();
  const perOwner = new Map<
    string,
    {
      starts: {
        time: number;
        saved: boolean;
        new: boolean;
        track: string;
        contentVersion: string;
      }[];
      savedTracks: Set<string>;
      action: boolean;
    }
  >();
  let missingStarts = 0,
    inconsistent = 0,
    unlinkedReflections = 0;
  const executionKey = (
    owner: string,
    context: { track: string; contentVersion: string },
    executionId: string,
  ) => `${owner}:${context.track}:${context.contentVersion}:${executionId}`;
  const observedEditedRuns = new Set(
    accepted.flatMap(({ row, event }) =>
      event.name === "run_result" && event.data.kind === "edited"
        ? [executionKey(row.owner, event.context, event.data.executionId)]
        : [],
    ),
  );
  for (const items of groups.values()) {
    const start = items.find((x) => x.event.name === "mission_start");
    if (!start) {
      missingStarts++;
      continue;
    }
    const e = start.event;
    if (!("context" in e)) continue;
    const ctx = e.context;
    if (
      items.some(
        (x) =>
          "context" in x.event &&
          JSON.stringify(x.event.context) !== JSON.stringify(ctx),
      )
    ) {
      inconsistent++;
      continue;
    }
    const key = `${ctx.surface}:${ctx.track}:${ctx.contentVersion}`;
    const result = roles.get(key) ?? {
      surface: ctx.surface,
      track: ctx.track,
      contentVersion: ctx.contentVersion,
      starts: 0,
      resumes: 0,
      editedRun: 0,
      helpUsed: 0,
      savedReflection: 0,
      submittedReflection: 0,
      submittedWithoutSave: 0,
      gameChecks: 0,
      gameRetries: 0,
      nextAction: 0,
      gameCompleted: 0,
      leftWithoutSaved: 0,
      unresolved: 0,
    };
    result.starts++;
    if (e.name === "mission_start" && e.data.entry === "resume")
      result.resumes++;
    const edited = new Set(
      items.flatMap((x) =>
        x.event.name === "run_result" && x.event.data.kind === "edited"
          ? [x.event.data.executionId]
          : [],
      ),
    );
    const saved = new Set(
      items.flatMap((x) =>
        x.event.name === "reflection_saved" &&
        observedEditedRuns.has(
          executionKey(x.row.owner, ctx, x.event.data.executionId),
        )
          ? [x.event.data.executionId]
          : [],
      ),
    );
    unlinkedReflections += items.filter(
      (x) =>
        x.event.name === "reflection_saved" &&
        !observedEditedRuns.has(
          executionKey(x.row.owner, ctx, x.event.data.executionId),
        ),
    ).length;
    const action = items.some(
      (x) =>
        x.event.name === "next_action_committed" &&
        saved.has(x.event.data.executionId),
    );
    const game =
      items.some((x) => x.event.name === "game_check" && x.event.data.passed) &&
      items.some(
        (x) =>
          x.event.name === "mission_end" &&
          x.event.data.outcome === "completed",
      );
    if (edited.size) result.editedRun++;
    if (saved.size) result.savedReflection++;
    const submitted = items.some((x) => x.event.name === "reflection_submit");
    if (submitted) result.submittedReflection++;
    if (submitted && !saved.size) result.submittedWithoutSave++;
    result.gameChecks += items.filter(
      (x) => x.event.name === "game_check",
    ).length;
    result.gameRetries += items.filter(
      (x) => x.event.name === "game_check" && !x.event.data.passed,
    ).length;
    if (action) result.nextAction++;
    if (game) result.gameCompleted++;
    if (items.some((x) => x.event.name === "help_open")) result.helpUsed++;
    const completed = ctx.surface === "code" ? saved.size > 0 : game;
    if (!completed) {
      if (
        items.some(
          (x) =>
            x.event.name === "mission_end" && x.event.data.outcome === "left",
        )
      )
        result.leftWithoutSaved++;
      else result.unresolved++;
    }
    roles.set(key, result);
    if (ctx.surface === "code") {
      const own = perOwner.get(start.row.owner) ?? {
        starts: [],
        savedTracks: new Set<string>(),
        action: false,
      };
      own.starts.push({
        time: start.row.receivedAt,
        saved: saved.size > 0,
        new: e.name === "mission_start" && e.data.entry === "new",
        track: ctx.track,
        contentVersion: ctx.contentVersion,
      });
      if (saved.size) own.savedTracks.add(ctx.track);
      own.action ||= action;
      perOwner.set(start.row.owner, own);
    }
  }
  const first = [...perOwner.values()].flatMap((p) => {
    const starts = p.starts
      .filter((s) => s.new)
      .sort((a, b) => a.time - b.time);
    return starts.length ? [{ owner: p, first: starts[0] }] : [];
  });
  return {
    source:
      "선택 동의한 브라우저의 활동 보고이며 학생 전체를 대표하지 않습니다.",
    unit: "starts는 체험 열기 횟수(이어하기 포함), completion은 서버 저장 알림과 수정 실행 보고가 연결된 회고입니다.",
    acceptedEvents: accepted.length,
    anonymousBrowsers: owners.size,
    sessions: sessions.size,
    quality: {
      invalid,
      qaExcluded,
      duplicates,
      journeysWithoutStart: missingStarts,
      inconsistentJourneys: inconsistent,
      unlinkedReflections,
      participantCodesWithMultipleBrowsers: [...codes.values()].filter(
        (s) => s.size > 1,
      ).length,
    },
    codeTargets: {
      firstObservedNewExperienceCompletion: ratio(
        first.filter(({ owner, first }) =>
          owner.starts.some(
            (s) =>
              s.saved &&
              s.time >= first.time &&
              s.track === first.track &&
              s.contentVersion === first.contentVersion,
          ),
        ).length,
        first.length,
      ),
      twoRolesAndNextAction: ratio(
        first.filter((x) => x.owner.savedTracks.size >= 2 && x.owner.action)
          .length,
        first.length,
      ),
    },
    readyComparisonSessions: readyComparisons.size,
    perRole: [...roles.values()].sort((a, b) =>
      `${a.surface}:${a.track}:${a.contentVersion}`.localeCompare(
        `${b.surface}:${b.track}:${b.contentVersion}`,
      ),
    ),
    note: "끝 이벤트가 없는 체험은 이탈로 단정하지 않습니다. 명확성 변화와 7일 후 시작 여부는 별도 파일럿 양식으로 확인합니다.",
  };
}
