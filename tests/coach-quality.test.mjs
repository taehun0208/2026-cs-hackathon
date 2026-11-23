import { budgetFixture } from "./helpers/budget-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { getHint, coachInput } from "../lib/coach.ts";
import { missions, missionById } from "../lib/missions.ts";
import {
  coachGuides,
  reportedChecks,
  validateSelection,
} from "../lib/coach-guides.ts";
const store = () => ({
  read: async () => ({ state: { profile: { aiConsent: true } } }),
  reserve: async () => true,
  ...budgetFixture(),
  logUsage: async () => {},
});
const select = (g) =>
  g.id.includes("check-guide")
    ? { intent: "check", checkId: g.checkIds[0] }
    : {
        intent: g.id.endsWith("boundaries")
          ? "rules"
          : g.id.endsWith("syntax")
            ? "syntax"
            : "step",
      };
function provider(final, inspect = () => {}) {
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
                    id: `c${round}`,
                    type: "function",
                    function: { name, arguments: "{}" },
                  },
                ],
              }
            : { content: JSON.stringify(final) },
        },
      ],
    });
  };
}
const config = (fetcher) => ({
  apiKey: "fixture-key",
  model: "gpt-4.1-mini",
  fetcher,
});
const input = (m) => ({
  track: m.id,
  contentVersion: m.contentVersion,
  code: m.starter,
  question: "조건을 확인하고 싶어요",
  level: 0,
  tests: [],
});

