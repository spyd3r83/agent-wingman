import { describe, expect, test } from "bun:test"
import { ContextAdvisories, deliverDecision } from "../src/adapters"
import { DEFAULT_CONFIG, loadConfig } from "../src/config"
import { WingmanEngine } from "../src/engine"
import { redactSensitive, stableFingerprint } from "../src/fingerprint"

const decision = {
  sessionID: "s",
  episodeKey: "k",
  score: 8,
  confidence: "eligible" as const,
  detections: [],
  message: "synthetic advisory",
  notice: "notice",
  timestamp: 1,
}

describe("WingmanEngine", () => {
  test("fires on a repeated failing action", () => {
    const engine = new WingmanEngine({ ...loadConfig(), minRelevantActions: 1, cooldownMs: 0 })
    let fired = false
    for (let index = 0; index < 5; index += 1) {
      fired ||= Boolean(engine.observe({
        kind: "tool",
        sessionID: "s",
        tool: "bash",
        args: { command: "bun test" },
        output: "Error: test failed",
        success: false,
      }))
    }
    expect(fired).toBe(true)
  })

  test("does not fire through productive edits", () => {
    const engine = new WingmanEngine({ ...loadConfig(), minRelevantActions: 1, cooldownMs: 0 })
    const events = [
      { kind: "tool" as const, tool: "bash", args: { command: "bun test" }, output: "Error: one", success: false },
      { kind: "tool" as const, tool: "apply_patch", args: { file: "src/a.ts" }, output: "patched", success: true },
      { kind: "tool" as const, tool: "bash", args: { command: "bun test" }, output: "Error: two", success: false },
      { kind: "tool" as const, tool: "apply_patch", args: { file: "src/b.ts" }, output: "patched", success: true },
    ]
    expect(events.some((event) => engine.observe({ sessionID: "s", ...event }))).toBe(false)
  })

  test("bounds session state with least-recently-used eviction", () => {
    const engine = new WingmanEngine({ ...loadConfig(), maxSessions: 2 })
    engine.observe({ kind: "message", sessionID: "a", message: "one" })
    engine.observe({ kind: "message", sessionID: "b", message: "two" })
    engine.observe({ kind: "message", sessionID: "a", message: "three" })
    engine.observe({ kind: "message", sessionID: "c", message: "four" })
    expect(engine.sessionCount).toBe(2)
    expect(engine.getState("a")).toBeDefined()
    expect(engine.getState("b")).toBeUndefined()
  })

  test("redacts secrets and safely handles circular values", () => {
    const circular: { token: string; self?: unknown } = { token: ["ghp", "1234567890abcdef"].join("_") }
    circular.self = circular
    const redacted = redactSensitive(circular)
    expect(redacted).not.toContain("1234567890abcdef")
    expect(redacted).toContain("<redacted>")
    expect(stableFingerprint(circular)).toBe(stableFingerprint(circular))
  })
})

