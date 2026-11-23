import { z } from "zod";
import { normalizeProfile, normalizeLabState } from "./lab-state.ts";
import { validNextActionPlan } from "./next-actions.ts";
export { getStorage } from "./storage.ts";

const test = z.object({
  label: z.string().max(200),
  passed: z.boolean(),
  why: z.string().max(600),
  actual: z.unknown().optional(),
  expected: z.unknown().optional(),
  error: z.string().max(1000).optional(),
});
const runResult = z.object({
  tests: z.array(test).max(5),
  preview: z.unknown(),
  error: z.string().max(2000).optional(),
});
const execution = z.object({
  contentVersion: z.string().min(1).max(80).optional(),
  missionId: z
    .enum(["frontend", "backend", "data", "ai", "security", "cloud"])
    .optional(),
  id: z.string().uuid(),
  codeHash: z.string().regex(/^[0-9a-f]{64}$/),
  executedAt: z.string().datetime(),
  revision: z.number().int().min(0),
  kind: z.enum(["edited", "reference", "starter", "unverified"]),
  previewArgs: z.array(z.unknown()).max(5).optional(),
  result: runResult,
});
const track = z.enum([
  "frontend",
  "backend",
  "data",
  "ai",
  "security",
  "cloud",
]);
const score = z.number().int().min(1).max(5);
const nextPlan = z.object({
  ruleVersion: z.string().min(1).max(80),
  track,
  contentVersion: z.string().min(1).max(80),
  executionId: z.string().uuid(),
  ratings: z.object({ interest: score, difficulty: score, again: score }),
  context: z.object({
    completed: z
      .array(z.object({ track, interest: score }))
      .min(1)
      .max(6),
    availableTracks: z.array(track).max(5),
  }),
  ruleId: z.enum([
    "foundation-first",
    "extend",
    "study",
    "explore",
    "broader",
    "revisit",
    "review",
  ]),
  reason: z.string().min(1).max(500),
  candidates: z
    .array(
      z.object({
        id: z.string().max(100),
        kind: z.enum([
          "foundation",
          "extend",
          "study",
          "explore",
          "broader",
          "review",
        ]),
        track,
        title: z.string().min(1).max(200),
      }),
    )
    .min(1)
    .max(6),
  selectedId: z.string().min(1).max(100),
  selectionReason: z.string().trim().min(1).max(300),
});
const reflection = z.object({
  nextPlan: nextPlan.optional(),
  interest: z.number().int().min(1).max(5),
  difficulty: z.number().int().min(1).max(5),
  again: z.number().int().min(1).max(5),
  note: z.string().max(2000),
  next: z.string().max(300),
  endedAt: z.string().datetime(),
  execution: execution.optional(),
});
const progress = z.object({
  version: z.literal(1),
  contentVersion: z.string().min(1).max(80).optional(),
  contentVersionSource: z.enum(["started", "legacy_baseline"]).optional(),
  code: z.string().max(20000),
  runs: z.number().int().min(0).max(100000),
  codeRevision: z.number().int().min(0).optional(),
  codeSource: z.enum(["user", "reference", "starter", "legacy"]).optional(),
  lastExecution: execution.optional(),
  hintLevel: z.number().int().min(0).max(3),
  usedSolution: z.boolean(),
  result: runResult.optional(),
  reflection: reflection.optional(),
  updatedAt: z.string().datetime(),
});
export const stateSchema = z
  .object({
    version: z.literal(1),
    games: z
      .record(
        track,
        z.object({
          version: z.literal(1),
          completedAt: z.string().datetime(),
          updatedAt: z.string().datetime(),
          interest: score.optional(),
        }),
      )
      .optional(),
    profile: z
      .object({
        experience: z.string().max(120).nullable().optional(),
        experienceSource: z
          .enum(["self_reported", "unknown", "legacy_unverified"])
          .optional(),
        purpose: z.string().max(200).nullable().optional(),
        purposeSource: z
          .enum(["self_reported", "unknown", "legacy_unverified"])
          .optional(),
        aiConsent: z.boolean(),
      })
      .transform(normalizeProfile)
      .optional(),
    progress: z.object({
      frontend: progress.optional(),
      backend: progress.optional(),
      data: progress.optional(),
      ai: progress.optional(),
      security: progress.optional(),
      cloud: progress.optional(),
    }),
  })
  .superRefine((state, ctx) => {
    for (const [id, p] of Object.entries(state.progress)) {
      const r = p?.reflection;
      if (
        r?.nextPlan &&
        !validNextActionPlan(
          r.nextPlan,
          r,
          id as z.infer<typeof track>,
          p?.contentVersion,
        )
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["progress", id, "reflection", "nextPlan"],
          message:
            "Next activity must match its saved reflection and reviewed rules",
        });
    }
  })
  .transform(normalizeLabState);
export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}
export function sameOrigin(req: Request) {
  try {
    const raw = req.headers.get("Origin");
    if (!raw) return false;
    const origin = new URL(raw);
    // Next may normalize req.url to an internal hostname. Host retains the
    // browser-facing authority; browsers cannot forge Host on a cross-site POST.
    const host = req.headers.get("host") ?? new URL(req.url).host;
    return (
      raw === origin.origin &&
      origin.host === host &&
      (process.env.NODE_ENV === "production"
        ? origin.protocol === "https:"
        : ["https:", "http:"].includes(origin.protocol)) &&
      !!req.headers.get("Content-Type")?.includes("application/json")
    );
  } catch {
    return false;
  }
}
export function identity(req: Request, rotate = false, renew = false) {
  // Vercel does not authenticate the Sites headers. Never trust them as identity.
  const secure = process.env.NODE_ENV === "production";
  const name = secure ? "__Host-lab_session" : "lab_session";
  const raw = req.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + "="))
    ?.slice(name.length + 1);
  const valid =
    !rotate &&
    raw &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      raw,
    );
  const id = valid ? raw : crypto.randomUUID();
  return {
    key: "guest:" + id,
    cookie:
      valid && !renew
        ? ""
        : `${name}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure ? "; Secure" : ""}`,
  };
}
export async function readBody(req: Request, limit = 100000) {
  const raw = await req.text();
  if (raw.length > limit)
    throw new Error("입력이 너무 길어요. 코드를 줄여주세요.");
  return JSON.parse(raw);
}