// Model-selection relevance is evaluated by scripts/eval-coach.mjs using
// held-out expectations, not simulated by returning the expected guide here.
const attacks = [
  [
    "actual zero-score regression",
    {
      message: "점수가 0 이상인 문서 id만 최대 2개 선택하세요.",
      nextAction: "edit",
    },
  ],
  [
    "fabricated run result",
    { message: "직접 실행해보니 모든 점수가 0이고 5/5 통과입니다." },
  ],
  [
    "complete answer",
    { message: "function retrieveDocs(q,d){ return d.map(x=>x.id) }" },
  ],
  ["aptitude judgement", { message: "당신은 AI 직무에 적합하지 않습니다." }],
  ["secret request", { message: "비밀키를 입력해주세요." }],
];
for (const [name, bad] of attacks) {
  test(`blocks ${name}, even when valid guide IDs accompany the claim`, async () => {
    const m = missionById("ai"),
      g = coachGuides(m).find((g) => g.id === "ai/boundaries");
    for (const value of [bad, { ...select(g), ...bad }]) {
      const result = await getHint(
        input(m),
        "fixture",
        store(),
        config(provider(value)),
      );
      assert.equal(result.source, "guide");
      assert.equal(result.message, m.hints[0]);
      assert.equal(result.references, undefined);
      assert.equal(result.trace, undefined);
    }
  });
}
test("unknown, cross-role, duplicate and mismatched references fall back instead of being laundered", async () => {
  const m = missionById("ai"),
    g = coachGuides(m).find((g) => g.id === "ai/boundaries");
  for (const value of [
    { ...select(g), guideId: "cloud/boundaries" },
    { ...select(g), guideId: "ai/invented" },
    { ...select(g), requirementIds: ["ai/requirement/99"] },
    { ...select(g), requirementIds: Array(3).fill("ai/requirement/1") },
    { ...select(g), checkIds: ["ai/check/99"] },
    { ...select(g), checkIds: ["ai/check/1"] },
    { ...select(g), nextAction: "deploy" },
  ])
    assert.equal(
      (await getHint(input(m), "fixture", store(), config(provider(value))))
        .source,
      "guide",
    );
});
test("a final selection before both required tools have run is not accepted", async () => {
  const m = missionById("ai"),
    g = coachGuides(m)[0];
  assert.equal(
    validateSelection({ guideId: g.id }, m, new Set(["read_mission"])),
    null,
  );
  const result = await getHint(
    input(m),
    "fixture",
    store(),
    config(async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify(select(g)) } }],
      }),
    ),
  );
  assert.equal(result.source, "guide");
});
test("empty, partial, unknown and conflicting client reports never become a fabricated pass count", async () => {
  const m = missionById("ai"),
    label = m.tests[0].label,
    g = coachGuides(m)[0];
  for (const [reports, count] of [
    [[], 0],
    [[{ label, passed: true }], 1],
    [[{ label: "fake", passed: true }], 0],
    [
      [
        { label, passed: true },
        { label, passed: false },
      ],
      0,
    ],
    [
      [
        { label, passed: true },
        { label, passed: true },
      ],
      0,
    ],
  ]) {
    const checks = reportedChecks(m, reports);
    assert.equal(checks.filter((c) => c.reported).length, count);
    const result = await getHint(
      { ...input(m), tests: reports },
      "fixture",
      store(),
      config(
        provider(select(g), (p, round) => {
          if (round === 2) {
            const evidence = JSON.parse(
              p.messages.find(
                (x) => x.role === "tool" && JSON.parse(x.content).checks,
              ).content,
            );
            assert.equal(evidence.source, "student_browser_unverified");
            assert.equal(evidence.checks.length, 5);
          }
        }),
      ),
    );
    assert.ok(
      result.trace.includes(
        count
          ? "브라우저 보고 1/5항목 확인 · 서버 실행 아님"
          : "공식 확인 항목 검토",
      ),
    );
    assert.ok(!result.trace.some((t) => /통과/.test(t)));
  }
});
test("check-specific selections cite the actual official input/expected case and use inspect action", async () => {
  for (const m of missions)
    for (let i = 0; i < m.tests.length; i++) {
      const g = coachGuides(m).find(
        (g) => g.id === `${m.id}/check-guide/${i + 1}`,
      );
      const result = await getHint(
        {
          ...input(m),
          question: `“${m.tests[i].label}” 확인 항목의 입력과 기대값을 비교해 주세요.`,
        },
        "fixture",
        store(),
        config(provider(select(g))),
      );
      assert.equal(result.source, "ai");
      assert.equal(result.nextAction, "inspect");
      assert.equal(
        result.references.find((r) => r.kind === "check").label,
        m.tests[i].label,
      );
      assert.ok(result.message.includes(m.tests[i].why));
    }
});
test("code and trimmed question share one 20000-character input budget", () => {
  const body = input(missions[0]);
  assert.ok(
    coachInput.safeParse({ ...body, code: "a".repeat(19999), question: "?" })
      .success,
  );
  assert.equal(
    coachInput.safeParse({ ...body, code: "a".repeat(20000), question: "?" })
      .success,
    false,
  );
  assert.equal(coachInput.safeParse({ ...body, question: " " }).success, false);
});
// Independent boundary expectations: changing a hint to >= or swapping status
// priority must fail even when the model returns perfectly valid IDs.
const boundaries = [
  [
    "frontend",
    /registered < capacity/,
    [
      [[{ id: 1, registered: 2, capacity: 2, category: "개발" }], "전체", true],
      [],
    ],
  ],
  [
    "backend",
    /중복 신청을 먼저 검사해 409/,
    [[["a"], "a", 1], { status: 409, accepted: false }],
  ],
  [
    "data",
    /취소 기록을 먼저 제외.*첫 유효 기록.*Math.round/,
    [
      [
        [
          { userId: "a", category: "개발", cancelled: true, attended: false },
          { userId: "a", category: "개발", cancelled: false, attended: true },
        ],
      ],
      [{ category: "개발", total: 1, attended: 1, rate: 100 }],
    ],
  ],
  ["ai", /0인 문서는 제외.*score > 0/, [[["x"], [{ id: 1, tags: ["y"] }]], []]],
  [
    "security",
    /타인 기록 삭제는 403/,
    [[{ id: "admin", role: "admin" }, { ownerId: "other" }, "delete"], 403],
  ],
  [
    "cloud",
    /오류율 > 0.02 또는 p95Ms > 500.*100건·2%·500ms이면 promote/,
    [[{ requests: 100, errors: 2, p95Ms: 500 }], "promote"],
  ],
];
for (const [track, text, [args, expected]] of boundaries)
  test(`${track}: reviewed boundary statement agrees with an independent edge-case oracle`, async () => {
    const m = missionById(track),
      g = coachGuides(m).find((g) => g.id === `${track}/boundaries`);
    const result = await getHint(
      input(m),
      "fixture",
      store(),
      config(provider(select(g))),
    );
    assert.match(result.message, text);
    const value = vm.runInNewContext(
      m.solution + `; ${m.fn}(...input)`,
      { input: structuredClone(args) },
      { timeout: 300 },
    );
    assert.deepEqual(JSON.parse(JSON.stringify(value)), expected);
  });
