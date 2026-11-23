import test from "node:test";
import assert from "node:assert/strict";
import { clientHarness } from "./helpers/client-harness.mjs";

test("the client harness rejects state payloads that the real save API rejects", async (t) => {
  const f = await clientHarness(t);
  const original = structuredClone(f.stored);
  const invalid = {
    ...original,
    games: {
      frontend: {
        version: 1,
        completedAt: "2026-11-23T00:00:00.000Z",
        updatedAt: "2026-11-23T00:00:00.000Z",
        interest: 6,
      },
    },
  };
  const response = await fetch("/api/state", {
    method: "POST",
    body: JSON.stringify(invalid),
  });
  assert.equal(response.status, 400);
  assert.deepEqual(
    f.stored,
    original,
    "a rejected payload cannot overwrite saved work",
  );
  const malformed = await fetch("/api/state", { method: "POST", body: "{" });
  assert.equal(malformed.status, 400);
  assert.deepEqual(f.stored, original);

  const valid = {
    ...original,
    profile: { experience: "과거 입력", purpose: null, aiConsent: false },
  };
  const saved = await fetch("/api/state", {
    method: "POST",
    body: JSON.stringify(valid),
  });
  assert.equal(saved.status, 200);
  assert.equal(f.stored.profile.experience, "과거 입력");
  assert.equal(f.stored.profile.experienceSource, "legacy_unverified");
});

test("the client harness refuses buttons disabled by their surrounding fieldset", async (t) => {
  const f = await clientHarness(t);
  const fieldset = f.dom.window.document.createElement("fieldset");
  fieldset.disabled = true;
  const button = f.dom.window.document.createElement("button");
  button.textContent = "잠긴 응답 제출";
  fieldset.append(button);
  f.dom.window.document.body.append(fieldset);
  assert.equal(
    button.disabled,
    false,
    "the property alone misses inherited disabled state",
  );
  assert.equal(button.matches(":disabled"), true);
  await assert.rejects(f.click("잠긴 응답 제출"), /Disabled button/);
});
