import test from "node:test";
import assert from "node:assert/strict";
import { readBody, STATE_BODY_LIMIT, stateSchema } from "../lib/server.ts";
import { largeState } from "./helpers/large-state.mjs";

test("all six permitted editors and execution-backed reflections fit in one bounded save request", async () => {
  const state = largeState(),
    body = JSON.stringify(state);
  for (const progress of Object.values(state.progress)) {
    assert.equal(progress.code.length, 20000);
    assert.ok(JSON.stringify(progress.lastExecution.result).length <= 50000);
  }
  assert.ok(body.length > 100000);
  const request = () =>
    new Request("http://localhost/api/state", { method: "POST", body });
  assert.deepEqual(
    stateSchema.parse(await readBody(request(), STATE_BODY_LIMIT)),
    stateSchema.parse(state),
  );
  await assert.rejects(
    readBody(request()),
    "Smaller action requests keep their existing limit",
  );
});

test("increasing the aggregate allowance does not relax individual code and reflection limits", () => {
  const state = largeState();
  state.progress.frontend.code += "x";
  assert.equal(stateSchema.safeParse(state).success, false);
  state.progress.frontend.code = state.progress.frontend.code.slice(0, 20000);
  state.progress.frontend.reflection.note = "x".repeat(2001);
  assert.equal(stateSchema.safeParse(state).success, false);
});
