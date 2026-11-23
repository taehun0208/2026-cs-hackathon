import test from "node:test";
import assert from "node:assert/strict";
import { LEGACY_CONTENT_VERSION } from "../lib/missions.ts";
import { identity, sameOrigin, stateSchema } from "../lib/server.ts";
test("browser-facing Host is used while foreign origins and forwarded-host spoofing are rejected", () => {
  const request = (origin, extra = {}) =>
    new Request("http://localhost:3000/api/state", {
      headers: {
        Host: "127.0.0.1:3000",
        Origin: origin,
        "Content-Type": "application/json",
        ...extra,
      },
    });
  assert.ok(sameOrigin(request("http://127.0.0.1:3000")));
  assert.equal(
    sameOrigin(
      request("https://evil.example", { "X-Forwarded-Host": "evil.example" }),
    ),
    false,
  );
  assert.equal(sameOrigin(request("null")), false);
  assert.equal(
    sameOrigin(
      request("http://127.0.0.1:3000", { "Content-Type": "text/plain" }),
    ),
    false,
  );
});
test("identity ignores legacy user headers and reuses only valid opaque cookies", () => {
  const first = identity(
    new Request("https://lab.example", {
      headers: { "x-oai-user-id": "victim" },
    }),
  );
  assert.match(first.key, /^guest:[0-9a-f-]{36}$/);
  assert.ok(!first.key.includes("victim"));
  assert.match(first.cookie, /HttpOnly; SameSite=Lax/);
  const cookie = first.cookie.split(";")[0];
  const next = identity(
    new Request("https://lab.example", { headers: { Cookie: cookie } }),
  );
  assert.equal(first.key, next.key);
  assert.equal(next.cookie, "");
  const bad = identity(
    new Request("https://lab.example", {
      headers: { Cookie: "lab_session=not-a-valid-id" },
    }),
  );
  assert.notEqual(bad.key, "guest:not-a-valid-id");
});
test("server state preserves all six role records", () => {
  const progress = {
    version: 1,
    code: "function example(){}",
    runs: 1,
    hintLevel: 0,
    usedSolution: false,
    updatedAt: new Date().toISOString(),
  };
  const records = Object.fromEntries(
    ["frontend", "backend", "data", "ai", "security", "cloud"].map((id) => [
      id,
      progress,
    ]),
  );
  assert.deepEqual(
    stateSchema.parse({ version: 1, progress: records }).progress,
    Object.fromEntries(
      Object.entries(records).map(([id, p]) => [
        id,
        {
          ...p,
          contentVersion: LEGACY_CONTENT_VERSION,
          contentVersionSource: "legacy_baseline",
          codeRevision: 0,
          codeSource: "legacy",
        },
      ]),
    ),
  );
});

test("successful-save identity renewal retains the owner; deletion rotates it", () => {
  const first = identity(new Request("https://lab.example"));
  const req = new Request("https://lab.example", {
    headers: { Cookie: first.cookie.split(";")[0] },
  });
  const renewed = identity(req, false, true);
  assert.equal(renewed.key, first.key);
  assert.match(renewed.cookie, /Max-Age=2592000/);
  assert.notEqual(identity(req, true).key, first.key);
});

test("validation upgrade preserves partial game maps and earlier results without a preview", () => {
  const stamp = new Date().toISOString(),
    progress = {
      version: 1,
      code: "function example(){}",
      runs: 1,
      hintLevel: 0,
      usedSolution: false,
      updatedAt: stamp,
      result: { tests: [] },
    },
    game = { version: 1, completedAt: stamp, updatedAt: stamp };
  for (const games of [{}, { frontend: game }]) {
    const parsed = stateSchema.parse({
      version: 1,
      progress: { frontend: progress },
      games,
    });
    assert.deepEqual(parsed.games, games);
    assert.deepEqual(parsed.progress.frontend.result, { tests: [] });
  }
  assert.equal(
    stateSchema.safeParse({ version: 1, progress: {}, games: { other: game } })
      .success,
    false,
  );
});
