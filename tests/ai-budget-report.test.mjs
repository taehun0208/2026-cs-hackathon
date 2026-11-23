import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
const run = (args, env) =>
  spawnSync(process.execPath, ["scripts/report-ai-budget.mjs", ...args], {
    encoding: "utf8",
    cwd: new URL("../", import.meta.url),
    env: {
      ...process.env,
      OPENAI_MODEL: "gpt-4.1-mini",
      AI_DAILY_BUDGET_USD: "1",
      AI_MONTHLY_BUDGET_USD: "1",
      ...env,
    },
  });
test("operator report distinguishes 80% warnings, next-request blocking and aggregates without exporting internal request IDs", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haebogi-budget-report-")),
    file = path.join(dir, "qa.sqlite");
  let db;
  try {
    db = new DatabaseSync(file);
    db.exec(
      fs.readFileSync(
        new URL("../migrations/003_ai_budget.sql", import.meta.url),
        "utf8",
      ),
    );
    const day = new Date().toISOString().slice(0, 10),
      id = crypto.randomUUID();
    db.prepare("INSERT INTO ai_budget_ledger VALUES (?,0,?,0)").run(
      day.slice(0, 7),
      JSON.stringify({
        version: 1,
        entries: {
          [id]: {
            day,
            reservedUnits: 900000000,
            chargedUnits: 900000000,
            status: "settled",
            pricingVersion: "qa",
          },
        },
      }),
    );
    db.close();
    db = null;
    const result = run(["--sqlite", file]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.configurationValid, true);
    assert.equal(report.enabled, false);
    assert.equal(report.daily.warning80Percent, true);
    assert.equal(report.monthly.warning80Percent, true);
    assert.equal(report.daily.remainingUsd, 0.1);
    assert.equal(report.monthly.blockedForNextMaximumRequest, true);
    assert.ok(!result.stdout.includes(id));
  } finally {
    db?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("invalid model and budget reports are explicitly disabled without attempting database access", () => {
  for (const env of [
    { OPENAI_MODEL: "unknown" },
    { AI_DAILY_BUDGET_USD: "NaN" },
  ]) {
    const r = run([], env);
    assert.equal(r.status, 1);
    const report = JSON.parse(r.stdout);
    assert.equal(report.enabled, false);
    assert.equal(report.configurationValid, false);
    assert.match(report.reason, /unsupported_model_or_invalid/);
  }
});
