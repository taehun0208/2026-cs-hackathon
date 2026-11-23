export type TrackId =
  "frontend" | "backend" | "data" | "ai" | "security" | "cloud";
export type TestCase = {
  label: string;
  why: string;
  args: unknown[];
  expected: unknown;
};
export type MissionGuide = {
  id: string;
  message: string;
  requirementIds: string[];
  checkIds: string[];
  nextAction: "edit" | "inspect";
};
export type Mission = {
  practice?: {
    firstAction: string;
    focus: string;
    example: { input: string; outcome: string };
    primer: string;
  };
  contentVersion: string;
  guides: MissionGuide[];
  id: TrackId;
  title: string;
  action: string;
  description: string;
  color: string;
  time: string;
  fn: string;
  starter: string;
  solution: string;
  brief: string;
  steps: string[];
  concepts: string[];
  hints: string[];
  next: string[];
  tests: TestCase[];
  previewArgs: unknown[];
};
export {
  missions,
  missionById,
  canStartMission,
  LEGACY_CONTENT_VERSION,
} from "./mission-catalog.ts";
export { events, rows } from "./content/2026-11-23.1.ts";
export type TestResult = {
  label: string;
  passed: boolean;
  why: string;
  actual?: unknown;
  expected?: unknown;
  error?: string;
};
export type RunResult = {
  tests: TestResult[];
  preview?: unknown;
  error?: string;
};
export type ExecutionSnapshot = {
  contentVersion?: string;
  missionId?: TrackId;
  id: string;
  codeHash: string;
  executedAt: string;
  revision: number;
  kind: "edited" | "reference" | "starter" | "unverified";
  previewArgs?: unknown[];
  result: RunResult;
};
export type AnswerSource = "self_reported" | "unknown" | "legacy_unverified";
export type Profile = {
  experience: string | null;
  experienceSource: AnswerSource;
  purpose: string | null;
  purposeSource: AnswerSource;
  aiConsent: boolean;
};
export type NextActionCandidate = {
  id: string;
  kind: "foundation" | "extend" | "study" | "explore" | "broader" | "review";
  track: TrackId;
  title: string;
};
export type NextActionPlan = {
  ruleVersion: string;
  track: TrackId;
  contentVersion: string;
  executionId: string;
  ratings: { interest: number; difficulty: number; again: number };
  context: {
    completed: { track: TrackId; interest: number }[];
    availableTracks: TrackId[];
  };
  ruleId:
    | "foundation-first"
    | "extend"
    | "study"
    | "explore"
    | "broader"
    | "revisit"
    | "review";
  reason: string;
  candidates: NextActionCandidate[];
  selectedId: string;
  selectionReason: string;
};
export type Reflection = {
  nextPlan?: NextActionPlan;
  interest: number;
  difficulty: number;
  again: number;
  note: string;
  next: string;
  endedAt: string;
  execution?: ExecutionSnapshot;
};
export type Progress = {
  version: 1;
  contentVersion?: string;
  contentVersionSource?: "started" | "legacy_baseline";
  code: string;
  runs: number;
  codeRevision?: number;
  codeSource?: "user" | "reference" | "starter" | "legacy";
  lastExecution?: ExecutionSnapshot;
  hintLevel: number;
  usedSolution: boolean;
  result?: RunResult;
  reflection?: Reflection;
  updatedAt: string;
};
export type GameRecord = {
  version: 1;
  completedAt: string;
  updatedAt: string;
  interest?: number;
};
export type LabState = {
  version: 1;
  profile?: Profile;
  progress: Partial<Record<TrackId, Progress>>;
  games?: Partial<Record<TrackId, GameRecord>>;
};
export const emptyState = (): LabState => ({ version: 1, progress: {} });
export const initialProgress = (m: Mission): Progress => ({
  version: 1,
  contentVersion: m.contentVersion,
  contentVersionSource: "started",
  code: m.starter,
  runs: 0,
  codeRevision: 0,
  codeSource: "starter",
  hintLevel: 0,
  usedSolution: false,
  updatedAt: new Date().toISOString(),
});
