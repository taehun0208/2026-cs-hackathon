import test from "node:test";
import assert from "node:assert/strict";
import { missions, initialProgress } from "../lib/missions.ts";
import {
  changeCode,
  isCompleted,
  recordStatus,
  snapshotExecution,
} from "../lib/lab-state.ts";
import { representativeTracks } from "../lib/next-actions.ts";
import { stateSchema } from "../lib/server.ts";
import { clientHarness } from "./helpers/client-harness.mjs";

async function reflected(mission, note) {
  const progress = {
    ...initialProgress(mission),
    ...changeCode(
      initialProgress(mission),
      mission.starter + "\n// my edit",
      "user",
    ),
    runs: 1,
  };
  progress.lastExecution = await snapshotExecution(
    progress,
    mission,
    { tests: [], error: "still learning" },
    "2026-11-23T00:00:00.000Z",
  );
  progress.reflection = {
    interest: 4,
    difficulty: 3,
    again: 4,
    note,
    next: "다른 조건도 확인해보기",
    endedAt: "2026-11-23T01:00:00.000Z",
    execution: progress.lastExecution,
  };
  return progress;
}

test("empty legacy reflection notes stay preserved without counting as completed experiences", async () => {
  for (const note of ["", " \n\t "]) {
    const original = await reflected(missions[0], note);
    const restored = stateSchema.parse({
      version: 1,
      progress: { frontend: original },
    }).progress.frontend;
    assert.equal(restored.reflection.note, note);
    assert.equal(isCompleted(restored), false);
    assert.match(recordStatus(restored), /회고 확인 필요/);
  }
  assert.equal(
    isCompleted(await reflected(missions[0], "조건을 바꾸고 실행해봤어요")),
    true,
  );
});

test("invalid runtime ratings do not turn a reflection into completion evidence", async () => {
  const valid = await reflected(missions[0], "조건을 바꾸고 실행해봤어요");
  for (const field of ["interest", "difficulty", "again"]) {
    for (const value of [0, 6, 2.5, NaN, undefined, "4", null]) {
      const progress = {
        ...valid,
        reflection: { ...valid.reflection, [field]: value },
      };
      assert.equal(isCompleted(progress), false, `${field}: ${value}`);
      assert.match(recordStatus(progress), /회고 확인 필요/);
    }
  }
  for (const kind of ["reference", "starter", "unverified"]) {
    const progress = {
      ...valid,
      reflection: {
        ...valid.reflection,
        note: "",
        execution: { ...valid.lastExecution, kind },
      },
    };
    assert.equal(recordStatus(progress), "이전 기록 · 실행 미확인");
  }
});

test("comparison waits for two meaningful code reflections and keeps game interest separate", async (t) => {
  const state = {
    version: 1,
    progress: {
      frontend: await reflected(missions[0], " "),
      backend: await reflected(missions[1], "중복을 막는 조건이 흥미로웠어요"),
    },
    games: {
      frontend: {
        version: 1,
        completedAt: "2026-11-23T00:00:00.000Z",
        updatedAt: "2026-11-23T00:00:00.000Z",
        interest: 5,
      },
    },
  };
  assert.deepEqual(representativeTracks(state), []);
  const f = await clientHarness(t, {
    state,
    url: "http://localhost/?view=compare",
  });
  const document = f.dom.window.document;
  assert.match(document.body.textContent, /한 가지 작업을 더 경험해볼까요/);
  assert.equal(document.querySelector(".compare-insight"), null);
  assert.match(
    document.querySelector('[aria-labelledby="game-comparison-heading"]')
      .textContent,
    /5 \/ 5/,
  );
  await f.click("나의 기록1");
  assert.match(document.body.textContent, /회고 확인 필요/);
  assert.match(document.body.textContent, /중복을 막는 조건이 흥미로웠어요/);
});
