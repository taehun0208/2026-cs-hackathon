import test from "node:test";
import assert from "node:assert/strict";
import { missions } from "../lib/missions.ts";
import { actionCandidate } from "../lib/next-actions-v1.ts";
import {
  activityHref,
  activityLesson,
  selectedActivity,
} from "../lib/activities.ts";

test("every recommended kind and role has a real destination and concrete practice material", () => {
  for (const { id } of missions)
    for (const kind of [
      "foundation",
      "extend",
      "study",
      "explore",
      "broader",
      "review",
    ]) {
      const candidate = actionCandidate(kind, id);
      const lesson = activityLesson(kind, id);
      assert.equal(lesson.title, candidate.title);
      assert.equal(lesson.steps.length, 3);
      assert.ok(lesson.example && lesson.check && lesson.explanation);
      assert.equal(
        activityHref(candidate),
        kind === "explore" ? `/?track=${id}` : `/activities/${kind}/${id}`,
      );
    }
});
test("the destination follows the saved selected role, including a different role", () => {
  const candidate = actionCandidate("explore", "security");
  const reflection = {
    nextPlan: {
      track: "frontend",
      selectedId: candidate.id,
      candidates: [actionCandidate("explore", "backend"), candidate],
    },
  };
  assert.equal(activityHref(selectedActivity(reflection)), "/?track=security");
  assert.equal(selectedActivity({ next: "legacy free text" }), undefined);
});
