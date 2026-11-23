import test from "node:test";
import assert from "node:assert/strict";
import { clientHarness } from "./helpers/client-harness.mjs";
import { DRAFT_KEY } from "../lib/persistence.ts";

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
const openReflection = async (f) => {
  await f.click("체험 기록");
  return f.dom.window.document.querySelector('[role="dialog"]');
};
const escape = async (f) => {
  await f.act(async () => {
    f.dom.window.dispatchEvent(
      new f.dom.window.KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
      }),
    );
  });
  await f.settle();
};

test("closing the reflection with Esc or the backdrop keeps what the student was writing", async (t) => {
  const f = await clientHarness(t);
  const document = f.dom.window.document;
  await f.click("체험실");
  await f.click("프론트엔드 이어서 해보기");
  await f.click("코드 실행");
  await f.finishRun({
    tests: [
      {
        label: "fixture",
        passed: true,
        why: "fixture",
        actual: [],
        expected: [],
      },
    ],
    preview: null,
  });
  let dialog = await openReflection(f);
  await f.click("이 작업이 흥미로웠나요? 4점", dialog);
  await f.click("얼마나 어렵게 느껴졌나요? 2점", dialog);
  await f.click("비슷한 작업을 다시 해보고 싶나요? 4점", dialog);
  await fill(f, dialog.querySelector("textarea"), "작성 중인 메모");
  await f.act(async () =>
    dialog.querySelector('input[name="next-activity"]').click(),
  );
  await fill(f, dialog.querySelector('input[type="text"]'), "작성 중인 이유");

  await escape(f);
  assert.equal(document.querySelector('[role="dialog"]'), null);
  dialog = await openReflection(f);
  assert.equal(dialog.querySelector("textarea").value, "작성 중인 메모");
  assert.equal(
    dialog
      .querySelector('button[aria-label="이 작업이 흥미로웠나요? 4점"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    dialog.querySelector('input[name="next-activity"]').checked,
    true,
  );
  assert.equal(
    dialog.querySelector('input[type="text"]').value,
    "작성 중인 이유",
  );

  await f.act(async () =>
    document
      .querySelector(".modal-overlay")
      .dispatchEvent(
        new f.dom.window.MouseEvent("mousedown", { bubbles: true }),
      ),
  );
  assert.equal(document.querySelector('[role="dialog"]'), null);
  dialog = await openReflection(f);
  assert.equal(dialog.querySelector("textarea").value, "작성 중인 메모");
});

test("a submitted reflection clears the draft so the next opening shows the saved record", async (t) => {
  const f = await clientHarness(t, { analytics: true });
  const document = f.dom.window.document;
  await f.click("체험실");
  await f.click("프론트엔드 이어서 해보기");
  await f.click("코드 실행");
  await f.finishRun({
    tests: [
      {
        label: "fixture",
        passed: true,
        why: "fixture",
        actual: [],
        expected: [],
      },
    ],
    preview: null,
  });
  let dialog = await openReflection(f);
  await f.click("이 작업이 흥미로웠나요? 4점", dialog);
  await f.click("얼마나 어렵게 느껴졌나요? 2점", dialog);
  await f.click("비슷한 작업을 다시 해보고 싶나요? 4점", dialog);
  await fill(f, dialog.querySelector("textarea"), "제출한 메모");
  await f.act(async () =>
    dialog.querySelector('input[name="next-activity"]').click(),
  );
  await fill(f, dialog.querySelector('input[type="text"]'), "제출한 이유");
  await f.click("경험 기록하기", dialog);
  await f.settle(1000);
  assert.equal(f.stored.progress.frontend.reflection.note, "제출한 메모");
  // Acknowledgement events have their own batch timer after autosave finishes.
  await f.settle(700);
  assert.equal(
    f.events.filter((e) => e.name === "reflection_submit").length,
    1,
  );
  assert.equal(f.events.filter((e) => e.name === "reflection_saved").length, 1);
  assert.equal(
    f.events.filter((e) => e.name === "next_action_committed").length,
    1,
  );
  await f.click("체험실");
  await f.click("프론트엔드 체험 다시 열기");
  dialog = await openReflection(f);
  assert.equal(dialog.querySelector("textarea").value, "제출한 메모");
  await fill(f, dialog.querySelector("textarea"), "고치는 중인 메모");
  await escape(f);
  dialog = await openReflection(f);
  assert.equal(dialog.querySelector("textarea").value, "고치는 중인 메모");
  assert.ok(document.querySelector('[role="dialog"]'));
});

test("deletion in another tab closes the reflection without saving its unsaved draft", async (t) => {
  const f = await clientHarness(t);
  const document = f.dom.window.document;
  await f.click("코드 실행");
  await f.finishRun();
  const dialog = await openReflection(f);
  await fill(f, dialog.querySelector("textarea"), "삭제할 회고 초안");
  await f.click("이 작업이 흥미로웠나요? 4점", dialog);
  const before = f.calls.length;
  await f.act(async () => {
    localStorage.removeItem(DRAFT_KEY);
    f.dom.window.dispatchEvent(
      new f.dom.window.StorageEvent("storage", {
        key: DRAFT_KEY,
        newValue: null,
      }),
    );
  });
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.querySelector("main").hasAttribute("inert"), true);
  assert.match(document.body.textContent, /다른 탭에서 기록을 삭제했어요/);
  await f.settle(1000);
  assert.equal(
    f.calls.slice(before).some((call) => call.method === "POST"),
    false,
  );

  assert.equal(localStorage.getItem(DRAFT_KEY), null);
});
