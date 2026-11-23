import test from "node:test";
import assert from "node:assert/strict";
import {
  createPersistence,
  DRAFT_KEY,
  PENDING_PREFIX,
  readDraft,
  isRecordReset,
} from "../lib/persistence.ts";
import { initialProgress, missions } from "../lib/missions.ts";
import { storageDates, RETENTION_MS } from "../lib/retention.ts";
const empty = () => ({ version: 1, progress: {} });
const work = (code = "my draft") => ({
  version: 1,
  progress: { frontend: { ...initialProgress(missions[0]), code } },
});
const receipt = storageDates(Date.parse("2026-11-23T00:00:00Z"));
const remote = (state = null) =>
  Response.json({
    state,
    ...(state ? receipt : { savedAt: null, expiresAt: null }),
  });
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
const tick = () => new Promise((r) => setImmediate(r));
function fixture(fetcher, draft, overrides = {}) {
  const memory = new Map(draft ? [[DRAFT_KEY, JSON.stringify(draft)]] : []),
    calls = [];
  let state, status;
  const controller = createPersistence({
    storage: {
      get length() {
        return memory.size;
      },
      key: (index) => [...memory.keys()][index] ?? null,
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => memory.set(k, v),
      removeItem: (k) => memory.delete(k),
      ...overrides.storage,
    },
    onState: (s) => (state = s),
    onStatus: (s) => (status = s),
    fetcher: async (url, o) => {
      calls.push(o.method);
      return fetcher(o, calls.length);
    },
    debounceMs: 10000,
    timeoutMs: 200,
    ...Object.fromEntries(
      Object.entries(overrides).filter(([k]) => k !== "storage"),
    ),
  });
  return {
    controller,
    memory,
    calls,
    get state() {
      return state;
    },
    get status() {
      return status;
    },
  };
}
test("visiting a saved record does not POST, extend its expiry or mark an empty record saved", async () => {
  const f = fixture(async () => remote(work()));
  await f.controller.load();
  f.controller.stage(f.state);
  await tick();
  assert.deepEqual(f.calls, ["GET"]);
  assert.equal(f.status.phase, "saved");
  assert.equal(f.status.savedAt, receipt.savedAt);
  assert.equal(f.status.expiresAt, receipt.expiresAt);
  assert.equal(readDraft(f.memory.get(DRAFT_KEY)).dirty, false);
  f.controller.dispose();
  const n = fixture(async () => remote());
  await n.controller.load();
  n.controller.stage(n.state);
  assert.equal(n.status.phase, "idle");
  assert.equal(n.status.savedAt, null);
  assert.deepEqual(n.calls, ["GET"]);
  n.controller.dispose();
});
test("failed saves preserve the draft and last server receipt; retry persists the latest edit", async () => {
  let fail = true;
  const f = fixture(async (o) =>
    o.method === "GET"
      ? remote(work("old"))
      : fail
        ? Response.json({}, { status: 503 })
        : Response.json(storageDates(Date.parse(receipt.savedAt) + 1000)),
  );
  await f.controller.load();
  f.controller.stage(work("offline edit"));
  await assert.rejects(f.controller.saveNow());
  assert.equal(f.status.phase, "error");
  assert.equal(f.status.localSaved, true);
  assert.equal(f.status.savedAt, receipt.savedAt);
  assert.equal(
    readDraft(f.memory.get(DRAFT_KEY)).state.progress.frontend.code,
    "offline edit",
  );
  fail = false;
  await f.controller.retry();
  assert.equal(f.status.phase, "saved");
  assert.equal(readDraft(f.memory.get(DRAFT_KEY)).dirty, false);
  assert.notEqual(f.status.savedAt, receipt.savedAt);
  f.controller.dispose();
});
test("a missing or expired server record never silently re-registers a legacy or synchronized local draft", async () => {
  for (const draft of [
    work(),
    { format: 2, state: work(), dirty: false, ...receipt },
  ]) {
    const f = fixture(
      async (o) => (o.method === "GET" ? remote() : Response.json(receipt)),
      draft,
    );
    await f.controller.load();
    f.controller.stage(work("should not replace"));
    assert.equal(f.status.phase, "recovery");
    assert.equal(f.status.ready, false);
    assert.deepEqual(f.calls, ["GET"]);
    await f.controller.restore();
    assert.deepEqual(f.calls, ["GET", "POST"]);
    assert.equal(f.status.phase, "saved");
    f.controller.dispose();
  }
});
test("offline loading permits local edits but checks the server again before upload", async () => {
  let online = false;
  const f = fixture(async () => {
    if (!online) throw new Error("offline");
    return remote();
  }, work());
  await f.controller.load();
  assert.equal(f.status.phase, "error");
  assert.equal(f.status.ready, true);
  f.controller.stage(work("offline changed"));
  assert.equal(f.calls.length, 1);
  online = true;
  await f.controller.retry();
  assert.equal(f.status.phase, "recovery");
  assert.deepEqual(f.calls, ["GET", "GET"]);
  assert.equal(f.state.progress.frontend.code, "offline changed");
  f.controller.dispose();
});
test("storage quota failures stay visible instead of falsely claiming a local backup", async () => {
  const session = new Map();
  const f = fixture(
    async (o) =>
      o.method === "GET" ? remote() : Response.json({}, { status: 503 }),
    null,
    {
      tabStorage: {
        getItem: (key) => session.get(key) ?? null,
        setItem: (key, value) => session.set(key, value),
        removeItem: (key) => session.delete(key),
      },
      storage: {
        setItem() {
          throw new Error("quota");
        },
      },
    },
  );
  await f.controller.load();
  f.controller.stage(work());
  await assert.rejects(f.controller.saveNow());
  assert.equal(f.status.localSaved, false);
  assert.equal(f.status.phase, "error");
  assert.equal(f.memory.size, 0);
  assert.ok(session.has(DRAFT_KEY));
  f.controller.dispose();
});

