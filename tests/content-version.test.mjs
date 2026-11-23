import { budgetFixture } from "./helpers/budget-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  createMissionCatalog,
  missionForProgress,
} from "../lib/mission-catalog.ts";
import {
  missions,
  missionById,
  initialProgress,
  LEGACY_CONTENT_VERSION,
} from "../lib/missions.ts";
import { releaseMissions as archived } from "../lib/content/2026-11-23.1.ts";
import { coachGuides } from "../lib/coach-guides.ts";
import {
  normalizeLabState,
  keepsStartedVersions,
  changeCode,
  snapshotExecution,
  currentExecution,
  canRecordAttempt,
  isCompleted,
  recordStatus,
} from "../lib/lab-state.ts";
import { stateSchema } from "../lib/server.ts";
import { getHint, MissionContentError } from "../lib/coach.ts";
const original = missionById("cloud", LEGACY_CONTENT_VERSION);
const release = (m, extra = {}) => ({
  version: m.contentVersion,
  reviewStatus: "reviewed",
  reviewedAt: "2026-11-23",
  acceptingNewStarts: true,
  missions: [m],
  ...extra,
});
const nextMission = () => ({
  ...structuredClone(original),
  contentVersion: "future-test-v2",
  starter: "function decideRelease(){ return 'wait'; }",
  solution: "function decideRelease(){ return 'wait'; }",
  previewArgs: [{ requests: 100, errors: 2, p95Ms: 500 }],
  tests: [
    {
      label: "changed policy",
      why: "new test only",
      args: [{ requests: 100, errors: 2, p95Ms: 500 }],
      expected: "wait",
    },
  ],
  hints: ["new hint", "new hint", "new hint"],
  guides: coachGuides(original).map((g) => ({
    ...g,
    message: "new release hint",
  })),
});
const evaluate = (m, code, args) =>
  vm.runInNewContext(
    code + `; ${m.fn}(...input)`,
    { input: structuredClone(args) },
    { timeout: 300 },
  );
