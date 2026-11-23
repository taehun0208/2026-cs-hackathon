import test from "node:test";
import assert from "node:assert/strict";
import {
  allBackendOrders,
  backendOutcome,
  backendState,
  countOversold,
  countVisits,
  oversold,
} from "../lib/game-rules.ts";
import {
  aiRounds,
  cloudRounds,
  dataRounds,
  securityRounds,
} from "../lib/game-rounds.ts";

test("backend: 20 interleavings exist and the original demo order oversells", () => {
  assert.equal(allBackendOrders.length, 20);
  assert.ok(oversold([0, 1, 0, 1, 0, 1]));
  assert.equal(backendState([0, 1, 0, 1, 0, 1]).seats, -1);
  assert.ok(!oversold([0, 0, 0, 1, 1, 1]));
});
test("backend: only the lock fully protects the last ticket; re-checking only helps some orders", () => {
  const none = countOversold("servers");
  const recheck = countOversold("recheck");
  assert.ok(none > 0);
  assert.ok(recheck > 0 && recheck < none);
  assert.equal(countOversold("lock"), 0);
  for (const turns of allBackendOrders) {
    const state = backendOutcome(turns, "lock");
    assert.equal(state.seats, 0);
    assert.equal(state.tickets.filter(Boolean).length, 1);
  }
  assert.equal(none, allBackendOrders.filter(oversold).length);
});
test("data: the same 16 records give different counts for different questions", () => {
  assert.equal(countVisits(false, false), 16);
  assert.equal(countVisits(false, true), 8);
  assert.equal(countVisits(true, false), 13);
  assert.equal(countVisits(true, true), 6);
});
function wellFormed(rounds) {
  for (const r of rounds) {
    assert.ok(r.facts.length > 0 && r.question && r.why);
    assert.equal(new Set(r.options).size, r.options.length);
    assert.ok(
      Number.isInteger(r.answer) &&
        r.answer >= 0 &&
        r.answer < r.options.length,
    );
  }
}
test("every round has a valid answer and an explanation", () => {
  for (const rounds of [securityRounds, cloudRounds, aiRounds, dataRounds])
    wellFormed(rounds);
});
test("data rounds match the counting rules", () => {
  assert.deepEqual(
    dataRounds.map((r) => r.options[r.answer]),
    ["6명", "13회", "7회"],
  );
});
test("security rounds follow the 401/200/403 rule and cover every outcome", () => {
  const picked = securityRounds.map((r) => r.options[r.answer]);
  assert.deepEqual(picked, [
    "로그인이 필요해요 (401)",
    "허용해요 (200)",
    "권한이 없어요 (403)",
    "허용해요 (200)",
    "권한이 없어요 (403)",
    "허용해요 (200)",
  ]);
});
test("cloud rounds cover wait, rollback (error rate and latency) and promote", () => {
  const picked = cloudRounds.map((r) => r.options[r.answer].split(" ")[0]);
  assert.deepEqual(picked, ["더", "이전", "이전", "더"]);
  assert.match(cloudRounds[0].options[cloudRounds[0].answer], /wait/);
  assert.match(cloudRounds[3].options[cloudRounds[3].answer], /promote/);
});
test("AI rounds include a grounded 'I don't know' answer as correct", () => {
  assert.deepEqual(
    aiRounds.map((r) => r.answer),
    [0, 1, 2, 0],
  );
  assert.match(aiRounds[3].facts[2], /주차 안내가 없어요/);
});
