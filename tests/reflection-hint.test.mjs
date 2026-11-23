import test from "node:test";
import assert from "node:assert/strict";
import { clientHarness } from "./helpers/client-harness.mjs";

test("the disabled reflection button explains when it opens, and the hint goes away after a run", async (t) => {
  const f = await clientHarness(t);
  const document = f.dom.window.document;
  await f.click("체험실");
  await f.click("프론트엔드 이어서 해보기");
  const button = () =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === "체험 기록",
    );
  assert.equal(button().disabled, true);
  const hint = document.getElementById("reflect-hint");
  assert.ok(hint, "a visible reason is shown next to the disabled button");
  assert.equal(button().getAttribute("aria-describedby"), "reflect-hint");
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
  assert.equal(button().disabled, false);
  assert.equal(document.getElementById("reflect-hint"), null);
});
