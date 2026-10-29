import assert from "node:assert/strict";
import { liveProjectionDefinition as def } from "../index.js";

let state = def.init({}, 0);
const ev = (type, time, data) => ({ type, time, data, seq: 0 });

state = def.apply(state, ev("turn/start", 1000, { turn: 1 }));
assert.equal(state.phase, "llm");
assert.equal(state.turn, 1);

state = def.apply(state, ev("step/start", 1100, { turn: 1, step: 1 }));
assert.equal(state.step, 1);

state = def.apply(state, ev("tool/call", 1200, { callId: "c1", name: "bash", arguments: {} }));
assert.equal(state.phase, "tool");
assert.equal(state.tool.name, "bash");

state = def.apply(state, ev("tool/result", 1700, {
  turn: 1, step: 1,
  message: { role: "tool", toolCallId: "c1", source: { kind: "tool", callId: "c1" }, isError: false, content: [] }
}));
assert.equal(state.tool, null);
assert.equal(state.recent.length, 1);
assert.equal(state.recent[0].ms, 500);
assert.equal(state.recent[0].ok, true);

// a result for another call leaves the running tool alone
const other = { role: "tool", toolCallId: "c9", source: { kind: "tool", callId: "c9" }, isError: true, content: [] };
const busy = def.apply(state, ev("tool/call", 1750, { turn: 1, step: 1, callId: "c2", name: "read", arguments: "{}" }));
assert.equal(def.apply(busy, ev("tool/result", 1760, { turn: 1, step: 1, message: other })), busy, "foreign results are ignored");
// a failed call lands in the recent list as a failure
state = def.apply(busy, ev("tool/result", 1800, {
  turn: 1, step: 1,
  message: { role: "tool", toolCallId: "c2", source: { kind: "tool", callId: "c2" }, isError: true, content: [] }
}));
assert.equal(state.recent[0].name, "read");
assert.equal(state.recent[0].ok, false);

state = def.apply(state, ev("approval/asked", 1800, { id: "a1", toolName: "write" }));
assert.equal(state.phase, "waiting");
assert.equal(state.pending.length, 1);

state = def.apply(state, ev("approval/decided", 1900, { id: "a1", outcome: "allow" }));
assert.equal(state.pending.length, 0);

state = def.apply(state, ev("job/registered", 2000, { jobId: "j1", label: "dev server", startedAt: 1900 }));
assert.equal(state.jobs.length, 1);

state = def.apply(state, ev("assistant/message", 2100, { turn: 1, step: 1, usage: { inputTokens: 120, outputTokens: 30 } }));
assert.equal(state.tokensIn, 120);
assert.equal(state.tokensOut, 30);

state = def.apply(state, ev("llm/retry", 2200, {
  retryId: "r1", turn: 1, step: 1, provider: "openai", mode: "normal", policyKey: "default",
  retry: 1, maxRetries: 3, delayMs: 1000, failure: { message: "rate limited", code: "rate_limit", status: 429 }
}));
assert.equal(state.errors, 1);
assert.equal(state.lastError, "rate limited");
assert.equal(state.phase, "llm");

// countdown updates of the same failure share the retryId and must not count again
state = def.apply(state, ev("llm/retry", 2600, {
  retryId: "r1", turn: 1, step: 1, provider: "openai", mode: "normal", policyKey: "default",
  retry: 2, maxRetries: 3, delayMs: 2000, failure: { message: "rate limited", code: "rate_limit", status: 429 }
}));
assert.equal(state.errors, 1, "retry updates must not double-count");

// the attempt itself restarts the model without touching the error count
const retryStarted = def.apply(state, ev("llm/retry-started", 2700, { retryId: "r1", turn: 1, step: 1, retry: 2 }));
assert.equal(retryStarted.errors, 1);
assert.equal(retryStarted.phase, "llm");
assert.equal(def.apply(retryStarted, ev("llm/retry-started", 2750, { retryId: "r1", turn: 1, step: 1, retry: 2 })), retryStarted, "a retry start already in llm keeps the reference");

state = def.apply(state, ev("job/settled", 2300, { jobId: "j1" }));
assert.equal(state.jobs.length, 0);

const quiet = def.apply(state, ev("user/message", 2400, { text: "hi" }));
assert.equal(quiet, state, "unowned events must return the same reference");

state = def.apply(state, ev("turn/end", 2500, {}));
assert.equal(state.phase, "idle");
assert.equal(state.tool, null);

const view = def.wire.view(state);
assert.deepEqual(Object.keys(view).sort(), ["errors","jobs","lastError","phase","recent","step","stepStartedAt","tokensIn","tokensOut","tool","turn","turnStartedAt","pending"].sort());
const parsed = def.wire.viewSchema.parse(view);
assert.equal(parsed.phase, "idle");

// schema rejects garbage instead of silently passing it through
assert.throws(() => def.stateSchema.parse({ phase: 5, pending: "nope" }), /pending must be an array/);
assert.throws(() => def.stateSchema.parse(null), /live must be an object/);

// a checkpoint round trip (what restore() does) keeps the shape
const restored = def.stateSchema.parse(JSON.parse(JSON.stringify(view)));
assert.deepEqual(restored, parsed);

console.log("host fold OK: turn/step/tool/approval/job/token/retry/turn-end + same-ref suppression + schema rejection");
