import { z } from "zod";
import { missionById } from "./mission-catalog.ts";
export const ANALYTICS_VERSION = 1;
export const GAME_ANALYTICS_VERSION = "games-2026-11-23.2";
export const formalPilotCodes = [
  "P01",
  "P02",
  "P03",
  "P04",
  "P05",
  "P06",
  "P07",
  "P08",
  "P09",
  "P10",
  "P11",
  "P12",
] as const;
export const prepilotCodes = ["S01", "S02", "S03"] as const;
export const pilotCodes = [
  ...prepilotCodes,
  ...formalPilotCodes,
  "QA",
] as const;
export type AnalyticsCohort = "all" | "pilot" | "prepilot" | "general";
export function participantCohort(code: string | null) {
  if (code === null) return "general";
  if (code === "QA") return "qa";
  if (prepilotCodes.some((candidate) => candidate === code)) return "prepilot";
  if (formalPilotCodes.some((candidate) => candidate === code)) return "pilot";
  return "unknown";
}
export const trackSchema = z.enum([
  "frontend",
  "backend",
  "data",
  "ai",
  "security",
  "cloud",
]);
const action = z.enum([
  "foundation",
  "extend",
  "study",
  "explore",
  "broader",
  "review",
]);
const context = z
  .object({
    journeyId: z.string().uuid(),
    surface: z.enum(["code", "game"]),
    track: trackSchema,
    contentVersion: z.string().max(80),
  })
  .strict()
  .refine(
    (c) =>
      c.surface === "game"
        ? c.contentVersion === GAME_ANALYTICS_VERSION
        : !!missionById(c.track, c.contentVersion),
    "Unknown experience version",
  );
const base = {
  version: z.literal(ANALYTICS_VERSION),
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
};
const elapsed = z.number().int().min(0).max(3600000);
const withContext = { ...base, context };
export const analyticsEventSchema = z
  .discriminatedUnion("name", [
    z
      .object({
        ...withContext,
        name: z.literal("mission_start"),
        data: z.object({ entry: z.enum(["new", "resume"]) }).strict(),
      })
      .strict(),
    z
      .object({
        ...withContext,
        name: z.literal("run_result"),
        data: z
          .object({
            executionId: z.string().uuid(),
            kind: z.enum(["edited", "starter", "reference", "unverified"]),
            passed: z.number().int().min(0).max(5),
            total: z.number().int().min(0).max(5),
            outcome: z.enum(["checks", "error"]),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...withContext,
        name: z.literal("help_open"),
        data: z
          .object({
            kind: z.enum([
              "primer",
              "basic_hint",
              "reference",
              "line_locator",
              "ai_request",
            ]),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...withContext,
        name: z.literal("ai_result"),
        data: z
          .object({
            source: z.enum(["ai", "guide", "none"]),
            outcome: z.enum(["received", "failed", "canceled"]),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...withContext,
        name: z.literal("reflection_submit"),
        data: z.object({ executionId: z.string().uuid() }).strict(),
      })
      .strict(),
    z
      .object({
        ...withContext,
        name: z.literal("reflection_saved"),
        data: z.object({ executionId: z.string().uuid() }).strict(),
      })
      .strict(),
    z
      .object({
        ...withContext,
        name: z.literal("next_action_selected"),
        data: z.object({ kind: action, targetTrack: trackSchema }).strict(),
      })
      .strict(),
    z
      .object({
        ...withContext,
        name: z.literal("next_action_committed"),
        data: z
          .object({
            kind: action,
            targetTrack: trackSchema,
            executionId: z.string().uuid(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...withContext,
        name: z.literal("mission_end"),
        data: z
          .object({
            outcome: z.enum(["left", "submitted", "completed"]),
            elapsedMs: elapsed,
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...base,
        name: z.literal("page_view"),
        data: z
          .object({
            page: z.enum([
              "home",
              "work",
              "journal",
              "compare",
              "guide",
              "games",
            ]),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...base,
        name: z.literal("comparison_view"),
        data: z
          .object({ completedCount: z.number().int().min(0).max(6) })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...withContext,
        name: z.literal("game_check"),
        data: z.object({ passed: z.boolean() }).strict(),
      })
      .strict(),
  ])
  .superRefine((event, ctx) => {
    if (
      event.name === "run_result" &&
      (event.context.surface !== "code" || event.data.passed > event.data.total)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid run summary",
      });
    if (
      event.name === "mission_end" &&
      ((event.context.surface === "code" &&
        event.data.outcome === "completed") ||
        (event.context.surface === "game" &&
          event.data.outcome === "submitted"))
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid completion surface",
      });
    if (event.name === "game_check" && event.context.surface !== "game")
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid game check",
      });
    if (
      [
        "reflection_submit",
        "reflection_saved",
        "next_action_selected",
        "next_action_committed",
        "ai_result",
        "help_open",
      ].includes(event.name) &&
      "context" in event &&
      event.context.surface !== "code"
    )
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Code-only event" });
  });
export const consentSchema = z
  .object({
    enabled: z.boolean(),
    participantCode: z.enum(pilotCodes).nullable(),
  })
  .strict();
export const eventBatchSchema = z
  .object({
    token: z.string().uuid(),
    events: z.array(analyticsEventSchema).min(1).max(20),
  })
  .strict();
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export type Journey = z.infer<typeof context>;
export type ParticipantCode = (typeof pilotCodes)[number] | null;
export type AnalyticsConsent = {
  enabled: boolean;
  token: string | null;
  participantCode: ParticipantCode;
};
