import { budgetFixture } from "./helpers/budget-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { coachInput, getHint } from "../lib/coach.ts";
const input = {
  track: "ai",
  code: "function retrieveDocs(q,d){return []}",
  question: "겹치는 단어를 어떻게 세나요?",
  level: 0,
  tests: [],
};
function setup({ consent = true, allow = true } = {}) {
  const usage = [];
  let reservations = 0;
  return {
    usage,
    get reservations() {
      return reservations;
    },
    read: async () => ({
      state: { profile: { aiConsent: consent, experience: "처음이에요" } },
    }),
    reserve: async () => {
      reservations++;
      return allow;
    },
    ...budgetFixture(),
    logUsage: async (x) => usage.push(x),
  };
}
const reply = (message) =>
  Response.json({
    choices: [{ message }],
    usage: { prompt_tokens: 20, completion_tokens: 10 },
  });
test("coach reads authoritative mission using a real tool loop before suggesting a next step", async () => {
  const store = setup(),
    calls = [];
  const fetcher = async (_, options) => {
    const payload = JSON.parse(options.body);
    calls.push(payload);
    if (calls.length === 1)
      return reply({
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "read_mission", arguments: "{}" },
          },
        ],
      });
    if (calls.length === 2)
      return reply({
        tool_calls: [
          {
            id: "call_2",
            type: "function",
            function: { name: "inspect_checks", arguments: "{}" },
          },
        ],
      });
    assert.equal(payload.tool_choice, "none");
    assert.ok(
      payload.messages.some(
        (m) =>
          m.role === "tool" &&
          JSON.parse(m.content).source === "student_browser_unverified",
      ),
    );
    return reply({
      content: JSON.stringify({
        intent: "step",
      }),
    });
  };
  const result = await getHint(input, "owner", store, {
    apiKey: "test-key",
    model: "gpt-4.1-mini",
    fetcher,
  });
  assert.equal(result.source, "ai");
  assert.deepEqual(result.trace, [
    "과제 조건 확인",
    "공식 확인 항목 검토",
    "다음 단계 질문 확인",
    "과제 근거 대조",
    "검수 힌트 선택",
  ]);
  assert.equal(calls.length, 3);
  assert.equal(store.usage[0].inputTokens, 60);
  assert.equal(store.usage[0].outcome, "success");
  assert.ok(!JSON.stringify(store.usage).includes(input.code));
});
test("missing credentials, consent, and budget never make provider requests", async () => {
  for (const [store, key] of [
    [setup(), undefined],
    [setup({ consent: false }), "test"],
    [setup({ allow: false }), "test"],
  ]) {
    let called = false;
    const result = await getHint(input, "owner", store, {
      apiKey: key,
      model: "gpt-4.1-mini",
      fetcher: async () => {
        called = true;
        throw Error();
      },
    });
    assert.equal(result.source, "guide");
    assert.equal(called, false);
  }
});
test("provider failure, timeout, and invalid JSON are clearly labelled as basic hints", async () => {
  for (const fetcher of [
    async () => new Response("{}", { status: 429 }),
    async () => {
      throw Error("timeout");
    },
    async () => reply({ content: "invalid" }),
  ]) {
    const store = setup();
    const result = await getHint(input, "owner", store, {
      apiKey: "test",
      model: "gpt-4.1-mini",
      fetcher,
    });
    assert.equal(result.source, "guide");
    assert.ok(result.notice);
    assert.notEqual(store.usage[0].outcome, "success");
  }
});
test("unknown tool calls and unbounded tool loops are rejected", async () => {
  const store = setup();
  const result = await getHint(input, "owner", store, {
    apiKey: "test",
    model: "gpt-4.1-mini",
    fetcher: async () =>
      reply({
        tool_calls: [
          {
            id: "x",
            type: "function",
            function: { name: "read_secrets", arguments: "{}" },
          },
        ],
      }),
  });
  assert.equal(result.source, "guide");
});
test("coach validates every supported role and rejects oversized or empty inputs", () => {
  for (const track of [
    "frontend",
    "backend",
    "data",
    "ai",
    "security",
    "cloud",
  ])
    assert.ok(coachInput.safeParse({ ...input, track }).success);
  for (const value of [
    { ...input, track: "unknown" },
    { ...input, question: " " },
    { ...input, code: "a".repeat(20001) },
    { ...input, tests: Array(6).fill({ label: "x", passed: false }) },
  ])
    assert.equal(coachInput.safeParse(value).success, false);
});

