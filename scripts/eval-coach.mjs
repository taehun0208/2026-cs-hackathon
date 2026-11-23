// Explicit opt-in: at most 36 cases x 2 repeats / 216 provider requests. Uses
// in-memory evaluation records only, never reads or mutates a learner's DB.
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createAiBudgetStorage } from "../lib/ai-budget-store.ts";
import { getHint } from "../lib/coach.ts";
import { coachGuides } from "../lib/coach-guides.ts";
import { missionById } from "../lib/missions.ts";
import { holdoutCases } from "../tests/fixtures/coach-routing-holdout.mjs";
import { qualityCases } from "../tests/fixtures/coach-quality.mjs";
if (!process.argv.includes("--live"))
  throw Error("Explicit --live opt-in required");
if (!process.env.OPENAI_API_KEY)
  throw Error("OPENAI_API_KEY is not configured");
const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const suite =
  process.argv.find((a) => a.startsWith("--suite="))?.split("=")[1] ??
  "original";
if (!["original", "holdout"].includes(suite))
  throw Error("suite must be original or holdout");
const pool = suite === "original" ? qualityCases : holdoutCases;
const repeat = Number(
  process.argv.find((a) => a.startsWith("--repeat="))?.split("=")[1] ?? 1,
);
if (![1, 2].includes(repeat)) throw Error("repeat must be 1 or 2");
const limit = Number(
  process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ??
    pool.length,
);
if (!Number.isInteger(limit) || limit < 1 || limit > pool.length)
  throw Error(`limit must be 1..${pool.length}`);
const cases = Array.from({ length: repeat }, (_, i) =>
  pool.slice(0, limit).map((c) => ({ ...c, repetition: i + 1 })),
).flat();
const rows = [],
  usage = [],
  reservations = new Map();
const budgetDb = new DatabaseSync(":memory:");
budgetDb.exec(
  await readFile(
    new URL("../migrations/003_ai_budget.sql", import.meta.url),
    "utf8",
  ),
);
const evalBudget = createAiBudgetStorage(async (text, values) =>
  budgetDb.prepare(text.replace(/\$\d+/g, "?")).all(...values),
);
const storage = {
  ...evalBudget,
  read: async () => ({ state: { profile: { aiConsent: true } } }),
  reserve: async (owner, track) => {
    const key = `${owner}:${track}`,
      count = reservations.get(key) ?? 0;
    if (count >= 6) return false;
    reservations.set(key, count + 1);
    return true;
  },
  logUsage: async (u) => usage.push(u),
};
const digest = async (paths) => {
  const hash = createHash("sha256");
  for (const path of paths)
    hash.update(await readFile(new URL(path, import.meta.url)));
  return hash.digest("hex");
};
const implementationPaths = [
  "../lib/coach.ts",
  "../lib/ai-budget.ts",
  "../lib/ai-budget-store.ts",
  "../lib/coach-guides.ts",
  "../lib/coach-routing.ts",
  "../lib/missions.ts",
  "../lib/mission-catalog.ts",
  "../lib/content/2026-11-23.1.ts",
  "../lib/content/manifest.json",
];
const fixturePaths = [
  suite === "original"
    ? "../tests/fixtures/coach-quality.mjs"
    : "../tests/fixtures/coach-routing-holdout.mjs",
];
const implementationDigest = await digest(implementationPaths);
const fixtureDigest = await digest(fixturePaths);
for (const c of cases) {
  const started = Date.now();
  const result = await getHint(
    {
      track: c.track,
      contentVersion: missionById(c.track).contentVersion,
      code: c.code,
      question: c.question,
      level: c.level,
      tests: c.tests ?? [],
    },
    `evaluation:${suite}:${c.id}`,
    storage,
    {
      apiKey: process.env.OPENAI_API_KEY,
      model,
    },
  );
  const m = missionById(c.track);
  const g = coachGuides(m).find((g) => g.id === result.guideId);
  const safe =
    result.source === "guide"
      ? m.hints.includes(result.message)
      : !!g && result.message === g.message && result.references?.length > 0;
  const relevant =
    result.source === "ai" && c.expectedGuideIds.includes(result.guideId);
  rows.push({
    id: c.id,
    repetition: c.repetition,
    intent: result.intent ?? null,
    contentVersion: result.contentVersion ?? null,
    source: result.source,
    guideId: result.guideId ?? null,
    expectedGuideIds: c.expectedGuideIds,
    safe,
    relevant,
    latencyMs: Date.now() - started,
  });
  console.log(JSON.stringify(rows.at(-1)));
}
const report = {
  implementationDigest,
  fixtureDigest,
  unchangedDuringRun:
    implementationDigest === (await digest(implementationPaths)) &&
    fixtureDigest === (await digest(fixturePaths)),
  suite,
  repeat,
  distinctCaseCount: limit,
  evaluatedAt: new Date().toISOString(),
  model,
  caseCount: rows.length,
  safeCount: rows.filter((r) => r.safe).length,
  relevantCount: rows.filter((r) => r.relevant).length,
  fallbackCount: rows.filter((r) => r.source === "guide").length,
  inputTokens: usage.reduce((n, u) => n + u.inputTokens, 0),
  outputTokens: usage.reduce((n, u) => n + u.outputTokens, 0),
  note: "This process uses an isolated in-memory daily/monthly budget and does not share the production ledger. Synthetic fixtures only. Safe fallback is not counted as successful model selection. No raw provider response, learner data or credential is recorded. This single run does not guarantee future relevance.",
  cases: rows,
};
await mkdir(new URL("../docs/evals/", import.meta.url), { recursive: true });
await writeFile(
  new URL(
    suite === "original"
      ? "../docs/evals/coach-quality-latest.json"
      : "../docs/evals/coach-routing-holdout.json",
    import.meta.url,
  ),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    caseCount: report.caseCount,
    safeCount: report.safeCount,
    relevantCount: report.relevantCount,
    fallbackCount: report.fallbackCount,
  }),
);
if (
  !report.unchangedDuringRun ||
  report.safeCount !== rows.length ||
  report.relevantCount !== rows.length
)
  process.exitCode = 1;
