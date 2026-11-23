import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { summarizeAnalytics } from "../lib/analytics-report.ts";
import { pilotAssignments } from "../lib/pilot-plan.ts";
import { missions } from "../lib/missions.ts";
const owner = "guest:" + crypto.randomUUID(),
  sessionId = crypto.randomUUID();
const context = (track) => ({
  journeyId: crypto.randomUUID(),
  surface: "code",
  track,
  contentVersion: missions[0].contentVersion,
});
const row = (name, data, ctx, participantCode = "P01") => ({
  owner,
  participantCode,
  receivedAt: Date.now(),
  event: {
    version: 1,
    id: crypto.randomUUID(),
    sessionId,
    name,
    data,
    ...(ctx ? { context: ctx } : {}),
  },
});
function completed(track) {
  const c = context(track),
    executionId = crypto.randomUUID();
  return [
    row("mission_start", { entry: "new" }, c),
    row(
      "run_result",
      { executionId, kind: "edited", passed: 2, total: 5, outcome: "checks" },
      c,
    ),
    row("reflection_saved", { executionId }, c),
    row(
      "next_action_committed",
      { kind: "extend", targetTrack: track, executionId },
      c,
    ),
  ];
}
test("empty reports never claim target rates and QA and raw credentials stay out of default exports", () => {
  const empty = summarizeAnalytics([]);
  assert.equal(
    empty.codeTargets.firstObservedNewExperienceCompletion.rate,
    null,
  );
  const report = summarizeAnalytics([
    row("mission_start", { entry: "new" }, context("frontend"), "QA"),
  ]);
  assert.equal(report.acceptedEvents, 0);
  assert.equal(report.quality.qaExcluded, 1);
  assert.ok(!JSON.stringify(report).includes(owner));
  assert.ok(!JSON.stringify(report).includes(sessionId));
});
test("two edited code roles with acknowledged reflections and an action satisfy the defined coverage, without assuming comparison order", () => {
  const rows = [
    ...completed("frontend"),
    ...completed("backend"),
    row("comparison_view", { completedCount: 2 }),
  ];
  const report = summarizeAnalytics(rows);
  assert.equal(report.codeTargets.firstObservedNewExperienceCompletion.rate, 1);
  assert.equal(report.codeTargets.twoRolesAndNextAction.rate, 1);
  assert.equal(report.readyComparisonSessions, 1);
  assert.equal(report.perRole.length, 2);
});
test("submission, reference runs and orphan saved events do not become confirmed completion; missing end stays unresolved", () => {
  const c = context("frontend"),
    executionId = crypto.randomUUID();
  const r = summarizeAnalytics([
    row("mission_start", { entry: "new" }, c),
    row(
      "run_result",
      {
        executionId,
        kind: "reference",
        passed: 5,
        total: 5,
        outcome: "checks",
      },
      c,
    ),
    row("reflection_submit", { executionId }, c),
    row("reflection_saved", { executionId }, c),
  ]);
  assert.equal(r.perRole[0].savedReflection, 0);
  assert.equal(r.perRole[0].leftWithoutSaved, 0);
  assert.equal(r.perRole[0].unresolved, 1);
  assert.equal(r.perRole[0].submittedReflection, 1);
  assert.equal(r.perRole[0].submittedWithoutSave, 1);
  assert.equal(r.quality.unlinkedReflections, 1);
});
test("the first role can complete on resume using its previously reported edited run, without borrowing a different role's execution", () => {
  const initial = context("frontend"),
    resumed = context("frontend"),
    other = context("backend"),
    executionId = crypto.randomUUID();
  const rows = [
    row("mission_start", { entry: "new" }, initial),
    row(
      "run_result",
      { executionId, kind: "edited", passed: 1, total: 5, outcome: "checks" },
      initial,
    ),
    row("mission_end", { outcome: "left", elapsedMs: 100 }, initial),
    row("mission_start", { entry: "resume" }, resumed),
    row("reflection_saved", { executionId }, resumed),
    row("mission_start", { entry: "new" }, other),
    row("reflection_saved", { executionId }, other),
  ].map((r, i) => ({ ...r, receivedAt: 1000 + i }));
  const report = summarizeAnalytics(rows);
  assert.equal(report.codeTargets.firstObservedNewExperienceCompletion.rate, 1);
  assert.equal(
    report.perRole.find((r) => r.track === "frontend").savedReflection,
    1,
  );
  assert.equal(report.perRole.find((r) => r.track === "frontend").resumes, 1);
  assert.equal(
    report.perRole.find((r) => r.track === "backend").savedReflection,
    0,
  );
  assert.equal(report.quality.unlinkedReflections, 1);
});
test("duplicate events, missing starts, conflicting journey contexts and repeated participant codes are visible quality counts", () => {
  const c = context("frontend"),
    a = row("mission_start", { entry: "new" }, c),
    b = row("help_open", { kind: "basic_hint" }, { ...c, track: "backend" }),
    missing = row("help_open", { kind: "basic_hint" }, context("ai"));
  const other = {
    ...row("page_view", { page: "home" }),
    owner: "guest:" + crypto.randomUUID(),
  };
  const r = summarizeAnalytics([a, a, b, missing, other]);
  assert.equal(r.quality.duplicates, 1);
  assert.equal(r.quality.inconsistentJourneys, 1);
  assert.equal(r.quality.journeysWithoutStart, 1);
  assert.equal(r.quality.participantCodesWithMultipleBrowsers, 1);
  assert.equal(r.perRole.length, 0);
});
test("pilot templates have twelve planned participants, two opposite-order exposures per role, and no invented responses", () => {
  assert.equal(pilotAssignments.length, 12);
  assert.equal(
    new Set(pilotAssignments.map((x) => x.participantCode)).size,
    12,
  );
  for (const m of missions) {
    assert.equal(pilotAssignments.filter((x) => x.first === m.id).length, 2);
    assert.equal(pilotAssignments.filter((x) => x.second === m.id).length, 2);
  }
  const csv = fs
    .readFileSync(
      new URL("../public/pilot-kit/participants.csv", import.meta.url),
      "utf8",
    )
    .trim()
    .split("\n");
  assert.equal(csv.length, 13);
  assert.match(csv[1], /^"P01"/);
  assert.ok(
    csv
      .slice(1)
      .every((line) => line.endsWith(',"","","","","","","","","","","",""')),
  );
  assert.equal(
    fs
      .readFileSync(
        new URL("../public/pilot-kit/observations.csv", import.meta.url),
        "utf8",
      )
      .trim()
      .split("\n").length,
    25,
  );
  assert.equal(
    fs
      .readFileSync(
        new URL("../public/pilot-kit/followup.csv", import.meta.url),
        "utf8",
      )
      .trim()
      .split("\n").length,
    13,
  );
});