test("deleting records removes drafts from closed tabs and broadcasts without a shared cache", async () => {
  const signals = [];
  const f = fixture(
    async (o) =>
      o.method === "GET" ? remote() : Response.json({ deleted: true }),
    null,
    {
      storage: {
        setItem: (key, newValue) => {
          signals.push({ key, newValue });
        },
      },
    },
  );
  await f.controller.load();
  f.memory.set(
    `${PENDING_PREFIX}closed-tab`,
    JSON.stringify({ format: 2, state: work(), dirty: true }),
  );
  assert.equal(await f.controller.remove(), true);
  assert.equal(f.memory.size, 0);
  assert.ok(signals.some(isRecordReset));
  await f.controller.load();
  assert.equal(f.status.phase, "idle");
  f.controller.dispose();
});
test("a content conflict keeps the local draft and stops automatic overwrites", async () => {
  const f = fixture(async (o) =>
    o.method === "GET"
      ? remote()
      : Response.json({ error: "conflict" }, { status: 409 }),
  );
  await f.controller.load();
  f.controller.stage(work());
  await assert.rejects(f.controller.saveNow());
  assert.equal(f.status.phase, "conflict");
  assert.equal(f.status.ready, false);
  assert.equal(f.memory.size, 2);
  await assert.rejects(f.controller.saveNow());
  assert.deepEqual(f.calls, ["GET", "POST"]);
  f.controller.dispose();
});
test("deletion waits for in-flight saves, cancels queued edits, and leaves no empty autosave", async () => {
  const entered = deferred(),
    gate = deferred();
  const f = fixture(async (o) => {
    if (o.method === "GET") return remote();
    if (o.method === "POST") {
      entered.resolve();
      return gate.promise;
    }
    return Response.json({ deleted: true });
  });
  await f.controller.load();
  f.controller.stage(work("first"));
  const first = f.controller.saveNow();
  await entered.promise;
  f.controller.stage(work("second"));
  const second = f.controller.saveNow();
  const deletion = f.controller.remove();
  assert.equal(f.status.phase, "deleting");
  f.controller.stage(work("late edit"));
  gate.resolve(Response.json(receipt));
  await assert.rejects(first);
  await assert.rejects(second);
  assert.equal(await deletion, true);
  f.controller.stage(f.state);
  assert.deepEqual(f.calls, ["GET", "POST", "DELETE"]);
  assert.equal(f.memory.size, 0);
  assert.deepEqual(f.state, empty());
  assert.equal(f.status.savedAt, null);
  f.controller.dispose();
});
test("a failed delete retains the only local copy and allows a deliberate retry", async () => {
  let fail = true;
  const f = fixture(async (o) =>
    o.method === "GET"
      ? remote(work())
      : Response.json({}, { status: fail ? 503 : 200 }),
  );
  await f.controller.load();
  assert.equal(await f.controller.remove(), false);
  assert.equal(f.status.phase, "error");
  assert.equal(f.memory.size, 1);
  assert.equal(f.state.progress.frontend.code, "my draft");
  fail = false;
  assert.equal(await f.controller.remove(), true);
  assert.equal(f.memory.size, 0);
  f.controller.dispose();
});
test("deletion does not report complete if this browser refuses to remove the draft", async () => {
  const f = fixture(
    async (o) =>
      o.method === "GET" ? remote(work()) : Response.json({ deleted: true }),
    null,
    {
      storage: {
        removeItem() {
          throw new Error("blocked");
        },
      },
    },
  );
  await f.controller.load();
  assert.equal(await f.controller.remove(), false);
  assert.equal(f.memory.size, 1);
  assert.equal(f.status.phase, "error");
  f.controller.dispose();
});
test("deletion in another tab invalidates a late save response and blocks further writes", async () => {
  const gate = deferred(),
    entered = deferred();
  const f = fixture(async (o) =>
    o.method === "GET" ? remote(work()) : (entered.resolve(), gate.promise),
  );
  await f.controller.load();
  f.controller.stage(work("edit"));
  const save = f.controller.saveNow();
  await entered.promise;
  f.memory.delete(DRAFT_KEY);
  f.controller.externalReset();
  gate.resolve(Response.json(receipt));
  await assert.rejects(save);
  f.controller.stage(work("stale"));
  assert.equal(f.memory.size, 0);
  assert.equal(f.status.phase, "conflict");
  assert.equal(f.status.savedAt, null);
  f.controller.dispose();
});
test("an older save receipt never declares a newer pending edit fully saved", async () => {
  const gate = deferred(),
    entered = deferred();
  const f = fixture(async (o) =>
    o.method === "GET" ? remote() : (entered.resolve(), gate.promise),
  );
  await f.controller.load();
  f.controller.stage(work("first"));
  const saved = f.controller.saveNow();
  await entered.promise;
  f.controller.stage(work("second"));
  gate.resolve(Response.json(receipt));
  await saved;
  assert.equal(f.status.phase, "saving");
  const draft = readDraft(f.memory.get(DRAFT_KEY));
  assert.equal(draft.state.progress.frontend.code, "second");
  assert.equal(draft.dirty, true);
  f.controller.dispose();
});
test("a stalled save response body times out and cannot block deletion forever", async () => {
  const keepAlive = setTimeout(() => {}, 1000);
  const f = fixture(
    async (o) =>
      o.method === "GET"
        ? remote()
        : o.method === "POST"
          ? new Response(new ReadableStream({ start() {} }))
          : Response.json({ deleted: true }),
    null,
    { timeoutMs: 20 },
  );
  try {
    await f.controller.load();
    f.controller.stage(work());
    await assert.rejects(f.controller.saveNow());
    assert.equal(f.status.phase, "error");
    assert.equal(await f.controller.remove(), true);
  } finally {
    clearTimeout(keepAlive);
    f.controller.dispose();
  }
});
test("legacy drafts retain their content and invalid cached JSON is ignored", () => {
  assert.equal(
    readDraft(JSON.stringify(work())).state.progress.frontend.code,
    "my draft",
  );
  for (const raw of [
    "invalid",
    "null",
    '{"version":1,"progress":[]}',
    '{"version":2,"progress":{}}',
  ])
    assert.equal(readDraft(raw), null);
  assert.equal(
    Date.parse(receipt.expiresAt) - Date.parse(receipt.savedAt),
    RETENTION_MS,
  );
});

test("save acknowledgement callbacks run after success only and cannot break persistence", async () => {
  let fail = true,
    acknowledged = 0;
  const f = fixture(
    async (o) =>
      o.method === "GET"
        ? remote()
        : fail
          ? Response.json({}, { status: 503 })
          : Response.json(receipt),
    null,
    {
      onSaved: (snapshot) => {
        acknowledged++;
        assert.equal(snapshot.progress.frontend.code, "pending observation");
        throw new Error("analytics callback failed");
      },
    },
  );
  await f.controller.load();
  assert.equal(acknowledged, 0);
  f.controller.stage(work("pending observation"));
  await assert.rejects(f.controller.saveNow());
  assert.equal(acknowledged, 0);
  fail = false;
  await f.controller.retry();
  assert.equal(acknowledged, 1);
  assert.equal(f.status.phase, "saved");
  f.controller.dispose();
});
