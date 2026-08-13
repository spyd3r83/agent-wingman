import { describe, expect, test } from "bun:test"
import { OpenCodeEventAdapter } from "../src/opencode"

describe("OpenCodeEventAdapter", () => {
  test("observes a terminal tool event once", () => {
    const adapter = new OpenCodeEventAdapter(128)
    const event = {
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-1",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          callID: "call-1",
          tool: "bash",
          state: {
            status: "error",
            input: { command: "bun test" },
            error: "exit code 1",
            time: { start: 1, end: 2 },
          },
        },
      },
    } as const
    expect(adapter.fromEvent(event as never)).toHaveLength(1)
    expect(adapter.fromEvent(event as never)).toHaveLength(0)
  })

  test("observes completed assistant text but not user or synthetic text", () => {
    const adapter = new OpenCodeEventAdapter(128)
    adapter.fromEvent({
      type: "message.updated",
      properties: { info: { id: "assistant-1", sessionID: "session-1", role: "assistant" } },
    })
    adapter.fromEvent({
      type: "message.updated",
      properties: { info: { id: "user-1", sessionID: "session-1", role: "user" } },
    })

    const part = {
      id: "part-1",
      sessionID: "session-1",
      messageID: "assistant-1",
      type: "text",
      text: "I will repeat the plan",
      time: { start: 1, end: 2 },
    } as const
    expect(adapter.fromEvent({ type: "message.part.updated", properties: { part } })).toHaveLength(1)
    expect(adapter.fromEvent({
      type: "message.part.updated",
      properties: { part: { ...part, id: "part-2", messageID: "user-1" } },
    })).toHaveLength(0)
    expect(adapter.fromEvent({
      type: "message.part.updated",
      properties: { part: { ...part, id: "part-3", synthetic: true } },
    })).toHaveLength(0)
  })

  test("deduplicates the after hook and terminal event paths", () => {
    const adapter = new OpenCodeEventAdapter(128)
    expect(adapter.fromToolAfter({
      tool: "bash",
      sessionID: "session-1",
      callID: "call-1",
      args: { command: "bun test" },
    }, { title: "bash", output: "failed", metadata: { exitCode: 1 } })).toBeDefined()
    expect(adapter.fromEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-1",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          callID: "call-1",
          tool: "bash",
          state: {
            status: "error",
            input: { command: "bun test" },
            error: "failed",
            time: { start: 1, end: 2 },
          },
        },
      },
    })).toHaveLength(0)
  })

  test("ignores unknown shapes and accepts the legacy deletion identity", () => {
    const adapter = new OpenCodeEventAdapter(128)
    expect(adapter.fromEvent(undefined)).toEqual([])
    expect(adapter.fromEvent({ type: "message.part.updated", properties: { part: { type: "tool" } } })).toEqual([])
    expect(adapter.fromToolAfter({ tool: "bash" }, {})).toBeUndefined()
    expect(adapter.deletedSessionID({
      type: "session.deleted",
      properties: { sessionID: "session-legacy" },
    })).toBe("session-legacy")
  })
})