test("AI context omits legacy/unanswered values and includes only explicitly supplied answers", async () => {
  for (const profile of [
    { experience: "auto default", purpose: "auto purpose", aiConsent: true },
    { experience: null, purpose: null, aiConsent: true },
    {
      experience: "직접 고른 경험",
      experienceSource: "self_reported",
      purpose: "확인 안 된 목적",
      purposeSource: "legacy_unverified",
      aiConsent: true,
    },
    {
      experience: "선택한 경험",
      experienceSource: "self_reported",
      purpose: "선택한 목적",
      purposeSource: "self_reported",
      aiConsent: true,
    },
  ]) {
    const store = setup();
    store.read = async () => ({ state: { profile } });
    let user;
    await getHint(input, "owner", store, {
      apiKey: "test",
      model: "gpt-4.1-mini",
      fetcher: async (_, o) => {
        user = JSON.parse(JSON.parse(o.body).messages[1].content);
        return reply({
          content: JSON.stringify({ message: "hint", nextAction: "edit" }),
        });
      },
    });
    assert.equal(
      user.experience,
      profile.experienceSource === "self_reported"
        ? profile.experience
        : undefined,
    );
    assert.equal(
      user.purpose,
      profile.purposeSource === "self_reported" ? profile.purpose : undefined,
    );
  }
});
test("the server deadline includes storage lookup and prevents provider calls after expiry", async () => {
  let resolveRead,
    calls = 0;
  const store = setup();
  store.read = () => new Promise((r) => (resolveRead = r));
  const result = await getHint(input, "owner", store, {
    apiKey: "test",
    model: "gpt-4.1-mini",
    timeoutMs: 20,
    fetcher: async () => {
      calls++;
      return reply({});
    },
  });
  assert.equal(result.source, "guide");
  resolveRead({ state: { profile: { aiConsent: true } } });
  await new Promise((r) => setImmediate(r));
  assert.equal(calls, 0);
  assert.equal(store.reservations, 0);
});
test("tool rounds share one budget rather than restarting the timeout on each call", async () => {
  const store = setup(),
    signals = [];
  let calls = 0;
  const result = await getHint(input, "owner", store, {
    apiKey: "test",
    model: "gpt-4.1-mini",
    timeoutMs: 45,
    fetcher: async (_, o) => {
      calls++;
      signals.push(o.signal);
      await new Promise((r) => setTimeout(r, 30));
      return reply({
        tool_calls: [
          {
            id: "x",
            type: "function",
            function: { name: "read_mission", arguments: "{}" },
          },
        ],
      });
    },
  });
  assert.equal(result.source, "guide");
  assert.equal(calls, 2);
  assert.equal(signals[0], signals[1]);
  assert.equal(signals[0].aborted, true);
  await new Promise((r) => setTimeout(r, 35));
  assert.equal(calls, 2);
});
test("slow usage logging cannot hold a completed request beyond the overall deadline", async () => {
  const store = setup();
  let outcome,
    round = 0;
  store.logUsage = (usage) => {
    outcome = usage.outcome;
    return new Promise(() => {});
  };
  const result = await getHint(input, "owner", store, {
    apiKey: "test",
    model: "gpt-4.1-mini",
    timeoutMs: 20,
    fetcher: async () => {
      const name = ["read_mission", "inspect_checks"][round++];
      return reply(
        name
          ? {
              tool_calls: [
                {
                  id: String(round),
                  type: "function",
                  function: { name, arguments: "{}" },
                },
              ],
            }
          : { content: JSON.stringify({ intent: "step" }) },
      );
    },
  });
  assert.equal(outcome, "success");
  assert.equal(result.source, "guide");
});
