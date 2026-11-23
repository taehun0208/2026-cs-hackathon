import { budgetFixture } from "./helpers/budget-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { missionById } from "../lib/missions.ts";
import { getHint } from "../lib/coach.ts";
import {
  eligibleCheckIds,
  resolveCoachSelection,
} from "../lib/coach-routing.ts";
const inspected = new Set(["read_mission", "inspect_checks"]);
const storage = () => ({
  read: async () => ({ state: { profile: { aiConsent: true } } }),
  reserve: async () => true,
  ...budgetFixture(),
  logUsage: async () => {},
});
const provider = (choice, inspect = () => {}) => {
  let round = 0;
  return async (_, options) => {
    const payload = JSON.parse(options.body);
    inspect(payload, round);
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
            : { content: JSON.stringify(choice) },
        },
      ],
    });
  };
};
const ask = (track, question, choice, tests = [], inspect) => {
  const m = missionById(track);
  return getHint(
    {
      track,
      contentVersion: m.contentVersion,
      question,
      code: m.starter,
      level: 0,
      tests,
    },
    "routing-fixture",
    storage(),
    {
      apiKey: "fixture",
      model: "gpt-4.1-mini",
      fetcher: provider(choice, inspect),
    },
  );
};
test("seven former mismatches use complete rule guidance even alongside similar reported checks", async () => {
  for (const [track, index, question, fact] of [
    [
      "backend",
      4,
      "같은 사용자이고 자리가 다 찼으면 어떤 거절 상태가 먼저예요?",
      /중복 신청을 먼저 검사해 409/,
    ],
    [
      "data",
      0,
      "취소한 첫 신청 다음에 정상 신청이 있으면 어느 것을 세나요?",
      /취소 기록을 먼저 제외.*첫 유효 기록/,
    ],
    [
      "data",
      2,
      "취소 기록뿐인 경우와 빈 기록의 결과는요?",
      /유효한 기록이 없으면 빈 배열/,
    ],
    [
      "ai",
      4,
      "질문도 없고 관련 문서도 없으면 임의 선택해도 되나요?",
      /관련 문서나 질문 단어가 없으면 빈 배열/,
    ],
    [
      "security",
      4,
      "관리자가 남의 신청을 지워도 되는지 규칙이 궁금해요.",
      /타인 기록 삭제는 403/,
    ],
    [
      "security",
      0,
      "비로그인 상태와 소유자 삭제의 응답 숫자가 뭐죠?",
      /비로그인은 401.*본인 기록의 조회·삭제는 200/,
    ],
    [
      "cloud",
      4,
      "정확히 백 건과 2퍼센트, 500ms면 되돌리나요?",
      /100건·2%·500ms이면 promote/,
    ],
  ]) {
    const m = missionById(track);
    const result = await ask(track, question, { intent: "rules" }, [
      { label: m.tests[index].label, passed: false },
    ]);
    assert.equal(result.source, "ai");
    assert.equal(result.guideId, `${track}/boundaries`);
    assert.match(result.message, fact);
    assert.equal(result.nextAction, "edit");
    assert.ok(result.references.every((r) => r.kind === "requirement"));
  }
});
test("check intent cannot turn an arbitrary business-rule question into a test detour", async () => {
  const result = await ask("cloud", "오류율 2%와 요청 100건이 기준인가요?", {
    intent: "check",
    checkId: "cloud/check/5",
  });
  assert.equal(result.source, "guide");
  assert.equal(result.nextAction, undefined);
});
test("an explicit case reference wins over a different failure report and remains inspectable", async () => {
  const m = missionById("security");
  const question = `“${m.tests[4].label}” 항목의 입력과 기대값을 비교해주세요.`;
  const reports = [{ label: m.tests[0].label, passed: false }];
  assert.deepEqual(eligibleCheckIds(m, question, reports), [
    "security/check/5",
  ]);
  const result = await ask(
    m.id,
    question,
    { intent: "check", checkId: "security/check/5" },
    reports,
  );
  assert.equal(result.guideId, "security/check-guide/5");
  assert.equal(result.nextAction, "inspect");
  assert.equal(
    result.references.find((r) => r.kind === "check").label,
    m.tests[4].label,
  );
  const invalid = await ask(
    m.id,
    question,
    { intent: "check", checkId: "security/check/1" },
    reports,
  );
  assert.equal(invalid.source, "guide");
});
test("only canonical unique failures are offered for a generic execution comparison", () => {
  const m = missionById("ai"),
    label = m.tests[0].label;
  const question = "실패한 확인 항목의 입력과 기대값을 비교하고 싶어요.";
  assert.deepEqual(
    eligibleCheckIds(m, question, [
      { label, passed: false },
      { label, passed: true },
      { label: "fake", passed: false },
      { label: m.tests[1].label, passed: true },
      { label: m.tests[2].label, passed: false },
    ]),
    ["ai/check/3"],
  );
  assert.deepEqual(
    eligibleCheckIds(m, "Set은 어떻게 사용하나요?", [
      { label, passed: false, error: "테스트 5" },
    ]),
    [],
  );
});
test("numbered references require a check marker, never just a business-rule number", () => {
  const m = missionById("cloud");
  for (const question of [
    "테스트 3번 입력을 볼래요",
    "확인 항목 #3의 기대값",
    "3번 테스트를 비교해줘",
    "check 3: input please",
    "TEST 3",
  ]) {
    assert.deepEqual(
      eligibleCheckIds(m, question, []),
      ["cloud/check/3"],
      question,
    );
  }
  for (const question of [
    "요청이 100건, 오류율 2%면?",
    "p95 500ms는?",
    "테스트 10번",
    "테스트 2% 기준",
    "테스트 3.5",
    "테스트 2개를 더 돌려봤어요",
    "13번 테스트",
    "테스트 0번",
    "테스트 -3번",
    "0.3번 테스트",
  ]) {
    assert.deepEqual(eligibleCheckIds(m, question, []), [], question);
  }
});
test("selectors cannot carry prose, a caller-picked guide, foreign or invented check IDs", () => {
  const m = missionById("backend");
  for (const choice of [
    { intent: "rules", message: "중복보다 정원이 먼저" },
    { intent: "rules", guideId: "backend/hint/1" },
    { intent: "unknown" },
    { intent: "check" },
    { intent: "check", checkId: "cloud/check/5" },
    { intent: "check", checkId: "backend/check/99" },
    { intent: "step", level: 3 },
    { intent: "syntax", checkId: "backend/check/1" },
  ])
    assert.equal(
      resolveCoachSelection(choice, m, 0, inspected, ["backend/check/1"]),
      null,
    );
  assert.equal(
    resolveCoachSelection(
      { intent: "rules" },
      m,
      0,
      new Set(["read_mission"]),
      [],
    ),
    null,
  );
});
test("step intent follows the current help level without accepting model-supplied answer code", () => {
  const m = missionById("ai");
  for (let level = 0; level < 3; level++) {
    const result = resolveCoachSelection(
      { intent: "step" },
      m,
      level,
      inspected,
      [],
    );
    assert.equal(result.guideId, `ai/hint/${level + 1}`);
    assert.equal(result.message, m.hints[level]);
  }
});
test("the final classifier receives separate guidance plans and only eligible comparison IDs", async () => {
  const m = missionById("data");
  const reports = [{ label: m.tests[1].label, passed: false }];
  let final;
  const result = await ask(
    m.id,
    "실패한 확인 항목의 입력과 기대값을 비교해 주세요.",
    { intent: "check", checkId: "data/check/2" },
    reports,
    (p, round) => {
      if (round === 2) final = p;
    },
  );
  assert.equal(result.source, "ai");
  const task = JSON.parse(
    final.messages.find(
      (x) => x.role === "tool" && JSON.parse(x.content).guidance,
    ).content,
  );
  assert.deepEqual(
    new Set(task.guidance.map((g) => g.intent)),
    new Set(["rules", "syntax", "step"]),
  );
  const policy = JSON.parse(final.messages.at(-1).content);
  assert.deepEqual(policy.eligibleCheckIds, ["data/check/2"]);
  assert.ok(result.trace.includes("확인 항목 비교 요청 확인"));
});
