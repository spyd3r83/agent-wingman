import { describe, expect, test } from "bun:test"
import { deliverDecision } from "../src/adapters"
import { loadConfig } from "../src/config"
import { WingmanEngine } from "../src/engine"
import { redactSensitive } from "../src/fingerprint"

describe("WingmanEngine", () => {
  test("fires on repeated failing action", () => {
    const engine = new WingmanEngine({ ...loadConfig(), minRelevantActions: 1, cooldownMs: 0 })
    let fired = false
    for (let index = 0; index < 5; index += 1) {
      fired ||= Boolean(engine.observe({ kind: "tool", sessionID: "s", tool: "bash", args: { command: "bun test" }, output: "Error: test failed", success: false }))
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

  test("redacts common secret shapes before fingerprint material is logged", () => {
    expect(redactSensitive("token=ghp_1234567890abcdef PASSWORD=hunter2 sk-abcdefghijklmno")).not.toContain("hunter2")
  })

  test("disabled injection falls back to notify", async () => {
    const calls: unknown[] = []
    const result = await deliverDecision({ tui: { showToast: async (input: unknown) => { calls.push(input) } } }, {
      sessionID: "s",
      episodeKey: "k",
      score: 8,
      confidence: "eligible",
      detections: [],
      message: "synthetic",
      notice: "notice",
      timestamp: Date.now(),
    }, { ...loadConfig(), mode: "inject", experimentalInject: false })
    expect(result.mode).toBe("notify")
    expect(result.fallbackUsed).toBe(true)
    expect(calls.length).toBe(1)
  })
})
