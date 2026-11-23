import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { consentSchema, participantCohort } from "../lib/analytics-schema.ts";
import { prepilotAssignments, pilotAssignments } from "../lib/pilot-plan.ts";
import { summarizeAnalytics } from "../lib/analytics-report.ts";
import { missions } from "../lib/missions.ts";

const row = (track, participantCode) => ({
  owner: "guest:" + crypto.randomUUID(),
  participantCode,
  receivedAt: 1000,
  event: {
    version: 1,
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    name: "mission_start",
    data: { entry: "new" },
    context: {
      journeyId: crypto.randomUUID(),
      surface: "code",
      track,
      contentVersion: missions[0].contentVersion,
    },
  },
});
test("prepilot participant choices are explicit and formal pilot and QA choices remain valid", () => {
  for (const code of ["S01", "S02", "S03", "P01", "P12", "QA", null])
    assert.ok(
      consentSchema.safeParse({ enabled: true, participantCode: code }).success,
    );
  for (const code of ["S04", "S00", "P13", "student-name"])
    assert.equal(
      consentSchema.safeParse({ enabled: true, participantCode: code }).success,
      false,
    );
  assert.equal(participantCohort("S01"), "prepilot");
  assert.equal(participantCohort("P01"), "pilot");
  assert.equal(participantCohort(null), "general");
});
test("three students see two roles each, covering six roles once without changing twelve-person assignments", () => {
  assert.deepEqual(
    prepilotAssignments.map((p) => p.participantCode),
    ["S01", "S02", "S03"],
  );
  const roles = prepilotAssignments.flatMap((p) => [p.first, p.second]);
  assert.equal(roles.length, 6);
  assert.deepEqual([...roles].sort(), missions.map((m) => m.id).sort());
  assert.equal(pilotAssignments.length, 12);
  assert.ok(pilotAssignments.every((p) => p.participantCode.startsWith("P")));
});
test("default, formal, general and prepilot reports never pool prepilot student events", () => {
  const rows = [
    row("frontend", "P01"),
    row("backend", "S01"),
    row("cloud", null),
    row("ai", "QA"),
  ];
  const all = summarizeAnalytics(rows);
  assert.equal(all.cohort, "all");
  assert.equal(all.acceptedEvents, 2);
  assert.equal(all.quality.prepilotExcluded, 1);
  assert.equal(all.quality.qaExcluded, 1);
  assert.deepEqual(all.perRole.map((r) => r.track).sort(), [
    "cloud",
    "frontend",
  ]);
  const formal = summarizeAnalytics(rows, { cohort: "pilot", includeQA: true });
  assert.equal(formal.acceptedEvents, 1);
  assert.equal(formal.perRole[0].track, "frontend");
  assert.equal(formal.quality.prepilotExcluded, 1);
  const general = summarizeAnalytics(rows, { cohort: "general" });
  assert.equal(general.acceptedEvents, 1);
  assert.equal(general.perRole[0].track, "cloud");
  for (const includeQA of [false, true]) {
    const prepilot = summarizeAnalytics(rows, {
      cohort: "prepilot",
      includeQA,
    });
    assert.equal(prepilot.acceptedEvents, 1);
    assert.equal(prepilot.perRole[0].track, "backend");
    assert.equal(prepilot.quality.prepilotExcluded, 0);
  }
  const unknown = summarizeAnalytics([row("frontend", "S04")], {
    cohort: "general",
  });
  assert.equal(unknown.quality.invalid, 1);
  assert.equal(unknown.acceptedEvents, 0);
  assert.equal(
    summarizeAnalytics([], { cohort: "prepilot" }).codeTargets
      .firstObservedNewExperienceCompletion.rate,
    null,
  );
  const output = JSON.stringify(all);
  for (const r of rows) assert.ok(!output.includes(r.owner));
});
const csv = (name) =>
  fs
    .readFileSync(
      new URL("../public/prepilot-kit/" + name, import.meta.url),
      "utf8",
    )
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.slice(1, -1).split('","'));
test("prepilot CSVs have only assignments, blank answers and findings headers, with no student results invented", () => {
  const participants = csv("participants.csv"),
    observations = csv("observations.csv"),
    followup = csv("followup.csv"),
    findings = csv("findings.csv");
  assert.equal(participants.length, 4);
  assert.equal(observations.length, 7);
  assert.equal(followup.length, 4);
  assert.equal(findings.length, 1);
  for (const [table, plannedCells] of [
    [participants, 3],
    [observations, 3],
    [followup, 1],
  ]) {
    for (const r of table.slice(1)) {
      assert.equal(r.length, table[0].length);
      assert.ok(r.slice(plannedCells).every((v) => v === ""));
      assert.match(r[0], /^S0[1-3]$/);
    }
  }
});
test("the CLI documents cohort exclusions without credentials and can report synthetic prepilot rows", () => {
  const help = execFileSync(
    process.execPath,
    ["scripts/report-analytics.mjs", "--help"],
    { encoding: "utf8" },
  );
  assert.match(help, /--cohort all\|pilot\|prepilot\|general/);
  assert.match(help, /excluding S01–S03/);
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "haebogi-prepilot-report-"),
  );
  try {
    const file = path.join(dir, "events.json");
    fs.writeFileSync(
      file,
      JSON.stringify([row("frontend", "S01"), row("backend", "P01")]),
    );
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "scripts/report-analytics.mjs",
          "--input",
          file,
          "--cohort",
          "prepilot",
        ],
        { encoding: "utf8" },
      ),
    );
    assert.equal(result.cohort, "prepilot");
    assert.equal(result.acceptedEvents, 1);
    assert.equal(result.perRole[0].track, "frontend");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
