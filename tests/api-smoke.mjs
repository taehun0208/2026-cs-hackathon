import {
  initialProgress,
  missionById,
  LEGACY_CONTENT_VERSION,
} from "../lib/missions.ts";
import assert from "node:assert/strict";
import { normalizeLabState } from "../lib/lab-state.ts";
const base = process.env.LAB_TEST_URL ?? "http://127.0.0.1:3000";
// Carry the receipt for each isolated guest, just as the browser client does.
const revisions = new Map();
const fetch = async (url, options = {}) => {
  const key = options.headers?.Cookie;
  const response = await globalThis.fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(options.method === "POST" && url.endsWith("/api/state")
        ? { "X-Lab-Revision": revisions.get(key) ?? "new" }
        : {}),
    },
  });
  if (response.ok && options.method === "POST" && url.endsWith("/api/state"))
    revisions.set(key, (await response.clone().json()).savedAt);
  return response;
};
const first = await fetch(base + "/api/state");
assert.equal(first.status, 200);
const cookie = first.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
assert.equal((await first.json()).state, null);
const state = {
  version: 1,
  profile: {
    experience: "QA fixture",
    purpose: "API isolation test",
    aiConsent: false,
  },
  progress: {},
};
const headers = {
  "Content-Type": "application/json",
  Origin: base,
  Cookie: cookie,
};
const write = await fetch(base + "/api/state", {
  method: "POST",
  headers,
  body: JSON.stringify(state),
});
assert.equal(write.status, 200);
assert.deepEqual(
  (
    await (
      await fetch(base + "/api/state", { headers: { Cookie: cookie } })
    ).json()
  ).state,
  normalizeLabState(state),
);
assert.equal((await (await fetch(base + "/api/state")).json()).state, null);
assert.equal(
  (
    await fetch(base + "/api/state", {
      method: "POST",
      headers: { ...headers, Origin: "https://other.example" },
      body: JSON.stringify(state),
    })
  ).status,
  403,
);
assert.equal(
  (
    await fetch(base + "/api/state", {
      method: "POST",
      headers,
      body: '{"version":1}',
    })
  ).status,
  400,
);
// Explicit answers and their execution evidence survive the actual storage round trip.
const answered = {
  ...state,
  profile: {
    experience: "작은 프로젝트를 해봤어요",
    experienceSource: "self_reported",
    purpose: null,
    purposeSource: "unknown",
    aiConsent: false,
  },
};
assert.equal(
  (
    await fetch(base + "/api/state", {
      method: "POST",
      headers,
      body: JSON.stringify(answered),
    })
  ).status,
  200,
);
const restored = (
  await (
    await fetch(base + "/api/state", { headers: { Cookie: cookie } })
  ).json()
).state;
assert.equal(restored.profile.experienceSource, "self_reported");
assert.equal(restored.profile.experience, "작은 프로젝트를 해봤어요");
assert.equal(restored.profile.purpose, null);
const coach = await fetch(base + "/api/coach", {
  method: "POST",
  headers,
  body: JSON.stringify({
    track: "frontend",
    code: "function selectEvents(){return []}",
    level: 0,
    question: "어떻게 시작하나요?",
    tests: [],
  }),
});
assert.equal(coach.status, 200);
assert.equal((await coach.json()).source, "guide");
// Content references survive the real persistence path; unknown versions are
// preserved for download and never substituted by the coach.
const versioned = {
  ...answered,
  progress: {
    frontend: initialProgress(missionById("frontend")),
    backend: initialProgress(missionById("backend", LEGACY_CONTENT_VERSION)),
  },
};
assert.equal(
  (
    await fetch(base + "/api/state", {
      method: "POST",
      headers,
      body: JSON.stringify(versioned),
    })
  ).status,
  200,
);
const versionedRead = (
  await (
    await fetch(base + "/api/state", { headers: { Cookie: cookie } })
  ).json()
).state;
assert.equal(
  versionedRead.progress.frontend.contentVersion,
  versioned.progress.frontend.contentVersion,
);
assert.equal(versionedRead.progress.frontend.contentVersionSource, "started");
assert.equal(
  versionedRead.progress.backend.contentVersion,
  LEGACY_CONTENT_VERSION,
);
assert.equal(
  versionedRead.progress.backend.code,
  missionById("backend", LEGACY_CONTENT_VERSION).starter,
);
const missing = {
  ...versioned,
  progress: {
    ...versioned.progress,
    frontend: {
      ...versioned.progress.frontend,
      contentVersion: "unknown-release",
      code: "preserve this code",
    },
  },
};
assert.equal(
  (
    await fetch(base + "/api/state", {
      method: "POST",
      headers,
      body: JSON.stringify(missing),
    })
  ).status,
  409,
);
assert.equal(
  (
    await (
      await fetch(base + "/api/state", { headers: { Cookie: cookie } })
    ).json()
  ).state.progress.frontend.contentVersion,
  versioned.progress.frontend.contentVersion,
);
const unknownGuest = await fetch(base + "/api/state");
const unknownHeaders = {
  ...headers,
  Cookie: unknownGuest.headers.get("set-cookie").split(";")[0],
};
try {
  assert.equal(
    (
      await fetch(base + "/api/state", {
        method: "POST",
        headers: unknownHeaders,
        body: JSON.stringify(missing),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await (
        await fetch(base + "/api/state", {
          headers: { Cookie: unknownHeaders.Cookie },
        })
      ).json()
    ).state.progress.frontend.code,
    "preserve this code",
  );
  for (const contentVersion of ["unknown-release", LEGACY_CONTENT_VERSION]) {
    const reply = await fetch(base + "/api/coach", {
      method: "POST",
      headers: unknownHeaders,
      body: JSON.stringify({
        track: "frontend",
        contentVersion,
        code: "",
        level: 0,
        question: "도움",
        tests: [],
      }),
    });
    assert.equal(reply.status, 409);
  }
} finally {
  assert.equal(
    (
      await fetch(base + "/api/state", {
        method: "DELETE",
        headers: unknownHeaders,
      })
    ).status,
    200,
  );
}
assert.equal(
  (await fetch(base + "/api/state", { method: "DELETE", headers })).status,
  200,
);
assert.equal(
  (
    await (
      await fetch(base + "/api/state", { headers: { Cookie: cookie } })
    ).json()
  ).state,
  null,
);
console.log(
  "PASS: persistence, guest isolation, origin checks, validation, coach fallback, pinned/unknown content versions, fixture deletion",
);
