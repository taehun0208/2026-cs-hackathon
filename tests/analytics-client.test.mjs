import test from "node:test";
import assert from "node:assert/strict";
import {
  createAnalyticsClient,
  ANALYTICS_PAUSED_KEY,
} from "../lib/analytics-client.ts";
import { missions, initialProgress } from "../lib/missions.ts";
import {
  makeNextActionPlan,
  recommendationContext,
  nextActionSuggestion,
} from "../lib/next-actions.ts";
const off = { enabled: false, token: null, participantCode: null };
function fixture({ enabled = false, storedPause = false, fetcher } = {}) {
  const token = crypto.randomUUID(),
    calls = [],
    memory = new Map(storedPause ? [[ANALYTICS_PAUSED_KEY, "1"]] : []),
    session = new Map();
  let state;
  const consent = () => ({
    enabled,
    token: enabled ? token : null,
    participantCode: enabled ? "QA" : null,
  });
  const storage = (map) => ({
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  });
  const client = createAnalyticsClient({
    session: storage(session),
    preferences: storage(memory),
    flushMs: 10000,
    timeoutMs: 80,
    onStatus: (s) => (state = s),
    fetcher: async (url, o) => {
      calls.push({
        method: o.method,
        body: o.body ? JSON.parse(o.body) : null,
      });
      if (fetcher) return fetcher(url, o);
      if (o.method === "PUT") {
        enabled = JSON.parse(o.body).enabled;
        return Response.json(consent());
      }
      return Response.json(
        o.method === "GET"
          ? consent()
          : { accepted: JSON.parse(o.body).events.length },
      );
    },
  });
  return {
    client,
    calls,
    memory,
    session,
    get state() {
      return state;
    },
  };
}
const begin = (f) =>
  f.client.begin("frontend", "code", missions[0].contentVersion, "new");
const allEvents = (f) =>
  f.calls.filter((c) => c.method === "POST").flatMap((c) => c.body.events);
test("no client analytics identifiers or events are created without affirmative consent", async () => {
  const f = fixture();
  await f.client.load();
  begin(f);
  f.client.track("page_view", { page: "home" });
  await f.client.flush();
  assert.deepEqual(
    f.calls.map((c) => c.method),
    ["GET"],
  );
  assert.equal(f.session.size, 0);
  f.client.dispose();
});
test("opted-in actions are validated and batched; raw text and null captured journeys cannot attach to another task", async () => {
  const f = fixture({ enabled: true });
  await f.client.load();
  const context = begin(f);
  f.client.track("help_open", { kind: "basic_hint", question: "private" });
  f.client.track("help_open", { kind: "basic_hint" });
  f.client.track(
    "run_result",
    {
      executionId: crypto.randomUUID(),
      kind: "edited",
      passed: 1,
      total: 5,
      outcome: "checks",
    },
    null,
  );
  await f.client.flush();
  const events = allEvents(f);
  assert.deepEqual(
    events.map((e) => e.name),
    ["mission_start", "help_open"],
  );
  assert.equal(events[1].context.journeyId, context.journeyId);
  assert.ok(!JSON.stringify(events).includes("private"));
  f.client.dispose();
});
test("withdrawal clears queued actions immediately and a failed server withdrawal stays paused on reload", async () => {
  const f = fixture({
    enabled: true,
    fetcher: async (_url, o) =>
      o.method === "GET"
        ? Response.json({
            enabled: true,
            token: crypto.randomUUID(),
            participantCode: null,
          })
        : Promise.reject(new Error("offline")),
  });
  await f.client.load();
  begin(f);
  await f.client.setConsent(false, null);
  await f.client.flush();
  assert.equal(f.state.enabled, false);
  assert.equal(f.state.phase, "error");
  assert.equal(f.memory.get(ANALYTICS_PAUSED_KEY), "1");
  assert.equal(allEvents(f).length, 0);
  await f.client.load();
  assert.equal(f.state.enabled, false);
  assert.equal(f.calls.filter((c) => c.method === "PUT").length, 2);
  f.client.dispose();
});
test("a cross-tab pause can be applied without rewriting the shared resume signal", async () => {
  const f = fixture({ enabled: true });
  await f.client.load();
  begin(f);
  f.client.pause(false);
  assert.equal(f.memory.has(ANALYTICS_PAUSED_KEY), false);
  assert.equal(f.state.enabled, false);
  assert.equal(f.session.size, 0);
  f.client.dispose();
});
test("save milestones are emitted only for the acknowledged reflection snapshot, once, without note or reason text", async () => {
  const f = fixture({ enabled: true });
  await f.client.load();
  begin(f);
  const m = missions[0],
    execution = {
      id: crypto.randomUUID(),
      kind: "edited",
      contentVersion: m.contentVersion,
    };
  const reflection = {
    interest: 4,
    difficulty: 2,
    again: 4,
    note: "private reflection",
    next: "",
    endedAt: "2026-11-23T00:00:00Z",
    execution,
  };
  const lab = { version: 1, progress: { frontend: initialProgress(m) } },
    ctx = recommendationContext(lab, m.id, reflection),
    suggestion = nextActionSuggestion(reflection, m.id, ctx),
    candidate = suggestion.candidates[0];
  reflection.next = candidate.title;
  reflection.nextPlan = makeNextActionPlan(
    m,
    execution.id,
    reflection,
    ctx,
    candidate.id,
    "private selection reason",
  );
  f.client.reflectionSubmitted(m.id, reflection);
  f.client.end("submitted");
  f.client.saved(lab);
  await f.client.flush();
  assert.equal(
    allEvents(f).filter((e) => e.name === "reflection_saved").length,
    0,
  );
  lab.progress.frontend.reflection = reflection;
  f.client.saved(lab);
  f.client.saved(lab);
  await f.client.flush();
  const events = allEvents(f);
  assert.equal(events.filter((e) => e.name === "reflection_saved").length, 1);
  assert.equal(
    events.filter((e) => e.name === "next_action_committed").length,
    1,
  );
  assert.ok(!JSON.stringify(events).includes("private"));
  f.client.dispose();
});
test("a new consent period cannot report a previous pending reflection", async () => {
  const f = fixture({ enabled: true });
  await f.client.load();
  const old = begin(f);
  await f.client.setConsent(false, null);
  await f.client.setConsent(true, null);
  f.client.track("help_open", { kind: "basic_hint" }, old);
  await f.client.flush();
  assert.equal(allEvents(f).length, 0);
  f.client.dispose();
});
test("analytics delivery failure does not reject the caller or preserve a raw retry queue", async () => {
  const f = fixture({
    enabled: true,
    fetcher: async (_url, o) =>
      o.method === "GET"
        ? Response.json({
            enabled: true,
            token: crypto.randomUUID(),
            participantCode: null,
          })
        : Promise.reject(new Error("network")),
  });
  await f.client.load();
  begin(f);
  await assert.doesNotReject(f.client.flush());
  assert.equal(f.state.enabled, true);
  assert.match(f.state.message, /체험은 계속/);
  await f.client.flush();
  assert.equal(f.calls.filter((c) => c.method === "POST").length, 1);
  f.client.dispose();
});
