// Optional real PostgreSQL/CAS check. Synthetic future-period ledger only, no AI
// request and no real current-period budget/learner records are read or changed.
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { createAiBudgetStorage } from "../lib/ai-budget-store.ts";
import { budgetPolicy } from "../lib/ai-budget.ts";
if (process.env.LAB_BUDGET_NEON_TEST !== "1")
  throw new Error("Explicit LAB_BUDGET_NEON_TEST=1 is required");
const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url)
  throw new Error("A configured Neon database and migration 003 are required");
const sql = neon(url),
  period = "2999-01",
  ids = Array.from({ length: 8 }, () => crypto.randomUUID());
const query = (text, values) =>
  sql.query(text, values, {
    fetchOptions: { signal: AbortSignal.timeout(6000) },
  });
const store = createAiBudgetStorage(query, () =>
  Date.parse(period + "-15T00:00:00Z"),
);
let ownFixture = false,
  failed = false;
try {
  const existing = await query(
    "SELECT period FROM ai_budget_ledger WHERE period=$1",
    [period],
  );
  if (existing.length)
    throw new Error(
      "QA fixture period already exists; inspect it before rerunning",
    );
  ownFixture = true;
  const policy = {
    ...budgetPolicy("gpt-4.1-mini", {}),
    dailyUnits: 500,
    monthlyUnits: 500,
    pricingVersion: "qa-budget-smoke",
  };
  const leases = (
    await Promise.all(ids.map((id) => store.reserveAiBudget(id, 100, policy)))
  ).filter(Boolean);
  assert.equal(leases.length, 5);
  assert.equal((await store.readAiBudget()).monthlyAccountedUsd, 0.0000005);
  await Promise.all(leases.map((l) => store.finishAiBudget(l, 10)));
  assert.equal((await store.readAiBudget()).monthlyAccountedUsd, 0.00000005);
  console.log(
    "PASS Neon: concurrent daily/monthly reservation and independent settlement preserve totals",
  );
} catch {
  failed = true;
  console.error(
    "Budget Neon fixture check failed. Confirm migration 003 and inspect the synthetic 2999-01 QA period; no model calls were made.",
  );
} finally {
  if (ownFixture) {
    try {
      const [row] = await query(
        "SELECT state FROM ai_budget_ledger WHERE period=$1",
        [period],
      );
      const state = row
        ? typeof row.state === "string"
          ? JSON.parse(row.state)
          : row.state
        : null;
      if (state && Object.keys(state.entries).every((id) => ids.includes(id))) {
        await query(
          "DELETE FROM ai_budget_ledger WHERE period=$1 AND state=$2",
          [period, JSON.stringify(state)],
        );
      } else if (state) {
        failed = true;
        console.error(
          "QA period contains unrecognized reservations; it was preserved.",
        );
      }
    } catch {
      failed = true;
      console.error("Synthetic QA ledger cleanup needs operator verification.");
    }
  }
}
if (failed) process.exitCode = 1;
