import test from "node:test";
import assert from "node:assert/strict";
import {
  aiRounds,
  cloudRounds,
  dataRounds,
  securityRounds,
  shuffleOrder,
} from "../lib/game-rounds.ts";
import { clientHarness } from "./helpers/client-harness.mjs";

test("shuffleOrder returns every position exactly once and follows the random source", () => {
  assert.deepEqual(shuffleOrder(4, () => 0.999999), [0, 1, 2, 3]);
  const mixed = shuffleOrder(4, () => 0);
  assert.notDeepEqual(mixed, [0, 1, 2, 3]);
  assert.deepEqual([...mixed].sort(), [0, 1, 2, 3]);
  for (let n = 1; n <= 6; n++)
    assert.deepEqual([...shuffleOrder(n)].sort(), [...Array(n).keys()]);
});

test("a shuffled game still grades by the option text, not by its position", async (t) => {
  const previousFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  const previousRandom = Math.random;
  Math.random = () => 0; // 원래 순서와 다른 순서로 고정
  t.after(() => {
    Math.random = previousRandom;
    if (previousFrame) globalThis.requestAnimationFrame = previousFrame;
    else delete globalThis.requestAnimationFrame;
  });
  const f = await clientHarness(t, {
    game: true,
    url: "http://localhost/games?track=ai",
  });
  const document = f.dom.window.document;
  const labels = () =>
    [...document.querySelectorAll(".tools label")].map((l) =>
      l.textContent.trim(),
    );
  const round = aiRounds[0];
  assert.notDeepEqual(labels(), round.options, "options are in a new order");
  assert.deepEqual([...labels()].sort(), [...round.options].sort());
  const correct = [...document.querySelectorAll(".tools label")].find(
    (l) => l.textContent.trim() === round.options[round.answer],
  );
  await f.act(async () => correct.querySelector("input").click());
  await f.click("판정하기");
  assert.match(document.querySelector('[role="status"]').textContent, /맞았어요/);
});

test("data rounds keep their numeric order and only the judgment rounds shuffle", () => {
  for (const r of dataRounds)
    assert.deepEqual(
      r.options,
      [...r.options].sort((a, b) => parseInt(a) - parseInt(b)),
    );
  for (const rounds of [securityRounds, cloudRounds, aiRounds])
    for (const r of rounds) assert.ok(r.answer >= 0 && r.answer < r.options.length);
});