describe("delivery adapters", () => {
  test("uses the stable OpenCode TUI request shape", async () => {
    const calls: unknown[] = []
    const result = await deliverDecision({
      tui: { showToast: async (input: unknown) => { calls.push(input) } },
      app: { log: async () => undefined },
    }, decision, { ...loadConfig(), mode: "notify" })

    expect(result.delivered).toBe(true)
    expect(calls).toEqual([{
      body: {
        title: "Agent Wingman",
        message: "synthetic advisory",
        variant: "warning",
        duration: 9000,
      },
      throwOnError: true,
    }])
  })

  test('queues context without creating a user message or starting a reply', async () => {
    const calls: unknown[] = [];
    const config = loadConfig({}, {});
    const context = new ContextAdvisories(config);
    const info = {
      id: 'msg_worker', sessionID: 's', role: 'user', agent: 'change-engineer',
      model: {providerID: 'openai', modelID: 'worker-model'},
      variant: 'xhigh', tools: {task: false}, system: 'Retain worker instructions.',
      format: {type: 'text'},
      executionContext: {invocationID: 'invocation-worker', runID: 'run-worker'},
    };
    const original = structuredClone(info);
    const output = {messages: [{info, parts: [{type: 'text', text: 'Original task'}]}]};
    expect(context.apply(output, 1)).toBe(0);
    const result = await deliverDecision({
      session: {prompt: async (input: unknown) => { calls.push(input); }},
      app: {log: async () => undefined},
    }, decision, config, context);
    expect(result.mode).toBe('inject');
    expect(result.delivered).toBe(true);
    expect(calls).toHaveLength(0);
    expect(context.apply(output, 1)).toBe(1);
    expect(output.messages[0]?.info).toBe(info);
    expect(info).toEqual(original);
    expect(output.messages[0]?.parts[0]).toEqual({type: 'text', text: 'Original task'});
    expect(output.messages[0]?.parts[1]).toMatchObject({
      sessionID: 's', messageID: 'msg_worker',
      type: 'text', text: decision.message, synthetic: true,
    });
    expect(context.apply(output, 1)).toBe(0);
  });

  test('falls back to notification when no context hook is supplied', async () => {
    const prompts: unknown[] = [];
    const notices: unknown[] = [];
    const result = await deliverDecision({
      session: {prompt: async (input: unknown) => { prompts.push(input); }},
      tui: {showToast: async (input: unknown) => { notices.push(input); }},
    }, decision, loadConfig({}, {}));
    expect(result.mode).toBe('notify');
    expect(result.fallbackUsed).toBe(true);
    expect(prompts).toHaveLength(0);
    expect(notices).toHaveLength(1);
  });

  test('bounds, expires and clears pending advisories', () => {
    const config = {...loadConfig({}, {}), maxSessions: 1, maxInterventionsPerWindow: 1};
    const context = new ContextAdvisories(config);
    const old = {messages: [{
      info: {id: 'msg_old', sessionID: 'old', role: 'user'}, parts: [],
    }]};
    const current = {messages: [{
      info: {id: 'msg_current', sessionID: 's', role: 'user'}, parts: [],
    }]};
    context.apply(old, 1);
    expect(context.enqueue({...decision, sessionID: 'old'})).toBe(true);
    context.apply(current, 1);
    expect(context.enqueue({...decision, sessionID: 'old'})).toBe(false);
    context.enqueue(decision);
    context.enqueue({...decision, message: 'Newest advisory'});
    expect(context.apply(current, 1)).toBe(1);
    expect(current.messages[0]?.parts).toHaveLength(1);
    expect(current.messages[0]?.parts[0]).toMatchObject({text: 'Newest advisory'});
    expect(context.apply(old, 1)).toBe(0);
    context.apply(current, 1);
    context.enqueue(decision);
    expect(context.apply(current, config.interventionWindowMs + 2)).toBe(0);
    context.enqueue(decision);
    context.clearSession('s');
    expect(context.apply(current, 1)).toBe(0);
  });

  test('uses the latest user message only in the matching session', () => {
    const context = new ContextAdvisories(loadConfig({}, {}));
    const output = {messages: [
      {info: {id: 'msg_old', sessionID: 's', role: 'user'}, parts: []},
      {info: {id: 'msg_current', sessionID: 's', role: 'user'}, parts: []},
      {info: {id: 'msg_foreign', sessionID: 'foreign', role: 'user'}, parts: []},
      {info: {id: 'msg_assistant', sessionID: 's', role: 'assistant'}, parts: []},
    ]};
    context.apply(output, 1);
    context.enqueue(decision);
    expect(context.apply(output, 1)).toBe(1);
    expect(output.messages.map(message => message.parts.length)).toEqual([0, 1, 0, 0]);
  });

  test("falls back to notify when the injection safety switch is disabled", async () => {
    const calls: unknown[] = []
    const result = await deliverDecision({
      tui: { showToast: async (input: unknown) => { calls.push(input) } },
      app: { log: async () => undefined },
    }, decision, { ...loadConfig(), mode: "inject", experimentalInject: false })
    expect(result.mode).toBe("notify")
    expect(result.fallbackUsed).toBe(true)
    expect(calls).toHaveLength(1)
  })
})

describe("configuration", () => {
  test("defaults to active inline injection", () => {
    expect(loadConfig({}, {}).mode).toBe("inject")
    expect(loadConfig({}, {}).experimentalInject).toBe(true)
  })

  test("clamps numeric options to safe bounds", () => {
    const config = loadConfig({ maxSessions: 0, maxObservations: 999999, cooldownMs: -1 }, {})
    expect(config.maxSessions).toBe(1)
    expect(config.maxObservations).toBe(2048)
    expect(config.cooldownMs).toBe(0)
    expect(DEFAULT_CONFIG.maxSessions).toBe(64)
  })
})
