import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import {
  budgetPolicy,
  parseUsd,
  reservationUnits,
  usageUnits,
  USD_UNITS,
  MAX_PROVIDER_PAYLOAD_BYTES,
} from "../lib/ai-budget.ts";
import { createAiBudgetStorage } from "../lib/ai-budget-store.ts";
import { getHint } from "../lib/coach.ts";
import { missionById } from "../lib/missions.ts";
function fixture({ day = "2026-11-23T00:00:00Z", intercept } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(
    fs.readFileSync(
      new URL("../migrations/003_ai_budget.sql", import.meta.url),
      "utf8",
    ),
  );
  let clock = Date.parse(day);
  const query = async (text, values) => {
    if (intercept) await intercept(text, values);
    return db.prepare(text.replace(/\$\d+/g, "?")).all(...values);
  };
  return {
    db,
    query,
    store: createAiBudgetStorage(query, () => clock),
    advance: (ms) => (clock += ms),
  };
}
const policy = (daily = 1, monthly = 10) =>
  budgetPolicy("gpt-4.1-mini", {
    AI_DAILY_BUDGET_USD: String(daily),
    AI_MONTHLY_BUDGET_USD: String(monthly),
  });
const baseInput = () => {
  const m = missionById("frontend");
  return {
    track: m.id,
    contentVersion: m.contentVersion,
    code: m.starter,
    question: "어떻게 시작하나요?",
    level: 0,
    tests: [],
  };
};
function coachStore(budget) {
  return {
    ...budget,
    read: async () => ({ state: { profile: { aiConsent: true } } }),
    reserve: async () => true,
    logUsage: async () => {},
  };
}
function provider({ usage = true, failAt, inspect = () => {} } = {}) {
  let calls = 0;
  const fetcher = async (_, opts) => {
    const p = JSON.parse(opts.body);
    const round = calls++;
    inspect(p, opts);
    if (round === failAt) throw new Error("unconfirmed transport");
    const name = ["read_mission", "inspect_checks"][round];
    return Response.json({
      choices: [
        {
          message: name
            ? {
                tool_calls: [
                  {
                    id: "call" + round,
                    type: "function",
                    function: { name, arguments: "{}" },
                  },
                ],
              }
            : { content: '{"intent":"step"}' },
        },
      ],
      ...(usage ? { usage: { prompt_tokens: 20, completion_tokens: 10 } } : {}),
    });
  };
  return {
    fetcher,
    get calls() {
      return calls;
    },
  };
}
test("prices and decimal USD limits use exact integer units; unknown models and malformed settings fail closed", () => {
  assert.equal(parseUsd("0.000000001"), 1);
  assert.equal(parseUsd("1.25"), 1250000000);
  for (const invalid of [
    "",
    "-1",
    "NaN",
    "Infinity",
    "1e2",
    "1.0000000001",
    "01",
    " 1",
  ])
    assert.equal(parseUsd(invalid), null);
  assert.equal(budgetPolicy("unknown"), null);
  assert.equal(budgetPolicy("gpt-4.1-mini", { AI_DAILY_BUDGET_USD: "" }), null);
  assert.equal(reservationUnits(policy()), 162144000);
  assert.equal(usageUnits(policy(), 1_000_000, 1_000_000), 2 * USD_UNITS);
  assert.equal(usageUnits(policy(), NaN, 1), null);
});
test("concurrent workers atomically respect both daily and monthly holds and persist across new storage instances", async () => {
  const f = fixture();
  try {
    const p = policy();
    p.dailyUnits = 500;
    p.monthlyUnits = 600;
    const results = await Promise.all(
      Array.from({ length: 24 }, () =>
        createAiBudgetStorage(f.query, () =>
          Date.parse("2026-11-23T00:00:00Z"),
        ).reserveAiBudget(crypto.randomUUID(), 100, p),
      ),
    );
    assert.equal(results.filter(Boolean).length, 5);
    assert.equal((await f.store.readAiBudget()).dailyAccountedUsd, 0.0000005);
    f.advance(86400000);
    assert.ok(await f.store.reserveAiBudget(crypto.randomUUID(), 100, p));
    assert.equal(
      await f.store.reserveAiBudget(crypto.randomUUID(), 1, p),
      null,
    );
    assert.equal((await f.store.readAiBudget()).monthlyAccountedUsd, 0.0000006);
  } finally {
    f.db.close();
  }
});
test("confirmed settlement refunds unused holds exactly once; a duplicate ID cannot authorize another request", async () => {
  const f = fixture();
  try {
    const id = crypto.randomUUID(),
      lease = await f.store.reserveAiBudget(id, 100, policy());
    assert.equal(await f.store.reserveAiBudget(id, 100, policy()), null);
    await Promise.all([
      f.store.finishAiBudget(lease, 12),
      f.store.finishAiBudget(lease, 12),
    ]);
    await f.store.finishAiBudget(lease, 0);
    const report = await f.store.readAiBudget();
    assert.equal(report.monthlyAccountedUsd, 0.000000012);
    assert.equal(report.settledCount, 1);
    assert.ok(!JSON.stringify(report).includes(id));
  } finally {
    f.db.close();
  }
});
test("unknown outcomes retain the full hold, and the next UTC day does not erase monthly accounting", async () => {
  const f = fixture();
  try {
    const lease = await f.store.reserveAiBudget(
      crypto.randomUUID(),
      reservationUnits(policy()),
      policy(),
    );
    await f.store.finishAiBudget(lease, null);
    let r = await f.store.readAiBudget();
    assert.equal(r.uncertainCount, 1);
    assert.equal(r.retainedReserveUsd, 0.162144);
    f.advance(86400000);
    r = await f.store.readAiBudget();
    assert.equal(r.dailyAccountedUsd, 0);
    assert.equal(r.monthlyAccountedUsd, 0.162144);
  } finally {
    f.db.close();
  }
});
test("month rollover leaves old holds intact for late settlement and cleanup keeps current plus two prior months", async () => {
  const f = fixture({ day: "2026-11-30T23:59:59Z" });
  try {
    const lease = await f.store.reserveAiBudget(
      crypto.randomUUID(),
      100,
      policy(),
    );
    f.advance(2000);
    assert.equal((await f.store.readAiBudget()).monthlyAccountedUsd, 0);
    await f.store.finishAiBudget(lease, 20);
    for (const month of ["2026-08", "2026-09", "2026-10"])
      f.db
        .prepare("INSERT INTO ai_budget_ledger VALUES (?,0,?,0)")
        .run(month, '{"version":1,"entries":{}}');
    assert.equal(await f.store.cleanupAiBudget(), 2);
    assert.deepEqual(
      f.db
        .prepare("SELECT period FROM ai_budget_ledger ORDER BY period")
        .all()
        .map((r) => r.period),
      ["2026-10", "2026-11"],
    );
  } finally {
    f.db.close();
  }
});
test("zero/invalid/unsupported budgets, a corrupt ledger and storage outage make zero provider requests", async () => {
  const f = fixture();
  try {
    for (const env of [
      { AI_DAILY_BUDGET_USD: "0" },
      { AI_MONTHLY_BUDGET_USD: "0" },
      { AI_DAILY_BUDGET_USD: "bad" },
    ]) {
      const p = provider();
      assert.equal(
        (
          await getHint(baseInput(), "qa", coachStore(f.store), {
            apiKey: "fake",
            model: "gpt-4.1-mini",
            budgetEnv: env,
            fetcher: p.fetcher,
          })
        ).source,
        "guide",
      );
      assert.equal(p.calls, 0);
    }
    const p = provider();
    assert.equal(
      (
        await getHint(baseInput(), "qa", coachStore(f.store), {
          apiKey: "fake",
          model: "unknown",
          fetcher: p.fetcher,
        })
      ).source,
      "guide",
    );
    assert.equal(p.calls, 0);
    for (const budget of [
      {
        ...f.store,
        reserveAiBudget: async () => {
          throw new Error("private DB");
        },
      },
      createAiBudgetStorage(async () => [
        { revision: 0, state: '{"private":"data"}' },
      ]),
    ]) {
      const q = provider();
      const result = await getHint(baseInput(), "qa", coachStore(budget), {
        apiKey: "fake",
        model: "gpt-4.1-mini",
        fetcher: q.fetcher,
      });
      assert.equal(result.source, "guide");
      assert.equal(q.calls, 0);
      assert.ok(!JSON.stringify(result).includes("private"));
    }
  } finally {
    f.db.close();
  }
});
test("three tool requests share one monetary hold and settle summed usage; payload includes the standard tier and output cap", async () => {
  const f = fixture();
  try {
    const p = provider({
      inspect: (payload) => {
        assert.equal(payload.max_completion_tokens, 500);
        assert.equal(payload.service_tier, "default");
        assert.ok(
          Buffer.byteLength(JSON.stringify(payload), "utf8") <=
            MAX_PROVIDER_PAYLOAD_BYTES,
        );
      },
    });
    const result = await getHint(baseInput(), "qa", coachStore(f.store), {
      apiKey: "fake",
      model: "gpt-4.1-mini",
      fetcher: p.fetcher,
    });
    assert.equal(result.source, "ai");
    assert.equal(p.calls, 3);
    const r = await f.store.readAiBudget();
    assert.equal(r.settledCount, 1);
    assert.equal(r.monthlyAccountedUsd, 0.000072);
    assert.equal(r.retainedReserveUsd, 0);
    const raw = f.db.prepare("SELECT state FROM ai_budget_ledger").get().state;
    for (const secret of ["qa", baseInput().code, "fake", "어떻게 시작"])
      assert.ok(!raw.includes(secret));
  } finally {
    f.db.close();
  }
});
test("missing usage and a transport failure after a confirmed tool response retain conservative accounting", async () => {
  for (const options of [{ usage: false }, { failAt: 1 }]) {
    const f = fixture();
    try {
      const p = provider(options);
      await getHint(baseInput(), "qa", coachStore(f.store), {
        apiKey: "fake",
        model: "gpt-4.1-mini",
        fetcher: p.fetcher,
      });
      const r = await f.store.readAiBudget();
      assert.equal(r.retainedReserveUsd, 0.162144);
      assert.equal(r.uncertainCount, 1);
    } finally {
      f.db.close();
    }
  }
});
test("settlement failure returns a basic hint while the original hold remains", async () => {
  const f = fixture();
  try {
    const p = provider(),
      store = coachStore({
        ...f.store,
        finishAiBudget: async () => {
          throw Error("private failure");
        },
      });
    const r = await getHint(baseInput(), "qa", store, {
      apiKey: "fake",
      model: "gpt-4.1-mini",
      fetcher: p.fetcher,
    });
    assert.equal(r.source, "guide");
    assert.match(r.notice, /비용 기록/);
    assert.equal((await f.store.readAiBudget()).retainedReserveUsd, 0.162144);
  } finally {
    f.db.close();
  }
});
test("escaped Korean/control-character payloads stay within the preflight bound or fall back before an oversized provider request", async () => {
  const f = fixture();
  try {
    const p = provider({
      inspect: (payload) =>
        assert.ok(
          Buffer.byteLength(JSON.stringify(payload), "utf8") <=
            MAX_PROVIDER_PAYLOAD_BYTES,
        ),
    });
    const input = {
      ...baseInput(),
      code: "\u0000".repeat(19400) + "가".repeat(100),
      question: "한글 질문",
    };
    const r = await getHint(input, "qa", coachStore(f.store), {
      apiKey: "fake",
      model: "gpt-4.1-mini",
      fetcher: p.fetcher,
    });
    assert.ok(["ai", "guide"].includes(r.source));
    assert.ok((await f.store.readAiBudget()).monthlyAccountedUsd <= 0.162144);
  } finally {
    f.db.close();
  }
});

