// Temporary QA cookie only; never reads other users' events or starts a real pilot.
import assert from "node:assert/strict";
import { missions } from "../lib/missions.ts";
const base = process.env.LAB_TEST_URL ?? "http://127.0.0.1:3000";
const first = await fetch(base + "/api/analytics");
assert.equal(first.status, 200);
assert.equal((await first.json()).enabled, false);
const cookie = first.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
const headers = {
  Cookie: cookie,
  Origin: base,
  "Content-Type": "application/json",
};
const request = (method, body) =>
  fetch(base + "/api/analytics", {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
try {
  const event = {
    version: 1,
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    context: {
      journeyId: crypto.randomUUID(),
      surface: "code",
      track: "frontend",
      contentVersion: missions[0].contentVersion,
    },
    name: "mission_start",
    data: { entry: "new" },
  };
  assert.equal(
    (await request("POST", { token: crypto.randomUUID(), events: [event] }))
      .status,
    403,
  );
  const enabled = await request("PUT", {
    enabled: true,
    participantCode: "QA",
  });
  assert.equal(enabled.status, 200);
  const consent = await enabled.json();
  assert.ok(consent.token);
  assert.equal(
    (
      await (
        await request("POST", { token: consent.token, events: [event] })
      ).json()
    ).accepted,
    1,
  );
  assert.equal(
    (
      await (
        await request("POST", { token: consent.token, events: [event] })
      ).json()
    ).accepted,
    0,
  );
  assert.equal(
    (
      await request("POST", {
        token: consent.token,
        events: [
          { ...event, data: { entry: "new", note: "must never store" } },
        ],
      })
    ).status,
    400,
  );
  assert.equal((await request("DELETE")).status, 200);
  assert.equal(
    (
      await request("POST", {
        token: consent.token,
        events: [{ ...event, id: crypto.randomUUID() }],
      })
    ).status,
    403,
  );
  const next = await (
    await request("PUT", { enabled: true, participantCode: "QA" })
  ).json();
  assert.notEqual(next.token, consent.token);
  assert.equal(
    (await request("POST", { token: consent.token, events: [event] })).status,
    403,
  );
  assert.equal(
    (await fetch(base + "/api/state", { method: "DELETE", headers })).status,
    200,
  );
  assert.equal(
    (await request("PUT", { enabled: true, participantCode: "QA" })).status,
    409,
  );
  console.log(
    "PASS: opt-in gating, strict privacy schema, duplicate handling, withdrawal, token renewal and full-deletion fence",
  );
} finally {
  assert.equal(
    (await fetch(base + "/api/state", { method: "DELETE", headers })).status,
    200,
  );
}
