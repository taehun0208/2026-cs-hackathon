import test from "node:test";
import assert from "node:assert/strict";
import { clientHarness } from "./helpers/client-harness.mjs";

test("job cards keep headings and descriptions outside the button so they stay navigable and readable", async (t) => {
  const f = await clientHarness(t, { url: "http://localhost/" });
  const document = f.dom.window.document;
  const cards = [...document.querySelectorAll("article.job-card")];
  assert.equal(cards.length, 6);
  for (const card of cards) {
    const title = card.querySelector("h3");
    assert.ok(title?.textContent.trim(), "card has no heading");
    assert.equal(card.getAttribute("aria-labelledby"), title.id);
    assert.equal(title.closest("button"), null, "heading is inside a button");
    const buttons = card.querySelectorAll("button");
    assert.equal(buttons.length, 1, "card should expose exactly one action");
    const [button] = buttons;
    assert.equal(
      button.querySelector("h1,h2,h3,h4,h5,h6,p,div,ul,ol"),
      null,
      "button contains non-phrasing content",
    );
    assert.match(
      button.getAttribute("aria-label"),
      /체험 시작|이어서 해보기|체험 다시 열기|새 체험 준비 중/,
    );
    assert.match(
      card.querySelector(".job-info > p:not(.job-role)").textContent,
      /\S/,
    );
  }
  const titles = cards.map((card) =>
    card.querySelector("h3").textContent.trim(),
  );
  assert.equal(new Set(titles).size, 6);
});

test("the card action still starts the matching experience", async (t) => {
  const f = await clientHarness(t, { url: "http://localhost/" });
  await f.click("백엔드 체험 시작");
  assert.equal(f.dom.window.location.search, "?track=backend");
});
