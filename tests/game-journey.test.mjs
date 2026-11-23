import test from "node:test";
import assert from "node:assert/strict";
import { aiRounds } from "../lib/game-rounds.ts";
import { summarizeAnalytics } from "../lib/analytics-report.ts";
import { clientHarness } from "./helpers/client-harness.mjs";

async function gameHarness(t) {
  const previousFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  t.after(() => {
    if (previousFrame) globalThis.requestAnimationFrame = previousFrame;
    else delete globalThis.requestAnimationFrame;
  });
  return clientHarness(t, {
    game: true,
    analytics: true,
    url: "http://localhost/games?track=ai",
  });
}

async function wrongAnswer(f, round) {
  const options = f.dom.window.document.querySelectorAll(
    '.tools input[type="radio"]',
  );
  await f.act(async () =>
    options[(round.answer + 1) % round.options.length].click(),
  );
  await f.click("판정하기");
}

async function zeroScoreSummary(f) {
  for (const [index, round] of aiRounds.entries()) {
    await wrongAnswer(f, round);
    await f.click(index === aiRounds.length - 1 ? "결과 보기" : "다음 상황");
  }
  assert.equal(
    f.dom.window.document.querySelector(".tools h2").textContent,
    "4개 중 0개를 맞혔어요",
  );
  assert.equal(
    f.stored.games,
    undefined,
    "looking at a result is not yet finishing the experience",
  );
}

function reportFor(f) {
  const report = summarizeAnalytics(
    f.events.map((event) => ({
      owner: "synthetic-game-browser",
      participantCode: null,
      receivedAt: Date.now(),
      event,
    })),
  );
  assert.equal(report.quality.invalid, 0);
  assert.equal(
    report.codeTargets.firstObservedNewExperienceCompletion.denominator,
    0,
  );
  assert.equal(report.codeTargets.twoRolesAndNextAction.denominator, 0);
  return report.perRole.find(
    (role) => role.surface === "game" && role.track === "ai",
  );
}

test("zero correct answers can finish a game; replay abandonment keeps the finished record and interest", async (t) => {
  const f = await gameHarness(t);
  await zeroScoreSummary(f);
  await f.click("마치기");
  await f.settle(1000);
  const completed = structuredClone(f.stored.games.ai);
  const firstStart = f.events.find((event) => event.name === "mission_start");
  const firstJourney = f.events.filter(
    (event) => event.context?.journeyId === firstStart.context.journeyId,
  );
  const checks = firstJourney.filter((event) => event.name === "game_check");
  assert.equal(checks.length, 4);
  assert.ok(checks.every((event) => event.data.passed === false));
  assert.deepEqual(
    firstJourney
      .filter((event) => event.name === "mission_end")
      .map((event) => event.data.outcome),
    ["completed"],
  );
  assert.ok(completed.completedAt);

  const interest = f.dom.window.document.querySelector(
    'input[name="game-interest"][value="4"]',
  );
  await f.act(async () => interest.click());
  await f.settle(1000);
  const rated = structuredClone(f.stored.games.ai);
  assert.equal(rated.completedAt, completed.completedAt);
  assert.equal(rated.interest, 4);
  assert.ok(Date.parse(rated.updatedAt) >= Date.parse(completed.updatedAt));

  await f.click("한 번 더 해보기");
  await wrongAnswer(f, aiRounds[0]);
  await f.click("직무 목록");
  await f.settle(700);
  const starts = f.events.filter((event) => event.name === "mission_start");
  assert.equal(starts.length, 2);
  assert.notEqual(starts[1].context.journeyId, firstStart.context.journeyId);
  const replay = f.events.filter(
    (event) => event.context?.journeyId === starts[1].context.journeyId,
  );
  assert.equal(replay.filter((event) => event.name === "game_check").length, 1);
  assert.deepEqual(
    replay
      .filter((event) => event.name === "mission_end")
      .map((event) => event.data.outcome),
    ["left"],
  );
  assert.deepEqual(f.stored.games.ai, rated);
  await f.click("AI 엔지니어 게임 시작");
  await f.reload();
  await f.settle(700);
  assert.ok(f.dom.window.document.querySelector("#game-complete-title"));
  assert.equal(
    f.dom.window.document.querySelector(
      'input[name="game-interest"][value="4"]',
    ).checked,
    true,
  );
  assert.equal(
    f.events.filter((event) => event.name === "mission_start").length,
    2,
  );
  assert.equal(
    f.events.filter((event) => event.name === "mission_end").length,
    2,
  );
  assert.deepEqual(f.stored.games.ai, rated);
  const report = reportFor(f);
  assert.equal(report.starts, 2);
  assert.equal(report.gameChecks, 5);
  assert.equal(report.gameRetries, 5);
  assert.equal(
    report.gameCompleted,
    1,
    "finishing is independent of answer correctness",
  );
  assert.equal(report.leftWithoutSaved, 1);
  assert.equal(report.unresolved, 0);
});

test("leaving a zero-score summary without finishing records departure rather than game completion", async (t) => {
  const f = await gameHarness(t);
  await zeroScoreSummary(f);
  await f.click("직무 목록");
  await f.settle(700);
  assert.equal(
    f.events.filter((event) => event.name === "mission_start").length,
    1,
  );
  assert.equal(
    f.events.filter((event) => event.name === "game_check").length,
    4,
  );
  assert.deepEqual(
    f.events
      .filter((event) => event.name === "mission_end")
      .map((event) => event.data.outcome),
    ["left"],
  );
  assert.equal(f.stored.games, undefined);
  const report = reportFor(f);
  assert.equal(report.gameCompleted, 0);
  assert.equal(report.leftWithoutSaved, 1);
  assert.equal(report.unresolved, 0);
});
