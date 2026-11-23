import { LEGACY_CONTENT_VERSION, missionById } from "./missions.ts";
import type {
  ExecutionSnapshot,
  LabState,
  Mission,
  Profile,
  Progress,
  RunResult,
} from "./missions.ts";

type AnswerField = "experience" | "purpose";
const sourceKey = (field: AnswerField) => `${field}Source` as const;
export function normalizeProfile(input: unknown): Profile {
  const raw = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >;
  const answer = (field: AnswerField) => {
    const value =
      typeof raw[field] === "string" ? (raw[field] as string).trim() : null;
    const source = raw[sourceKey(field)];
    if (value && source === "self_reported")
      return { value, source: "self_reported" as const };
    if (value && source !== "unknown")
      return { value, source: "legacy_unverified" as const };
    return { value: null, source: "unknown" as const };
  };
  const experience = answer("experience"),
    purpose = answer("purpose");
  return {
    experience: experience.value,
    experienceSource: experience.source,
    purpose: purpose.value,
    purposeSource: purpose.source,
    aiConsent: raw.aiConsent === true,
  };
}
export function profileAnswer(
  profile: unknown,
  field: AnswerField,
): string | null {
  const normalized = normalizeProfile(profile);
  return normalized[sourceKey(field)] === "self_reported"
    ? normalized[field]
    : null;
}
export function profileAnswerLabel(
  profile: unknown,
  field: AnswerField,
): string {
  const normalized = normalizeProfile(profile);
  return (
    profileAnswer(normalized, field) ??
    (normalized[sourceKey(field)] === "legacy_unverified"
      ? "이전 기록 · 미확인"
      : "미응답")
  );
}
export function updateProfileAnswer(
  profile: unknown,
  field: AnswerField,
  value: string,
): Profile {
  return {
    ...normalizeProfile(profile),
    [field]: value.trim() || null,
    [sourceKey(field)]: value.trim() ? "self_reported" : "unknown",
  };
}
export function normalizeLabState(state: LabState): LabState {
  return {
    ...state,
    ...(state.profile ? { profile: normalizeProfile(state.profile) } : {}),
    progress: Object.fromEntries(
      Object.entries(state.progress).map(([id, p]) => [
        id,
        p
          ? {
              ...p,
              contentVersion: p.contentVersion ?? LEGACY_CONTENT_VERSION,
              contentVersionSource: p.contentVersion
                ? (p.contentVersionSource ?? "started")
                : "legacy_baseline",
              codeRevision: p.codeRevision ?? 0,
              codeSource: p.codeSource ?? "legacy",
            }
          : p,
      ]),
    ),
  };
}
// Full-state autosaves may edit work, but cannot rebind or silently remove a
// started session. Explicit deletion uses DELETE /api/state.
export function keepsStartedVersions(
  before: LabState | null,
  after: LabState,
): boolean {
  return Object.entries(before?.progress ?? {}).every(([id, previous]) => {
    const next = after.progress[id as keyof LabState["progress"]];
    return (
      !previous ||
      (!!next &&
        (previous.contentVersion ?? LEGACY_CONTENT_VERSION) ===
          (next.contentVersion ?? LEGACY_CONTENT_VERSION))
    );
  });
}
export function changeCode(
  progress: Progress,
  code: string,
  source: "user" | "reference" | "starter",
): Partial<Progress> {
  return {
    code,
    codeRevision: (progress.codeRevision ?? 0) + 1,
    codeSource: source,
    result: undefined,
  };
}
export function currentExecution(
  progress: Progress,
): ExecutionSnapshot | undefined {
  return progress.lastExecution?.revision === (progress.codeRevision ?? 0) &&
    progress.lastExecution?.contentVersion === progress.contentVersion
    ? progress.lastExecution
    : undefined;
}
export function canRecordAttempt(progress: Progress): boolean {
  return currentExecution(progress)?.kind === "edited";
}
function hasEditedReflectionExecution(progress: Progress | undefined): boolean {
  const execution = progress?.reflection?.execution;
  return (
    execution?.kind === "edited" &&
    !!execution.contentVersion &&
    execution.contentVersion === progress?.contentVersion &&
    !!execution.missionId &&
    !!missionById(execution.missionId, execution.contentVersion)
  );
}
export function isCompleted(progress: Progress | undefined): boolean {
  const reflection = progress?.reflection;
  return (
    hasEditedReflectionExecution(progress) &&
    typeof reflection?.note === "string" &&
    !!reflection.note.trim() &&
    [reflection.interest, reflection.difficulty, reflection.again].every(
      (score) => Number.isInteger(score) && score >= 1 && score <= 5,
    )
  );
}
export function recordStatus(progress: Progress): string {
  if (isCompleted(progress)) return "체험 완료";
  if (hasEditedReflectionExecution(progress))
    return "이전 기록 · 회고 확인 필요";
  if (
    progress.reflection?.execution &&
    !progress.reflection.execution.contentVersion
  )
    return "이전 기록 · 과제 기준 미확인";
  if (progress.reflection) return "이전 기록 · 실행 미확인";
  return "진행 중";
}
export async function snapshotExecution(
  progress: Progress,
  mission: Mission,
  result: RunResult,
  executedAt: string,
  previewArgs: unknown[] = mission.previewArgs,
): Promise<ExecutionSnapshot> {
  if (progress.contentVersion !== mission.contentVersion)
    throw Error("CONTENT_VERSION_MISMATCH");
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(progress.code),
  );
  const kind =
    progress.code === mission.starter
      ? "starter"
      : progress.codeSource === "user"
        ? "edited"
        : progress.codeSource === "reference"
          ? "reference"
          : "unverified";
  return {
    id: crypto.randomUUID(),
    contentVersion: mission.contentVersion,
    missionId: mission.id,
    codeHash: Array.from(new Uint8Array(bytes), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
    revision: progress.codeRevision ?? 0,
    kind,
    executedAt,
    previewArgs,
    result,
  };
}
