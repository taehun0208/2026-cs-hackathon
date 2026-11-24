import { createHash, randomUUID } from "node:crypto";
import { missions, initialProgress } from "../../lib/missions.ts";

// Ordinary newlines require escaping in JSON. Each editor is at its documented
// limit, and every execution remains below the runner's aggregate output limit.
export function largeState() {
  const now = new Date().toISOString();
  return {
    version: 1,
    progress: Object.fromEntries(
      missions.map((mission) => {
        const code = mission.starter.padEnd(20000, "\n");
        const execution = {
          id: randomUUID(),
          contentVersion: mission.contentVersion,
          missionId: mission.id,
          codeHash: createHash("sha256").update(code).digest("hex"),
          executedAt: now,
          revision: 1,
          kind: "edited",
          previewArgs: mission.previewArgs,
          result: {
            tests: mission.tests.map(({ label, why, expected }) => ({
              label,
              why,
              expected,
              actual: "x".repeat(7800),
              passed: false,
            })),
            preview: "x".repeat(7800),
          },
        };
        return [
          mission.id,
          {
            ...initialProgress(mission),
            code,
            codeRevision: 1,
            codeSource: "user",
            runs: 1,
            lastExecution: execution,
            reflection: {
              interest: 3,
              difficulty: 3,
              again: 3,
              note: "대용량 기록 저장 점검",
              next: "",
              endedAt: now,
              execution,
            },
          },
        ];
      }),
    ),
  };
}
