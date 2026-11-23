import test from "node:test";
import assert from "node:assert/strict";
import { clientHarness } from "./helpers/client-harness.mjs";

const consentBox = (document) =>
  [...document.querySelectorAll('input[type="checkbox"]')].find((node) =>
    node.closest("label")?.textContent.includes("OpenAI"),
  );

test("the coach consent checkbox stays mounted, keeps focus, and can be turned off again", async (t) => {
  const f = await clientHarness(t);
  const document = f.dom.window.document;
  let box = consentBox(document);
  assert.ok(box, "coach consent checkbox is missing");
  assert.equal(box.checked, false);
  box.focus();
  await f.act(async () => box.click());
  await f.settle(1000);
  assert.ok(box.isConnected, "checkbox was removed after consenting");
  assert.equal(consentBox(document), box);
  assert.equal(box.checked, true);
  assert.equal(document.activeElement, box, "focus was lost after consenting");
  assert.equal(f.stored.profile.aiConsent, true);

  await f.act(async () => box.click());
  await f.settle(1000);
  assert.equal(consentBox(document).checked, false);
  assert.equal(f.stored.profile.aiConsent, false);
});
