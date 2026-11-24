// Uses only a disposable local QA guest; no shared records or AI calls.
import assert from "node:assert/strict";
import { STATE_BODY_LIMIT, stateSchema } from "../lib/server.ts";
import { largeState } from "./helpers/large-state.mjs";
const base = process.env.LAB_TEST_URL ?? "http://127.0.0.1:3000";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const first = await fetch(base + "/api/state");
assert.equal(first.status, 200);
const cookie = first.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
const headers = {
  Cookie: cookie,
  Origin: base,
  "Content-Type": "application/json",
  "X-Lab-Revision": "new",
  // Rejecting a large upload cancels its stream; do not reuse that socket for
  // the independent verification request on the local development server.
  Connection: "close",
};
const state = largeState();
const write = (body) =>
  fetch(base + "/api/state", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
const read = async () => (await fetch(base + "/api/state", { headers })).json();
try {
  const response = await write(state);
  assert.equal(response.status, 200);
  headers["X-Lab-Revision"] = (await response.json()).savedAt;
  const saved = await read();
  assert.deepEqual(saved.state, stateSchema.parse(state));
  assert.equal(
    (await write({ ...state, padding: "x".repeat(STATE_BODY_LIMIT) })).status,
    400,
  );
  const invalid = structuredClone(state);
  invalid.progress.frontend.code += "x";
  assert.equal((await write(invalid)).status, 400);
  assert.deepEqual(
    await read(),
    saved,
    "Rejected input must not modify the saved record or receipt",
  );
  console.log(
    `PASS: six full editors and execution reflections round-trip (${JSON.stringify(state).length} JSON characters); oversized input remains rejected`,
  );
} finally {
  assert.equal(
    (await fetch(base + "/api/state", { method: "DELETE", headers })).status,
    200,
  );
}
