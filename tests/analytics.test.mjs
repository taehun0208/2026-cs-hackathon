import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { createStorage } from "../lib/storage.ts";
import {
  analyticsEventSchema,
  eventBatchSchema,
  GAME_ANALYTICS_VERSION,
} from "../lib/analytics-schema.ts";
import { analyticsRequest } from "../lib/analytics-handler.ts";
import { missions } from "../lib/missions.ts";
const context = () => ({
  journeyId: crypto.randomUUID(),
  surface: "code",
  track: "frontend",
  contentVersion: missions[0].contentVersion,
});
const event = (
  name = "mission_start",
  data = { entry: "new" },
  ctx = context(),
) => ({
  version: 1,
  id: crypto.randomUUID(),
  sessionId: crypto.randomUUID(),
  name,
  data,
  context: ctx,
});
function fixture() {
  const db = new DatabaseSync(":memory:");
  for (const file of ["001_initial.sql", "002_analytics.sql"])
    db.exec(
      fs.readFileSync(
        new URL("../migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  let clock = Date.parse("2026-11-23T00:00:00Z");
  const store = createStorage(
    async (text, values) =>
      db
        .prepare(text.replace(/ FOR UPDATE/g, "").replace(/\$\d+/g, "?"))
        .all(...values),
    () => clock,
  );
  return { db, store, advance: (ms) => (clock += ms) };
}
test("analytics contracts reject raw content, identity overrides, unknown fields and wrong version/surface", () => {
  const good = event();
  assert.ok(analyticsEventSchema.safeParse(good).success);
  for (const field of [
    "code",
    "question",
    "note",
    "reason",
    "email",
    "owner",
    "url",
    "userAgent",
  ])
    assert.equal(
      analyticsEventSchema.safeParse({ ...good, [field]: "private" }).success,
      false,
    );
  assert.equal(
    analyticsEventSchema.safeParse({
      ...good,
      data: { ...good.data, note: "private" },
    }).success,
    false,
  );
  assert.equal(
    analyticsEventSchema.safeParse({ ...good, version: 2 }).success,
    false,
  );
  assert.equal(
    analyticsEventSchema.safeParse({
      ...good,
      context: { ...good.context, contentVersion: "unknown" },
    }).success,
    false,
  );
  assert.equal(
    analyticsEventSchema.safeParse(
      event("run_result", {
        executionId: crypto.randomUUID(),
        kind: "edited",
        passed: 5,
        total: 2,
        outcome: "checks",
      }),
    ).success,
    false,
  );
  const game = {
    ...context(),
    surface: "game",
    contentVersion: GAME_ANALYTICS_VERSION,
  };
  assert.ok(
    analyticsEventSchema.safeParse(event("game_check", { passed: true }, game))
      .success,
  );
  assert.equal(
    analyticsEventSchema.safeParse(
      event("reflection_saved", { executionId: crypto.randomUUID() }, game),
    ).success,
    false,
  );
  assert.equal(
    analyticsEventSchema.safeParse(
      event("mission_end", { outcome: "completed", elapsedMs: 20 }),
    ).success,
    false,
  );
  assert.equal(
    eventBatchSchema.safeParse({
      token: crypto.randomUUID(),
      events: Array.from({ length: 21 }, () => event()),
    }).success,
    false,
  );
});
test("consent is off by default; accepted records contain only the explicit event contract and cohort from the server", async () => {
  const { db, store } = fixture();
  try {
    assert.deepEqual(await store.getAnalyticsConsent("a"), {
      enabled: false,
      token: null,
      participantCode: null,
    });
    assert.equal(
      await store.appendAnalyticsEvents("a", crypto.randomUUID(), [event()]),
      0,
    );
    const c = await store.setAnalyticsConsent("a", true, "P01"),
      e = event();
    assert.equal(await store.appendAnalyticsEvents("a", c.token, [e]), 1);
    const r = db.prepare("SELECT * FROM lab_events").get();
    assert.equal(r.participant_code, "P01");
    assert.deepEqual(JSON.parse(r.event_json), e);
    assert.equal((await store.getAnalyticsConsent("b")).enabled, false);
  } finally {
    db.close();
  }
});
test("duplicate retries count once, a different owner cannot claim the same event, and withdrawal removes only its own records", async () => {
  const { db, store } = fixture();
  try {
    const a = await store.setAnalyticsConsent("a", true, "P01"),
      b = await store.setAnalyticsConsent("b", true, "P02"),
      e = event();
    assert.equal(await store.appendAnalyticsEvents("a", a.token, [e]), 1);
    assert.equal(await store.appendAnalyticsEvents("a", a.token, [e]), 0);
    assert.equal(await store.appendAnalyticsEvents("b", b.token, [e]), 0);
    await store.appendAnalyticsEvents("b", b.token, [event()]);
    await store.setAnalyticsConsent("a", false, null);
    assert.equal(
      db
        .prepare("SELECT count(*) AS n FROM lab_events WHERE owner_key=?")
        .get("a").n,
      0,
    );
    assert.equal(
      db
        .prepare("SELECT count(*) AS n FROM lab_events WHERE owner_key=?")
        .get("b").n,
      1,
    );
    assert.equal(await store.appendAnalyticsEvents("a", a.token, [event()]), 0);
  } finally {
    db.close();
  }
});
test("renewed consent has a new token and old queued events cannot be reintroduced; full deletion fences consent too", async () => {
  const { db, store } = fixture();
  try {
    const a = await store.setAnalyticsConsent("a", true, "P01");
    await store.appendAnalyticsEvents("a", a.token, [event()]);
    const next = await store.setAnalyticsConsent("a", true, "P02");
    assert.notEqual(next.token, a.token);
    assert.equal(await store.appendAnalyticsEvents("a", a.token, [event()]), 0);
    assert.equal(
      await store.appendAnalyticsEvents("a", next.token, [event()]),
      1,
    );
    await store.remove("a");
    assert.equal(db.prepare("SELECT count(*) AS n FROM lab_events").get().n, 0);
    await assert.rejects(store.setAnalyticsConsent("a", true, "P01"));
    assert.equal(
      await store.appendAnalyticsEvents("a", next.token, [event()]),
      0,
    );
  } finally {
    db.close();
  }
});
test("30-day consent expires without being renewed by views; cleanup removes unattended events and past usage", async () => {
  const { db, store, advance } = fixture();
  try {
    const c = await store.setAnalyticsConsent("a", true, "QA");
    await store.appendAnalyticsEvents("a", c.token, [event()]);
    advance(30 * 86400000);
    assert.equal((await store.getAnalyticsConsent("a")).enabled, false);
    assert.equal(await store.appendAnalyticsEvents("a", c.token, [event()]), 0);
    const removed = await store.cleanup();
    assert.equal(removed.events, 1);
    assert.equal(removed.preferences, 1);
    assert.equal(removed.analyticsUsage, 2);
  } finally {
    db.close();
  }
});
test("submitted event budgets cap an owner at 500 per UTC day and leave AI limits independent", async () => {
  const { db, store } = fixture();
  try {
    const c = await store.setAnalyticsConsent("a", true, null);
    for (let i = 0; i < 25; i++)
      assert.equal(
        await store.appendAnalyticsEvents(
          "a",
          c.token,
          Array.from({ length: 20 }, () => event()),
        ),
        20,
      );
    assert.equal(await store.appendAnalyticsEvents("a", c.token, [event()]), 0);
    assert.equal(await store.reserve("a", "ai"), true);
  } finally {
    db.close();
  }
});
test("API validates origin and strict body before touching storage, denies unconsented writes, and never exposes owner keys", async () => {
  let calls = 0;
  const store = async () => {
    calls++;
    throw new Error("private-db-details");
  };
  const req = (method, body, origin = "https://lab.example") =>
    new Request("https://lab.example/api/analytics", {
      method,
      headers: { Origin: origin, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal(
    (await analyticsRequest(req("POST", {}, "https://evil.example"), store))
      .status,
    403,
  );
  assert.equal(
    (
      await analyticsRequest(
        req("PUT", { enabled: true, participantCode: null, email: "private" }),
        store,
      )
    ).status,
    400,
  );
  assert.equal(calls, 0);
  const failure = await analyticsRequest(req("GET"), store);
  assert.equal(failure.status, 503);
  assert.ok(!(await failure.text()).includes("private-db"));
  const { db, store: actual } = fixture();
  try {
    const body = { token: crypto.randomUUID(), events: [event()] };
    assert.equal(
      (await analyticsRequest(req("POST", body), async () => actual)).status,
      403,
    );
    const preference = await analyticsRequest(req("GET"), async () => actual);
    assert.deepEqual(await preference.json(), {
      enabled: false,
      token: null,
      participantCode: null,
    });
  } finally {
    db.close();
  }
});
