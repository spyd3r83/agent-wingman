import type { Hooks } from "@opencode-ai/plugin"
import type { RawTraceEvent } from "./types"

type OpenCodeEvent = Parameters<NonNullable<Hooks["event"]>>[0]["event"]
type ToolAfterInput = Parameters<NonNullable<Hooks["tool.execute.after"]>>[0]
type ToolAfterOutput = Parameters<NonNullable<Hooks["tool.execute.after"]>>[1]

export class OpenCodeEventAdapter {
  private readonly messageRoles = new Map<string, MessageIdentity>()
  private readonly seenTerminalEvents: BoundedSet
  private readonly maxMessageRoles: number

  constructor(maxTrackedEvents: number) {
    const bounded = Math.min(8192, Math.max(128, maxTrackedEvents))
    this.maxMessageRoles = bounded
    this.seenTerminalEvents = new BoundedSet(bounded)
  }

  fromToolAfter(input: ToolAfterInput, output: ToolAfterOutput): RawTraceEvent | undefined {
    if (!this.seenTerminalEvents.add(`tool:${input.sessionID}:${input.callID}`)) return undefined
    const success = successFromMetadata(output.metadata)
    return {
      kind: "tool",
      sessionID: input.sessionID,
      tool: input.tool,
      callID: input.callID,
      args: input.args,
      output: output.output,
      ...(success === undefined ? {} : { success }),
      timestamp: Date.now(),
      source: "tool.execute.after",
    }
  }

  fromEvent(event: OpenCodeEvent): RawTraceEvent[] {
    if (event.type === "message.updated") {
      this.rememberMessageRole(
        event.properties.info.id,
        event.properties.info.sessionID,
        event.properties.info.role,
      )
      return []
    }

    if (event.type === "message.removed") {
      this.messageRoles.delete(event.properties.messageID)
      return []
    }

    if (event.type === "message.part.updated") {
      const part = event.properties.part
      if (part.type === "tool" && (part.state.status === "completed" || part.state.status === "error")) {
        const key = `tool:${part.sessionID}:${part.callID}`
        if (!this.seenTerminalEvents.add(key)) return []
        if (part.state.status === "error") {
          return [{
            kind: "tool",
            sessionID: part.sessionID,
            tool: part.tool,
            callID: part.callID,
            args: part.state.input,
            output: part.state.error,
            success: false,
            timestamp: part.state.time.end,
            source: "message.part.updated",
          }]
        }
        const success = successFromMetadata(part.state.metadata)
        return [{
          kind: "tool",
          sessionID: part.sessionID,
          tool: part.tool,
          callID: part.callID,
          args: part.state.input,
          output: part.state.output,
          ...(success === undefined ? {} : { success }),
          timestamp: part.state.time.end,
          source: "message.part.updated",
        }]
      }

      if (
        part.type === "text"
        && this.messageRoles.get(part.messageID)?.role === "assistant"
        && part.time?.end !== undefined
        && !part.synthetic
        && !part.ignored
      ) {
        const key = `text:${part.sessionID}:${part.id}`
        if (!this.seenTerminalEvents.add(key)) return []
        return [{
          kind: "message",
          sessionID: part.sessionID,
          message: part.text,
          timestamp: part.time.end,
          source: "assistant",
        }]
      }
      return []
    }

    if (event.type === "session.error" && event.properties.sessionID) {
      return [{
        kind: "session",
        sessionID: event.properties.sessionID,
        output: event.properties.error ?? "session error",
        success: false,
        timestamp: Date.now(),
        source: "session.error",
      }]
    }

    return []
  }

  deletedSessionID(event: OpenCodeEvent): string | undefined {
    return event.type === "session.deleted" ? event.properties.info.id : undefined
  }

  clearSession(sessionID: string): void {
    for (const [messageID, identity] of this.messageRoles) {
      if (identity.sessionID === sessionID) this.messageRoles.delete(messageID)
    }
    this.seenTerminalEvents.deleteContaining(`:${sessionID}:`)
  }

  private rememberMessageRole(
    messageID: string,
    sessionID: string,
    role: "user" | "assistant",
  ): void {
    this.messageRoles.delete(messageID)
    this.messageRoles.set(messageID, { role, sessionID })
    while (this.messageRoles.size > this.maxMessageRoles) {
      const oldest = this.messageRoles.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.messageRoles.delete(oldest)
    }
  }
}

interface MessageIdentity {
  role: "user" | "assistant"
  sessionID: string
}

function successFromMetadata(metadata: unknown): boolean | undefined {
  if (typeof metadata !== "object" || metadata === null) return undefined
  const record = metadata as Record<string, unknown>
  const exitCode = record.exitCode ?? record.exit_code ?? record.code
  return typeof exitCode === "number" ? exitCode === 0 : undefined
}

class BoundedSet {
  private readonly entries = new Map<string, true>()

  constructor(private readonly limit: number) {}

  add(value: string): boolean {
    if (this.entries.has(value)) return false
    this.entries.set(value, true)
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
    return true
  }

  deleteContaining(fragment: string): void {
    for (const key of this.entries.keys()) if (key.includes(fragment)) this.entries.delete(key)
  }
}