test("a late monetary reservation never starts a provider request after the overall deadline", async () => {
  const f = fixture();
  let release;
  try {
    const p = provider(),
      store = coachStore({
        ...f.store,
        reserveAiBudget: async (...args) => {
          const lease = await f.store.reserveAiBudget(...args);
          await new Promise((r) => (release = r));
          return lease;
        },
      });
    const result = await getHint(baseInput(), "qa", store, {
      apiKey: "fake",
      model: "gpt-4.1-mini",
      timeoutMs: 20,
      fetcher: p.fetcher,
    });
    assert.equal(result.source, "guide");
    release();
    await new Promise((r) => setImmediate(r));
    assert.equal(p.calls, 0);
    const r = await f.store.readAiBudget();
    assert.equal(r.pendingCount, 1);
    assert.equal(r.retainedReserveUsd, 0.162144);
  } finally {
    f.db.close();
  }
});

test("oversized tool message identifiers cannot cause a second provider request beyond the preflight bound", async () => {
  const f = fixture();
  let calls = 0;
  try {
    const result = await getHint(baseInput(), "qa", coachStore(f.store), {
      apiKey: "fake",
      model: "gpt-4.1-mini",
      fetcher: async () => {
        calls++;
        return Response.json({
          usage: { prompt_tokens: 20, completion_tokens: 10 },
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: "x".repeat(MAX_PROVIDER_PAYLOAD_BYTES),
                    type: "function",
                    function: { name: "read_mission", arguments: "{}" },
                  },
                ],
              },
            },
          ],
        });
      },
    });
    assert.equal(result.source, "guide");
    assert.equal(calls, 1);
    assert.equal((await f.store.readAiBudget()).monthlyAccountedUsd, 0.000024);
  } finally {
    f.db.close();
  }
});

test("server alerts cover 80% pressure and limit denial with aggregate fields only, and logging failure cannot bypass the limit", async () => {
  const f = fixture(),
    warnings = [];
  try {
    const store = createAiBudgetStorage(
      f.query,
      () => Date.parse("2026-11-23T00:00:00Z"),
      (w) => warnings.push(w),
    );
    const p = policy();
    p.dailyUnits = 100;
    p.monthlyUnits = 100;
    const id = crypto.randomUUID();
    assert.ok(await store.reserveAiBudget(id, 80, p));
    assert.equal(await store.reserveAiBudget(crypto.randomUUID(), 21, p), null);
    assert.ok(
      warnings.some((w) => w.reason === "warning80" && w.scope === "daily"),
    );
    assert.ok(
      warnings.some((w) => w.reason === "limit" && w.scope === "monthly"),
    );
    assert.ok(!JSON.stringify(warnings).includes(id));
    const throwing = createAiBudgetStorage(
      f.query,
      () => Date.parse("2026-11-23T00:00:00Z"),
      () => {
        throw Error("logger");
      },
    );
    assert.equal(
      await throwing.reserveAiBudget(crypto.randomUUID(), 21, p),
      null,
    );
  } finally {
    f.db.close();
  }
});