test("a new release changes new starts while an existing session keeps its code, tests, hints and expected result", () => {
  const p = initialProgress(original),
    next = nextMission();
  const catalog = createMissionCatalog(
    [release(original, { acceptingNewStarts: false }), release(next)],
    next.contentVersion,
  );
  const resumed = catalog.resolve(original.id, p.contentVersion);
  assert.equal(catalog.start(original.id).contentVersion, next.contentVersion);
  assert.equal(resumed.starter, original.starter);
  assert.deepEqual(resumed.tests, original.tests);
  assert.deepEqual(resumed.hints, original.hints);
  assert.deepEqual(coachGuides(resumed), coachGuides(original));
  const args = [{ requests: 100, errors: 2, p95Ms: 500 }];
  assert.equal(evaluate(resumed, resumed.solution, args), "promote");
  assert.equal(
    evaluate(catalog.start(original.id), next.solution, args),
    "wait",
  );
  assert.equal(p.contentVersion, LEGACY_CONTENT_VERSION);
});
test("pausing new starts retains reviewed sessions; draft and missing releases cannot be substituted", () => {
  const catalog = createMissionCatalog(
    [release(original, { acceptingNewStarts: false })],
    original.contentVersion,
  );
  assert.equal(catalog.canStart(original.id), false);
  assert.equal(catalog.start(original.id), undefined);
  assert.equal(
    catalog.resolve(original.id, original.contentVersion).id,
    original.id,
  );
  assert.equal(catalog.resolve(original.id, "missing"), undefined);
  const draft = createMissionCatalog(
    [release(original, { reviewStatus: "draft", reviewedAt: null })],
    original.contentVersion,
  );
  assert.equal(draft.start(original.id), undefined);
  assert.equal(draft.resolve(original.id, original.contentVersion), undefined);
});
test("pausing one mission does not stop other reviewed missions or resuming existing work", () => {
  const catalog = createMissionCatalog(
    [
      release(original, {
        missions: [...archived],
        pausedMissionIds: ["cloud"],
      }),
    ],
    original.contentVersion,
  );
  assert.equal(catalog.canStart("cloud"), false);
  assert.equal(catalog.start("cloud"), undefined);
  assert.equal(catalog.canStart("frontend"), true);
  assert.ok(catalog.start("frontend"));
  assert.ok(catalog.resolve("cloud", original.contentVersion));
});
test("published definitions are frozen and duplicate, unreviewed metadata cannot masquerade as a reviewed release", () => {
  assert.throws(() => {
    missions[0].tests[0].expected = "changed";
  }, TypeError);
  assert.throws(
    () =>
      createMissionCatalog(
        [release(original), release(original)],
        original.contentVersion,
      ),
    /DUPLICATE/,
  );
  assert.throws(
    () =>
      createMissionCatalog(
        [release(original, { version: "different" })],
        "different",
      ),
    /INVALID/,
  );
  assert.throws(
    () =>
      createMissionCatalog(
        [release(original, { reviewedAt: null })],
        original.contentVersion,
      ),
    /REVIEW_DATE/,
  );
});
test("legacy code and reflection survive migration without retroactively stamping historical execution", () => {
  const raw = {
    ...initialProgress(original),
    code: "my old work",
    runs: 2,
    contentVersion: undefined,
    contentVersionSource: undefined,
    lastExecution: {
      id: crypto.randomUUID(),
      codeHash: "a".repeat(64),
      revision: 0,
      kind: "edited",
      executedAt: "2026-11-22T00:00:00.000Z",
      result: { tests: [], preview: null },
    },
  };
  raw.reflection = {
    interest: 4,
    difficulty: 4,
    again: 4,
    note: "keep my reflection",
    next: "keep next step",
    endedAt: "2026-11-22T00:00:00.000Z",
    execution: raw.lastExecution,
  };
  const state = stateSchema.parse({ version: 1, progress: { cloud: raw } }),
    p = state.progress.cloud;
  assert.equal(p.code, "my old work");
  assert.equal(p.contentVersion, LEGACY_CONTENT_VERSION);
  assert.equal(p.contentVersionSource, "legacy_baseline");
  assert.equal(p.reflection.note, "keep my reflection");
  assert.equal(p.reflection.execution.contentVersion, undefined);
  assert.equal(currentExecution(p), undefined);
  assert.equal(isCompleted(p), false);
  assert.match(recordStatus(p), /과제 기준 미확인/);
  assert.deepEqual(normalizeLabState(state), state);
});
test("new execution and reflection retain the pinned version through actual state validation; mixed versions cannot complete", async () => {
  const p = {
    ...initialProgress(original),
    ...changeCode(initialProgress(original), original.solution, "user"),
  };
  p.lastExecution = await snapshotExecution(
    p,
    original,
    { tests: [], preview: "promote" },
    "2026-11-23T00:00:00.000Z",
  );
  p.reflection = {
    interest: 4,
    difficulty: 3,
    again: 4,
    note: "edited and ran",
    next: "more",
    endedAt: "2026-11-23T00:00:00.000Z",
    execution: p.lastExecution,
  };
  const restored = stateSchema.parse({ version: 1, progress: { cloud: p } })
    .progress.cloud;
  assert.equal(restored.lastExecution.contentVersion, original.contentVersion);
  assert.equal(restored.lastExecution.missionId, "cloud");
  assert.equal(isCompleted(restored), true);
  assert.equal(canRecordAttempt(restored), true);
  const mixed = { ...restored, contentVersion: "future-test-v2" };
  assert.equal(currentExecution(mixed), undefined);
  assert.equal(canRecordAttempt(mixed), false);
  assert.equal(isCompleted(mixed), false);
  await assert.rejects(
    snapshotExecution(
      mixed,
      original,
      { tests: [], preview: null },
      "2026-11-23T00:00:00.000Z",
    ),
    /CONTENT_VERSION_MISMATCH/,
  );
});
test("unknown versions remain downloadable state and do not silently resume the current mission", () => {
  const p = {
    ...initialProgress(original),
    contentVersion: "not-in-this-deployment",
    code: "keep this",
  };
  const restored = stateSchema.parse({ version: 1, progress: { cloud: p } })
    .progress.cloud;
  assert.equal(restored.code, p.code);
  assert.equal(restored.contentVersion, p.contentVersion);
  assert.equal(missionForProgress("cloud", restored), undefined);
});
const storage = (p) => ({
  read: async () => ({
    state: { profile: { aiConsent: true }, progress: p ? { cloud: p } : {} },
  }),
  reserve: async () => true,
  ...budgetFixture(),
  logUsage: async () => {},
});
test("AI reads the pinned old conditions even when new starts use a revised rule and hint", async () => {
  const next = nextMission(),
    catalog = createMissionCatalog(
      [release(original), release(next)],
      next.contentVersion,
    );
  const p = initialProgress(original);
  let round = 0;
  const result = await getHint(
    {
      track: "cloud",
      contentVersion: p.contentVersion,
      code: p.code,
      question: "정확히 2%면 되돌리나요?",
      level: 0,
      tests: [],
    },
    "fixture",
    storage(p),
    {
      apiKey: "fixture",
      model: "gpt-4.1-mini",
      catalog,
      fetcher: async (_, options) => {
        const payload = JSON.parse(options.body);
        if (round === 2) {
          const task = JSON.parse(
            payload.messages.find(
              (m) => m.role === "tool" && JSON.parse(m.content).task,
            ).content,
          );
          assert.equal(task.contentVersion, original.contentVersion);
          assert.ok(task.guidance.some((g) => /promote/.test(g.hint)));
          assert.ok(!task.guidance.some((g) => g.hint === "new release hint"));
        }
        const name = ["read_mission", "inspect_checks"][round++];
        return Response.json({
          choices: [
            {
              message: name
                ? {
                    tool_calls: [
                      {
                        id: String(round),
                        type: "function",
                        function: { name, arguments: "{}" },
                      },
                    ],
                  }
                : { content: JSON.stringify({ intent: "rules" }) },
            },
          ],
        });
      },
    },
  );
  assert.equal(result.contentVersion, original.contentVersion);
  assert.match(result.message, /100건·2%·500ms이면 promote/);
});
test("unknown and mismatched AI version requests are rejected before quota reservation or provider access", async () => {
  const p = initialProgress(original),
    calls = [];
  const store = storage(p);
  store.reserve = async () => {
    calls.push("reserve");
    return true;
  };
  for (const contentVersion of ["unknown", original.contentVersion]) {
    const actualStore =
      contentVersion === "unknown"
        ? store
        : storage({ ...p, contentVersion: "another-version" });
    await assert.rejects(
      getHint(
        {
          track: "cloud",
          contentVersion,
          code: p.code,
          question: "도움",
          level: 0,
          tests: [],
        },
        "fixture",
        actualStore,
        {
          apiKey: "fixture",
          model: "gpt-4.1-mini",
          fetcher: async () => {
            calls.push("fetch");
            throw Error();
          },
        },
      ),
      MissionContentError,
    );
  }
  assert.deepEqual(calls, []);
});
test("legacy AI clients resolve only the preserved baseline, never a newly active release", async () => {
  const next = nextMission(),
    catalog = createMissionCatalog(
      [release(original), release(next)],
      next.contentVersion,
    );
  const p = { ...initialProgress(original), contentVersion: undefined };
  const result = await getHint(
    { track: "cloud", code: p.code, question: "도움", level: 0, tests: [] },
    "fixture",
    storage(p),
    { model: "gpt-4.1-mini", catalog },
  );
  assert.equal(result.contentVersion, LEGACY_CONTENT_VERSION);
  assert.equal(result.message, original.hints[0]);
});
test("the archived release file and its complete semantic bundle match the reviewed manifest", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../lib/content/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  for (const [version, expected] of Object.entries(manifest)) {
    const url = new URL(`../lib/content/${version}.ts`, import.meta.url);
    const file = await readFile(url);
    const { releaseMissions } = await import(url.href);
    assert.equal(
      createHash("sha256").update(file).digest("hex"),
      expected.sha256,
    );
    const canonical = releaseMissions.map(
      ({ contentVersion, guides, ...m }) => ({ ...m, guides }),
    );
    assert.equal(
      createHash("sha256").update(JSON.stringify(canonical)).digest("hex"),
      expected.semanticSha256,
    );
  }
});

test("autosave edits stay on the started version; rebinding or removing sessions requires explicit reset", () => {
  const before = { version: 1, progress: { cloud: initialProgress(original) } };
  assert.equal(
    keepsStartedVersions(before, {
      ...before,
      progress: { cloud: { ...before.progress.cloud, code: "edited" } },
    }),
    true,
  );
  assert.equal(
    keepsStartedVersions(before, {
      ...before,
      progress: {
        cloud: { ...before.progress.cloud, contentVersion: "future-test-v2" },
      },
    }),
    false,
  );
  assert.equal(
    keepsStartedVersions(before, { version: 1, progress: {} }),
    false,
  );
  assert.equal(keepsStartedVersions(null, before), true);
  const legacy = {
    version: 1,
    progress: {
      cloud: { ...before.progress.cloud, contentVersion: undefined },
    },
  };
  assert.equal(keepsStartedVersions(legacy, normalizeLabState(legacy)), true);
});
