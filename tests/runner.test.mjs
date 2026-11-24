import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { runMission } from "../lib/runner.ts";
import { missions } from "../lib/missions.ts";

function harness(t) {
  const dom = new JSDOM("<body></body>", { url: "http://localhost" });
  const before = { window: globalThis.window, document: globalThis.document };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  t.after(() => {
    dom.window.close();
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  const promise = runMission(missions[0], missions[0].solution);
  const frame = document.querySelector("iframe");
  const token = JSON.parse(frame.srcdoc.match(/const token=("[^"]+")/)[1]);
  return {
    promise,
    frame,
    send(result, overrides = {}) {
      dom.window.dispatchEvent(
        new dom.window.MessageEvent("message", {
          source: frame.contentWindow,
          data: { token, result },
          ...overrides,
        }),
      );
    },
  };
}

test("large combined output reports an output limit immediately, without waiting for the execution deadline", async (t) => {
  const f = harness(t);
  f.send({
    tests: missions[0].tests.map((test) => ({
      ...test,
      actual: "x".repeat(9000),
      passed: false,
    })),
    preview: "x".repeat(9000),
  });
  assert.equal(
    f.frame.isConnected,
    false,
    "The completed worker must be cleaned up immediately",
  );
  const result = await f.promise;
  assert.match(result.error, /실행 결과가 너무 커요/);
  assert.doesNotMatch(result.error, /3초|반복문/);
});

for (const kind of ["cycle", "bigint"]) {
  test(`${kind} output produces a readable error and releases the execution frame`, async (t) => {
    const f = harness(t);
    const preview = kind === "bigint" ? 1n : {};
    if (kind === "cycle") preview.self = preview;
    f.send({ tests: [], preview });
    assert.equal(f.frame.isConnected, false);
    assert.match((await f.promise).error, /반환값을 표시할 수 없어요/);
  });
}

test("messages from unrelated frames or with another token cannot settle an execution", async (t) => {
  const f = harness(t);
  const result = { tests: [], preview: [] };
  f.send(result, { source: window });
  f.send(result, { data: { token: "different-run", result } });
  assert.equal(f.frame.isConnected, true);
  f.send(result);
  assert.deepEqual(await f.promise, result);
  assert.equal(f.frame.isConnected, false);
});

for (const result of [
  { tests: [null] },
  { tests: [], error: { message: "unexpected" } },
]) {
  test(`invalid worker report ${JSON.stringify(result)} cannot crash the result screen`, async (t) => {
    const f = harness(t);
    f.send(result);
    assert.equal(f.frame.isConnected, false);
    assert.match((await f.promise).error, /실행 결과 형식을 확인할 수 없어요/);
  });
}
