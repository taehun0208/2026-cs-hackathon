import test from "node:test";
import assert from "node:assert/strict";
import { clientHarness, deferred } from "./helpers/client-harness.mjs";

const finishBackend = async (f) => {
  for (const step of [
    "민지 남은 자리 확인",
    "준호 남은 자리 확인",
    "민지 표 발급",
    "준호 표 발급",
  ])
    await f.click(step);
  await f.act(async () =>
    f.dom.window.document.querySelector('input[name="fix"]').click(),
  );
  await f.click("20가지 순서로 시험하기");
  await f.click("마치기");
};

const blockLocalBackup = async (f) => {
  const storage = f.dom.window.Storage.prototype;
  const setItem = storage.setItem;
  f.dom.window.localStorage.clear();
  f.dom.window.sessionStorage.clear();
  storage.setItem = function (...args) {
    if (this === f.dom.window.localStorage)
      throw new f.dom.window.DOMException("Storage full", "QuotaExceededError");
    return setItem.apply(this, args);
  };
  await f.reload();
};

test("a game offers an actual backup while browser storage fails and the server save is pending", async (t) => {
  const f = await clientHarness(t, {
    game: true,
    url: "http://localhost/games?track=backend",
  });
  const save = deferred();
  const fetcher = globalThis.fetch;
  globalThis.fetch = (url, options = {}) =>
    url === "/api/state" && options.method === "POST"
      ? save.promise
      : fetcher(url, options);
  await blockLocalBackup(f);
  const backups = [];
  const createURL = URL.createObjectURL;
  const revokeURL = URL.revokeObjectURL;
  URL.createObjectURL = (blob) => {
    backups.push(blob);
    return "blob:game-backup";
  };
  URL.revokeObjectURL = () => {};
  f.dom.window.HTMLAnchorElement.prototype.click = () => {};
  t.after(() => {
    URL.createObjectURL = createURL;
    URL.revokeObjectURL = revokeURL;
  });
  try {
    await finishBackend(f);
    await f.settle(1000);
    const document = f.dom.window.document;
    assert.ok(document.querySelector(".save-state.saving"));
    assert.ok(document.querySelector("#game-complete-title"));
    assert.match(document.body.textContent, /기기 초안을 보관하지 못했어요/);
    await f.click("기록 내려받기");
    assert.equal(backups.length, 1);
    const exported = JSON.parse(await backups[0].text());
    assert.ok(exported.games.backend.completedAt);
    assert.match(exported.progress.frontend.code, /user work/);
  } finally {
    await f.act(async () =>
      save.resolve(Response.json({ error: "offline" }, { status: 503 })),
    );
  }
});

test("a failed initial record load keeps games locked until retry succeeds", async (t) => {
  const f = await clientHarness(t, {
    game: true,
    state: { version: 1, progress: {} },
    url: "http://localhost/games?track=backend",
  });
  const fetcher = globalThis.fetch;
  let offline = true;
  globalThis.fetch = (url, options = {}) =>
    offline && url === "/api/state" && (options.method ?? "GET") === "GET"
      ? Promise.resolve(
          Response.json({ error: "unavailable" }, { status: 503 }),
        )
      : fetcher(url, options);
  await f.reload();
  const document = f.dom.window.document;
  assert.ok(document.querySelector(".save-state.error"));
  assert.ok(document.querySelector("main[inert]"));
  offline = false;
  await f.click("다시 시도");
  assert.ok(document.querySelector("main[inert]") === null);
  assert.equal(document.querySelector("h1").textContent, "마지막 표 한 장");
  await f.click("민지 남은 자리 확인");
});

test("a failed game save keeps completion locally and retry persists it before refresh", async (t) => {
  const f = await clientHarness(t, {
    game: true,
    url: "http://localhost/games?track=backend",
  });
  const fetcher = globalThis.fetch;
  let offline = true;
  globalThis.fetch = (url, options = {}) =>
    offline && url === "/api/state" && options.method === "POST"
      ? Promise.resolve(
          Response.json({ error: "unavailable" }, { status: 503 }),
        )
      : fetcher(url, options);
  await f.reload();
  await finishBackend(f);
  await f.settle(1000);
  const document = f.dom.window.document;
  assert.ok(document.querySelector(".save-state.error"));
  assert.ok(document.querySelector(".save-state.saved") === null);
  assert.ok(document.querySelector("#game-complete-title"));
  assert.match(
    document.body.textContent,
    /이 브라우저에 초안을 보관하고 있어요/,
  );
  assert.equal(f.stored.games, undefined);
  offline = false;
  await f.click("다시 시도");
  assert.ok(document.querySelector(".save-state.saved"));
  assert.ok(f.stored.games.backend.completedAt);
  await f.reload();
  assert.ok(document.querySelector("#game-complete-title"));
});

test("a successful server save still offers the requested backup when browser storage is unavailable", async (t) => {
  const f = await clientHarness(t, {
    game: true,
    url: "http://localhost/games?track=backend",
  });
  await blockLocalBackup(f);
  await finishBackend(f);
  await f.settle(1000);
  const document = f.dom.window.document;
  assert.ok(document.querySelector(".save-state.saved"));
  assert.ok(f.stored.games.backend);
  const banner = document.querySelector('[aria-label="게임 기록 저장 안내"]');
  assert.match(banner.textContent, /기록을 내려받아주세요/);
  assert.ok(
    [...banner.querySelectorAll("button")].some(
      (button) => button.textContent === "기록 내려받기",
    ),
  );
});
