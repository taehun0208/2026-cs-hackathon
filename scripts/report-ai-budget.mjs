// Operator-only aggregate report. Never prints connection URLs, credentials,
// request IDs, owner identities or learner content. Does not make model calls.
import fs from "node:fs";
import { createAiBudgetStorage } from "../lib/ai-budget-store.ts";
import { budgetPolicy, reservationUnits, usd } from "../lib/ai-budget.ts";
if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
const args = process.argv.slice(2);
const get = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  policy = budgetPolicy(model);
if (!policy) {
  console.log(
    JSON.stringify(
      {
        enabled: false,
        configurationValid: false,
        model,
        reason: "unsupported_model_or_invalid_budget_configuration",
        action:
          "기본 힌트만 사용합니다. 모델과 AI_DAILY_BUDGET_USD / AI_MONTHLY_BUDGET_USD를 확인하세요.",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} else {
  let query, db;
  const sqlite = get("--sqlite");
  if (sqlite) {
    const { DatabaseSync } = await import("node:sqlite");
    db = new DatabaseSync(sqlite, { readOnly: true });
    query = async (text, values) =>
      db.prepare(text.replace(/\$\d+/g, "?")).all(...values);
  } else {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!url)
      throw new Error(
        "Database is not configured; use --sqlite for a local QA ledger",
      );
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    query = (text, values) =>
      sql.query(text, values, {
        fetchOptions: { signal: AbortSignal.timeout(6000) },
      });
  }
  try {
    const summary = await createAiBudgetStorage(query).readAiBudget();
    const period = (accounted, limit) => ({
      accountedUsd: accounted,
      limitUsd: usd(limit),
      remainingUsd: Number(Math.max(0, usd(limit) - accounted).toFixed(9)),
      warning80Percent: limit > 0 && accounted >= usd(limit) * 0.8,
      blockedForNextMaximumRequest:
        accounted + usd(reservationUnits(policy)) > usd(limit),
    });
    const daily = period(summary.dailyAccountedUsd, policy.dailyUnits);
    const monthly = period(summary.monthlyAccountedUsd, policy.monthlyUnits);
    console.log(
      JSON.stringify(
        {
          enabled:
            !daily.blockedForNextMaximumRequest &&
            !monthly.blockedForNextMaximumRequest,
          configurationValid: true,
          model,
          currency: "USD",
          pricingVersion: policy.pricingVersion,
          day: summary.day,
          month: summary.period,
          daily,
          monthly,
          settledUsd: summary.settledUsd,
          retainedReserveUsd: summary.retainedReserveUsd,
          pendingCount: summary.pendingCount,
          uncertainCount: summary.uncertainCount,
          maximumRequestReserveUsd: usd(reservationUnits(policy)),
          note: "앱 원장의 추정·예약 합계입니다. 공급자 청구서나 프로젝트 전체 사용액이 아닙니다. 80% 경고는 이 보고서로 확인하며 자동 연락은 보내지 않습니다.",
        },
        null,
        2,
      ),
    );
  } catch {
    throw new Error(
      "AI budget ledger is unavailable. Apply migration 003 and verify the server database configuration.",
    );
  } finally {
    db?.close();
  }
}
