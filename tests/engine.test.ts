import { describe, expect, test } from "bun:test"
import { deliverDecision } from "../src/adapters"
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
  test("uses the current OpenCode TUI request shape", async () => {
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

  test("uses no-reply synthetic parts for opt-in injection", async () => {
    const calls: unknown[] = []
    const result = await deliverDecision({
      session: { prompt: async (input: unknown) => { calls.push(input) } },
      app: { log: async () => undefined },
    }, decision, { ...loadConfig(), mode: "inject", experimentalInject: true })

    expect(result.delivered).toBe(true)
    expect(calls).toEqual([{
      path: { id: "s" },
      body: {
        noReply: true,
        parts: [{ type: "text", text: "synthetic advisory", synthetic: true }],
      },
      throwOnError: true,
    }])
  })

  test("falls back to notify when injection is not explicitly enabled", async () => {
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
  test("defaults to non-model-facing notification mode", () => {
    expect(loadConfig({}, {}).mode).toBe("notify")
    expect(loadConfig({}, {}).experimentalInject).toBe(false)
  })

  test("clamps numeric options to safe bounds", () => {
    const config = loadConfig({ maxSessions: 0, maxObservations: 999999, cooldownMs: -1 }, {})
    expect(config.maxSessions).toBe(1)
    expect(config.maxObservations).toBe(2048)
    expect(config.cooldownMs).toBe(0)
    expect(DEFAULT_CONFIG.maxSessions).toBe(64)
  })
})
