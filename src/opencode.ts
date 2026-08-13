import type { RawTraceEvent } from "./types"

export class OpenCodeEventAdapter {
  private readonly messageRoles = new Map<string, MessageIdentity>()
  private readonly seenTerminalEvents: BoundedSet
  private readonly maxMessageRoles: number

  constructor(maxTrackedEvents: number) {
    const bounded = Math.min(8192, Math.max(128, maxTrackedEvents))
    this.maxMessageRoles = bounded
    this.seenTerminalEvents = new BoundedSet(bounded)
  }

  fromToolAfter(input: unknown, output: unknown): RawTraceEvent | undefined {
    const inputRecord = asRecord(input)
    const outputRecord = asRecord(output)
    const sessionID = asString(inputRecord?.sessionID)
    const callID = asString(inputRecord?.callID)
    const tool = asString(inputRecord?.tool)
    if (!sessionID || !callID || !tool) return undefined
    if (!this.seenTerminalEvents.add(`tool:${sessionID}:${callID}`)) return undefined
    const success = successFromMetadata(outputRecord?.metadata)
    return {
      kind: "tool",
      sessionID,
      tool,
      callID,
      args: inputRecord?.args,
      output: outputRecord?.output,
      ...(success === undefined ? {} : { success }),
      timestamp: Date.now(),
      source: "tool.execute.after",
    }
  }

  fromEvent(eventInput: unknown): RawTraceEvent[] {
    const event = asRecord(eventInput)
    const type = asString(event?.type)
    const properties = asRecord(event?.properties)

    if (type === "message.updated") {
      const info = asRecord(properties?.info)
      const messageID = asString(info?.id)
      const sessionID = asString(info?.sessionID)
      const role = info?.role
      if (messageID && sessionID && (role === "user" || role === "assistant")) {
        this.rememberMessageRole(messageID, sessionID, role)
      }
      return []
    }

    if (type === "message.removed") {
      const messageID = asString(properties?.messageID)
      if (messageID) this.messageRoles.delete(messageID)
      return []
    }

    if (type === "message.part.updated") {
      const part = asRecord(properties?.part)
      const partType = asString(part?.type)
      const sessionID = asString(part?.sessionID)
      const messageID = asString(part?.messageID)
      const partID = asString(part?.id)

      if (partType === "tool") {
        const state = asRecord(part?.state)
        if (!state) return []
        const status = asString(state?.status)
        const callID = asString(part?.callID)
        const tool = asString(part?.tool)
        if (!sessionID || !callID || !tool || (status !== "completed" && status !== "error")) return []
        const key = `tool:${sessionID}:${callID}`
        if (!this.seenTerminalEvents.add(key)) return []
        const timestamp = terminalTimestamp(state)
        if (status === "error") {
          return [{
            kind: "tool",
            sessionID,
            tool,
            callID,
            args: state.input,
            output: state.error,
            success: false,
            timestamp,
            source: "message.part.updated",
          }]
        }
        const success = successFromMetadata(state.metadata)
        return [{
          kind: "tool",
          sessionID,
          tool,
          callID,
          args: state.input,
          output: state.output,
          ...(success === undefined ? {} : { success }),
          timestamp,
          source: "message.part.updated",
        }]
      }

      if (
        partType === "text"
        && sessionID
        && messageID
        && partID
        && typeof part?.text === "string"
        && this.messageRoles.get(messageID)?.role === "assistant"
        && terminalTimestamp(part, false) !== undefined
        && part.synthetic !== true
        && part.ignored !== true
      ) {
        const key = `text:${sessionID}:${partID}`
        if (!this.seenTerminalEvents.add(key)) return []
        return [{
          kind: "message",
          sessionID,
          message: part.text,
          timestamp: terminalTimestamp(part),
          source: "assistant",
        }]
      }
      return []
    }

    if (type === "session.error") {
      const sessionID = asString(properties?.sessionID)
      if (!sessionID) return []
      return [{
        kind: "session",
        sessionID,
        output: properties?.error ?? "session error",
        success: false,
        timestamp: Date.now(),
        source: "session.error",
      }]
    }

    return []
  }

  deletedSessionID(eventInput: unknown): string | undefined {
    const event = asRecord(eventInput)
    if (event?.type !== "session.deleted") return undefined
    const properties = asRecord(event.properties)
    const info = asRecord(properties?.info)
    return asString(info?.id) ?? asString(properties?.sessionID)
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
  const record = asRecord(metadata)
  if (!record) return undefined
  const exitCode = record.exitCode ?? record.exit_code ?? record.code
  return typeof exitCode === "number" ? exitCode === 0 : undefined
}

function terminalTimestamp(value: Record<string, unknown>, fallbackToNow?: true): number
function terminalTimestamp(value: Record<string, unknown>, fallbackToNow: false): number | undefined
function terminalTimestamp(value: Record<string, unknown>, fallbackToNow = true): number | undefined {
  const time = asRecord(value.time)
  const end = time?.end
  return typeof end === "number" && Number.isFinite(end) ? end : fallbackToNow ? Date.now() : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
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
