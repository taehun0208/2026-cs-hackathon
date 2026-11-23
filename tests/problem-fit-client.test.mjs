import test from "node:test";
import assert from "node:assert/strict";
import { clientHarness } from "./helpers/client-harness.mjs";
import {
  initialProgress,
  missionById,
  LEGACY_CONTENT_VERSION,
} from "../lib/missions.ts";

const fill = async (f, input, value) => {
  assert.ok(input);
  const prototype =
    input.tagName === "TEXTAREA"
      ? f.dom.window.HTMLTextAreaElement.prototype
      : f.dom.window.HTMLInputElement.prototype;
  await f.act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, value);
    input.dispatchEvent(new f.dom.window.Event("input", { bubbles: true }));
  });
  await f.settle();
};

test("a student can distinguish a failed check from interest and save a concrete next activity", async (t) => {
  const f = await clientHarness(t);
  const document = f.dom.window.document;
  await f.click("체험실");
  assert.equal(
    document.querySelectorAll('ol[aria-label="체험 흐름"] li').length,
    3,
  );
  assert.match(
    document.querySelector(".welcome-prerequisite").textContent,
    /JavaScript 기초/,
  );
  assert.equal(
    document.querySelector(".welcome-prerequisite a").getAttribute("href"),
    "/games",
  );
  await f.click("프론트엔드 이어서 해보기");
  await f.click("코드 실행");
  await f.finishRun({
    tests: [
      {
        label: "fixture",
        passed: false,
        why: "fixture",
        actual: [],
        expected: [1],
      },
    ],
    preview: null,
  });
  await f.click("체험 기록");
  const dialog = document.querySelector('[role="dialog"]');
  const note = dialog.querySelector("textarea");
  const guide = document.getElementById(note.getAttribute("aria-describedby"));
  assert.match(guide.textContent, /문법이 낯설었는지/);
  assert.match(guide.textContent, /작업의 조건/);
  await f.click("이 작업이 흥미로웠나요? 4점", dialog);
  await f.click("얼마나 어렵게 느껴졌나요? 2점", dialog);
  await f.click("비슷한 작업을 다시 해보고 싶나요? 4점", dialog);
  await fill(
    f,
    note,
    "문법은 낯설었지만 목록이 바뀌는 과정에 흥미를 느꼈어요.",
  );
  const candidate = dialog.querySelector('input[name="next-activity"]');
  assert.ok(candidate);
  await f.act(async () => candidate.click());
  await fill(
    f,
    dialog.querySelector('input[type="text"]'),
    "화면 조건을 하나 더 바꿔보고 싶어서요.",
  );
  await f.click("경험 기록하기", dialog);
  await f.settle(1000);
  const reflection = f.stored.progress.frontend.reflection;
  assert.equal(reflection.interest, 4);
  assert.equal(reflection.difficulty, 2);
  assert.equal(reflection.execution.result.tests[0].passed, false);
  assert.equal(
    reflection.nextPlan.selectionReason,
    "화면 조건을 하나 더 바꿔보고 싶어서요.",
  );
  const link = [...document.querySelectorAll(".next-action a")].find((a) =>
    a.textContent.includes("선택한 활동 안내 보기"),
  );
  assert.ok(link);
  assert.equal(link.getAttribute("href"), "/activities/extend/frontend");
});

test("home shows the time of the started mission rather than the newest shorter experience", async (t) => {
  const pinned = missionById("frontend", LEGACY_CONTENT_VERSION);
  const f = await clientHarness(t, {
    url: "http://localhost/",
    state: { version: 1, progress: { frontend: initialProgress(pinned) } },
  });
  const card = f.dom.window.document.querySelector(
    '[aria-label="프론트엔드 이어서 해보기"]',
  );
  assert.ok(card);
  assert.match(card.textContent, new RegExp(`약 ${pinned.time}`));
});

test("journal guidance leads to an available reflection only after the current user edit has run", async (t) => {
  const mission = missionById("frontend");
  const f = await clientHarness(t, {
    state: {
      version: 1,
      progress: { frontend: initialProgress(mission) },
    },
  });
  const document = f.dom.window.document;
  const editor = () =>
    document.querySelector('textarea[aria-label="미션 코드 편집기"]');
  const checkGuidance = async (canReflect) => {
    await f.click("나의 기록");
    const card = document.querySelector(".record-card");
    assert.ok(card);
    assert.match(
      card.textContent,
      canReflect
        ? /회고를 남기면 완료 기록이 돼요/
        : /코드를 수정하고 실행해보세요/,
    );
    await f.click("이어서 하기", card);
    const record = [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === "체험 기록",
    );
    assert.ok(record);
    assert.equal(record.disabled, !canReflect);
  };

  // Running untouched code is exploration, not a user-edited attempt.
  await f.click("먼저 그대로 실행해보기");
  await f.finishRun();
  await checkGuidance(false);

  // An edit does not inherit a prior run's eligibility.
  await fill(f, editor(), mission.starter + "\n// user edit");
  await checkGuidance(false);
  await f.click("코드 실행");
  await f.finishRun({
    tests: [{ label: "fixture", passed: false, why: "not yet" }],
    preview: null,
  });
  await checkGuidance(true);
  await fill(f, editor(), editor().value + "\n// another edit");
  await checkGuidance(false);

  // Reference output alone must not suggest a reflection, even if it passes.
  await f.click("참고 풀이 살펴보기");
  await f.click(
    "참고 풀이 불러오기",
    document.querySelector('[role="dialog"]'),
  );
  await f.click("코드 실행");
  await f.finishRun({
    tests: [{ label: "fixture", passed: true, why: "reference" }],
    preview: null,
  });
  await checkGuidance(false);
  await fill(f, editor(), editor().value + "\n// changed by the student");
  await f.click("코드 실행");
  await f.finishRun();
  await checkGuidance(true);
});
