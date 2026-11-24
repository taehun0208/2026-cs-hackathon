import test from "node:test";
import assert from "node:assert/strict";
import { frontendRounds } from "../lib/game-rounds.ts";
import { clientHarness } from "./helpers/client-harness.mjs";

test("game transitions put keyboard focus on the new screen heading", async (t) => {
  const f = await clientHarness(t, {
    game: true,
    url: "http://localhost/games",
  });
  const document = f.dom.window.document;
  await f.click("백엔드 게임 시작");
  assert.ok(document.activeElement === document.querySelector("h1"));

  for (const step of [
    "민지 남은 자리 확인",
    "준호 남은 자리 확인",
    "민지 표 발급",
    "준호 표 발급",
  ]) {
    await f.act(async () => {
      document.querySelector(`button[aria-label="${step}"]`).focus();
    });
    await f.click(step);
  }
  assert.ok(document.activeElement === document.querySelector(".tools h2"));
  const lock = document.querySelector('input[name="fix"]');
  await f.act(async () => lock.click());
  await f.click("20가지 순서로 시험하기");
  await f.click("마치기");
  assert.ok(
    document.activeElement === document.querySelector("#game-complete-title"),
  );
  await f.click("한 번 더 해보기");
  assert.ok(document.activeElement === document.querySelector("h1"));
  await f.click("직무 목록");
  assert.ok(document.activeElement === document.querySelector("h1"));
});

test("frontend result is remeasured when the available screen width changes", async (t) => {
  const previousFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  t.after(() => {
    if (previousFrame) globalThis.requestAnimationFrame = previousFrame;
    else delete globalThis.requestAnimationFrame;
  });
  const f = await clientHarness(t, { game: true });
  const document = f.dom.window.document;
  const sample = document.querySelector(".sample");
  Object.defineProperties(sample, {
    scrollWidth: { configurable: true, value: 200 },
    clientWidth: { configurable: true, value: 100 },
  });
  await f.act(async () => {
    f.dom.window.dispatchEvent(new f.dom.window.Event("resize"));
  });
  await f.click("결과 확인");
  assert.match(document.body.textContent, /아직 이름이 잘리는 상황이 1개/);
  assert.equal(document.querySelector("#game-complete-title"), null);

  Object.defineProperty(sample, "clientWidth", {
    configurable: true,
    value: 200,
  });
  await f.act(async () => {
    f.dom.window.dispatchEvent(new f.dom.window.Event("resize"));
  });
  await f.click("결과 확인");
  // 4가지 상황을 통과하면 바로 끝나지 않고, 고친 이유를 확인하는 단계가 나와요.
  assert.equal(document.querySelector("#game-complete-title"), null);
  assert.match(document.body.textContent, /방금 고친 이유/);
  for (const [index, round] of frontendRounds.entries()) {
    const choice = [...document.querySelectorAll("fieldset label")].find(
      (l) => l.textContent.trim() === round.options[round.answer],
    );
    await f.act(async () => choice.querySelector("input").click());
    await f.click("판정하기");
    await f.click(index === frontendRounds.length - 1 ? "결과 보기" : "다음 상황");
  }
  await f.click("마치기");
  assert.ok(document.querySelector("#game-complete-title"));
});

for (const [track, criteria] of [
  ["cloud", [/100건/, /2%/, /500ms/]],
  ["security", [/로그인/, /자신의 신청/, /관리자.*조회만/]],
]) {
  test(`${track} shows the service policy before the first judgment`, async (t) => {
    const f = await clientHarness(t, {
      game: true,
      url: `http://localhost/games?track=${track}`,
    });
    const document = f.dom.window.document;
    const policy = document.querySelector('[aria-label="판정 기준"]');
    assert.ok(
      policy,
      "First-time players need the policy used to judge their answer",
    );
    for (const criterion of criteria)
      assert.match(policy.textContent, criterion);
    assert.equal(document.querySelector("button.btn.primary").disabled, true);
    assert.doesNotMatch(document.body.textContent, /정답:/);
  });
}

for (const [track, roundCount] of [
  ["cloud", 4],
  ["security", 6],
  ["ai", 4],
  ["data", 3],
]) {
  test(`${track} completes each situation once and restores the optional interest rating`, async (t) => {
    const previousFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
    t.after(() => {
      if (previousFrame) globalThis.requestAnimationFrame = previousFrame;
      else delete globalThis.requestAnimationFrame;
    });
    const f = await clientHarness(t, {
      game: true,
      analytics: true,
      url: `http://localhost/games?track=${track}`,
    });
    const document = f.dom.window.document;
    for (let i = 0; i < roundCount; i++) {
      const firstOption = document.querySelector('.tools input[type="radio"]');
      await f.act(async () => firstOption.click());
      await f.act(async () =>
        document.querySelector(".tools button.btn.primary").focus(),
      );
      await f.click("판정하기");
      assert.ok(
        document.activeElement ===
          document.querySelector(".tools button.btn.primary"),
      );
      assert.equal(
        document.activeElement.getAttribute("aria-describedby"),
        document.querySelector('.tools [role="status"]').id,
      );
      assert.ok(
        [...document.querySelectorAll('.tools input[type="radio"]')].every(
          (input) => input.disabled || input.closest("fieldset").disabled,
        ),
      );
      await f.click(i === roundCount - 1 ? "결과 보기" : "다음 상황");
      assert.ok(document.activeElement === document.querySelector(".tools h2"));
      if (i < roundCount - 1) {
        assert.equal(
          document.querySelector(".tools button.btn.primary").disabled,
          true,
        );
      }
    }
    assert.match(
      document.querySelector(".tools h2").textContent,
      new RegExp(`${roundCount}개 중`),
    );
    await f.click("마치기");
    const interest = document.querySelector(
      'input[name="game-interest"][value="4"]',
    );
    await f.act(async () => interest.click());
    await f.settle(1000);
    assert.equal(f.stored.games[track].interest, 4);
    assert.equal(
      f.events.filter((event) => event.name === "game_check").length,
      roundCount,
    );
    assert.equal(
      f.events.filter((event) => event.name === "mission_start").length,
      1,
    );
    await f.reload();
    assert.ok(document.querySelector("#game-complete-title"));
    assert.equal(
      document.querySelector('input[name="game-interest"][value="4"]').checked,
      true,
    );
    assert.equal(document.querySelector(".tools"), null);
  });
}
