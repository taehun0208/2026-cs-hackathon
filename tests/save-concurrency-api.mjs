// Disposable guests only; exercises the actual HTTP preconditions and database.
import assert from "node:assert/strict";
import { missions, initialProgress } from "../lib/missions.ts";
const base = process.env.LAB_TEST_URL ?? "http://127.0.0.1:3000";
const first = await fetch(base + "/api/state");
const cookie = first.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
const headers = {
  Cookie: cookie,
  Origin: base,
  "Content-Type": "application/json",
};
const write = (state, revision) =>
  fetch(base + "/api/state", {
    method: "POST",
    headers: {
      ...headers,
      ...(revision ? { "X-Lab-Revision": revision } : {}),
    },
    body: JSON.stringify(state),
  });
try {
  const state = {
    version: 1,
    progress: {
      frontend: initialProgress(missions[0]),
      backend: initialProgress(missions[1]),
    },
  };
  const seed = await write(state, "new");
  assert.equal(seed.status, 200);
  const revision = (await seed.json()).savedAt;
  const left = structuredClone(state),
    right = structuredClone(state);
  left.progress.frontend.code += "\n// A";
  right.progress.backend.code += "\n// B";
  const results = await Promise.all([
    write(left, revision),
    write(right, revision),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const conflict = await results.find((r) => r.status === 409).json();
  assert.equal(conflict.code, "RECORD_CONFLICT");
  assert.ok(conflict.state && conflict.savedAt);
  assert.equal(
    (await write(state)).status,
    409,
    "old clients cannot overwrite existing records without a revision",
  );
  const merged = conflict.state;
  merged.progress.frontend = left.progress.frontend;
  merged.progress.backend = right.progress.backend;
  const now = new Date().toISOString();
  merged.games = {
    frontend: { version: 1, completedAt: now, updatedAt: now, interest: 4 },
  };
  const saved = await write(merged, conflict.savedAt);
  assert.equal(saved.status, 200);
  const stored = await (await fetch(base + "/api/state", { headers })).json();
  assert.ok(stored.state.progress.frontend.code.endsWith("// A"));
  assert.ok(stored.state.progress.backend.code.endsWith("// B"));
  assert.equal(stored.state.games.frontend.interest, 4);
  assert.equal((await write(merged, "invalid")).status, 400);
  for (const path of [
    "/activities/extend/frontend",
    "/activities/study/cloud",
    "/?track=security",
    "/games?track=frontend",
  ])
    assert.equal((await fetch(base + path)).status, 200, path);
  assert.equal(
    (await fetch(base + "/activities/not-a-kind/frontend")).status,
    404,
  );
  console.log(
    "PASS: HTTP concurrent-write rejection, legacy-client protection, game round trip and activity destinations",
  );
} finally {
  assert.equal(
    (await fetch(base + "/api/state", { method: "DELETE", headers })).status,
    200,
  );
}
