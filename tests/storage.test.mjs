import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createStorage } from "../lib/storage.ts";
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync(
      new URL("../migrations/001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  db.exec(
    readFileSync(
      new URL("../migrations/002_analytics.sql", import.meta.url),
      "utf8",
    ),
  );
  const store = createStorage(async (text, values) =>
    db
      .prepare(text.replace(/ FOR UPDATE/g, "").replace(/\$\d+/g, "?"))
      .all(...values),
  );
  return { db, store };
}
test("records are isolated, updated, expired, and removed by owner", async () => {
  const { store, db } = fixture(),
    state = { version: 1, progress: {} };
  await store.save("a", state);
  assert.deepEqual((await store.read("a")).state, state);
  assert.equal(await store.read("b"), null);
  await store.save("b", state);
  await store.remove("a");
  assert.equal(await store.read("a"), null);
  assert.ok(await store.read("b"));
  db.prepare("UPDATE lab_states SET updated_at=? WHERE owner_key=?").run(
    Date.now() - 31 * 86400000,
    "b",
  );
  assert.equal(await store.read("b"), null);
  db.close();
});
test("per-role cap rejects a seventh request and keeps other roles available", async () => {
  const { store, db } = fixture();
  for (let i = 0; i < 6; i++)
    assert.equal(await store.reserve("a", "ai"), true);
  assert.equal(await store.reserve("a", "ai"), false);
  assert.equal(await store.reserve("a", "cloud"), true);
  db.close();
});
test("global cap is shared by independent users and survives new storage objects", async () => {
  const { store, db } = fixture();
  for (let i = 0; i < 200; i++)
    assert.equal(await store.reserve("guest-" + i, "ai"), true);
  assert.equal(await store.reserve("new-guest", "ai"), false);
  db.close();
});

test("save receipts use persisted timestamps; reads never renew the 30-day expiry", async () => {
  const { storageDates, RETENTION_MS } = await import("../lib/retention.ts");
  const { db } = fixture();
  let now = Date.parse("2026-11-23T00:00:00Z");
  const store = createStorage(
    async (text, values) =>
      db
        .prepare(text.replace(/ FOR UPDATE/g, "").replace(/\$\d+/g, "?"))
        .all(...values),
    () => now,
  );
  const state = { version: 1, progress: {} };
  const written = await store.save("a", state);
  now += RETENTION_MS - 1;
  assert.equal((await store.read("a")).updatedAt, written);
  assert.equal(Date.parse(storageDates(written).expiresAt), now + 1);
  now++;
  assert.equal(await store.read("a"), null);
  db.close();
});
test("deletion removes only the owner's content and AI calls, fences stale writes and keeps today's caps", async () => {
  const { store, db } = fixture();
  const state = { version: 1, progress: {} };
  const usage = (owner) => ({
    owner,
    model: "test",
    inputTokens: 1,
    outputTokens: 1,
    latencyMs: 1,
    outcome: "ok",
  });
  await store.save("a", state);
  await store.save("b", state);
  await store.logUsage(usage("a"));
  await store.logUsage(usage("b"));
  await store.reserve("a", "ai");
  const quotas = db.prepare("SELECT * FROM ai_usage ORDER BY key").all();
  await store.remove("a");
  assert.equal(await store.read("a"), null);
  assert.ok(await store.read("b"));
  await assert.rejects(store.save("a", state), { message: "RECORD_DELETED" });
  await store.logUsage(usage("a"));
  assert.equal(
    db
      .prepare("SELECT count(*) AS count FROM ai_calls WHERE owner_key=?")
      .get("a").count,
    0,
  );
  assert.equal(
    db
      .prepare("SELECT count(*) AS count FROM ai_calls WHERE owner_key=?")
      .get("b").count,
    1,
  );
  assert.deepEqual(
    db.prepare("SELECT * FROM ai_usage ORDER BY key").all(),
    quotas,
  );
  assert.equal(
    db.prepare("SELECT state FROM lab_states WHERE owner_key=?").get("a").state,
    "null",
  );
  db.close();
});
test("scheduled cleanup removes unattended expired states, calls and previous UTC quotas, is repeatable, and retains current rows", async () => {
  const { db } = fixture();
  const now = Date.parse("2026-11-23T00:00:00Z"),
    cutoff = now - 30 * 86400000;
  const store = createStorage(
    async (text, values) =>
      db
        .prepare(text.replace(/ FOR UPDATE/g, "").replace(/\$\d+/g, "?"))
        .all(...values),
    () => now,
  );
  for (const [key, time] of [
    ["old", cutoff],
    ["current", cutoff + 1],
  ]) {
    db.prepare("INSERT INTO lab_states VALUES (?,?,?)").run(
      key,
      JSON.stringify({ version: 1, progress: {} }),
      time,
    );
    db.prepare("INSERT INTO ai_calls VALUES (?,?,?,?,?,?,?,?)").run(
      key,
      key,
      "test",
      0,
      0,
      1,
      "ok",
      time,
    );
  }
  for (const day of ["2026-11-22", "2026-11-23"])
    db.prepare("INSERT INTO ai_usage VALUES (?,?)").run(day + ":global", 1);
  assert.deepEqual(await store.cleanup(), {
    states: 1,
    calls: 1,
    usage: 1,
    events: 0,
    preferences: 0,
    analyticsUsage: 0,
  });
  assert.deepEqual(await store.cleanup(), {
    states: 0,
    calls: 0,
    usage: 0,
    events: 0,
    preferences: 0,
    analyticsUsage: 0,
  });
  assert.equal(
    db.prepare("SELECT owner_key FROM lab_states").get().owner_key,
    "current",
  );
  assert.equal(db.prepare("SELECT id FROM ai_calls").get().id, "current");
  assert.equal(
    db.prepare("SELECT key FROM ai_usage").get().key,
    "2026-11-23:global",
  );
  db.close();
});
test("an expiry check cannot remove a concurrently renewed state", async () => {
  const now = Date.now(),
    state = { version: 1, progress: {} };
  const calls = [];
  const store = createStorage(
    async (text, values) => {
      calls.push({ text, values });
      if (text.startsWith("SELECT"))
        return [{ state, updated_at: now - 31 * 86400000 }];
      return [];
    },
    () => now,
  );
  assert.equal(await store.read("a"), null);
  assert.match(calls[1].text, /updated_at <= \$2/);
  assert.equal(calls[1].values[1], now - 30 * 86400000);
});
