// Explicit local/preview smoke test. Reads/deletes only its own temporary guest.
import assert from "node:assert/strict";
import { missions, initialProgress } from "../lib/missions.ts";
import { changeCode, snapshotExecution } from "../lib/lab-state.ts";
import {
  recommendationContext,
  nextActionSuggestion,
  makeNextActionPlan,
} from "../lib/next-actions.ts";
const base = process.env.LAB_TEST_URL ?? "http://127.0.0.1:3000";
const initial = await fetch(base + "/api/state");
assert.equal(initial.status, 200);
const cookie = initial.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
const headers = {
  "Content-Type": "application/json",
  Origin: base,
  Cookie: cookie,
};
let revision = "new";
const write = async (state) => {
  const response = await fetch(base + "/api/state", {
    method: "POST",
    headers: { ...headers, "X-Lab-Revision": revision },
    body: JSON.stringify(state),
  });
  if (response.ok) revision = (await response.clone().json()).savedAt;
  return response;
};
const read = async () =>
  (
    await (
      await fetch(base + "/api/state", { headers: { Cookie: cookie } })
    ).json()
  ).state;
try {
  const m = missions.find((x) => x.id === "cloud");
  const p = {
    ...initialProgress(m),
    ...changeCode(
      initialProgress(m),
      m.starter + "\n// synthetic API fixture",
      "user",
    ),
    runs: 1,
  };
  p.lastExecution = await snapshotExecution(
    p,
    m,
    { tests: [], preview: null },
    "2026-11-23T00:00:00.000Z",
  );
  const state = { version: 1, progress: { cloud: p } };
  const r = {
    interest: 5,
    difficulty: 4,
    again: 5,
    note: "API fixture: compare threshold conditions",
    next: "",
    endedAt: "2026-11-23T00:00:00.000Z",
    execution: p.lastExecution,
  };
  const ctx = recommendationContext(state, m.id, r),
    suggestion = nextActionSuggestion(r, m.id, ctx);
  assert.equal(suggestion.ruleId, "foundation-first");
  r.next = suggestion.candidates[0].title;
  r.nextPlan = makeNextActionPlan(
    m,
    p.lastExecution.id,
    r,
    ctx,
    suggestion.candidates[0].id,
    "조건을 한 번 더 연습하고 싶어요",
  );
  p.reflection = r;
  assert.equal((await write(state)).status, 200);
  assert.deepEqual(
    (await read()).progress.cloud.reflection.nextPlan,
    r.nextPlan,
  );
  const bad = structuredClone(state);
  bad.progress.cloud.reflection.nextPlan.candidates[0].title =
    "unreviewed activity";
  assert.equal((await write(bad)).status, 400);
  const saved = await read();
  assert.deepEqual(saved.progress.cloud.reflection.nextPlan, r.nextPlan);
  saved.progress.backend = initialProgress(
    missions.find((x) => x.id === "backend"),
  );
  assert.equal((await write(saved)).status, 200);
  assert.deepEqual(
    (await read()).progress.cloud.reflection.nextPlan,
    r.nextPlan,
  );
  console.log(
    "PASS: reviewed rule priority, candidate snapshot, explicit choice/reason, invalid plan rejection, history preservation",
  );
} finally {
  assert.equal(
    (await fetch(base + "/api/state", { method: "DELETE", headers })).status,
    200,
  );
}
