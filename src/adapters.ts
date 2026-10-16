import { randomUUID } from "crypto";
import { redactSensitive } from "./fingerprint"
import { asRecord } from "./opencode";
import type { DeliveryResult, InterventionDecision, Mode, WingmanConfig } from "./types"

type OpenCodeClient = {
  tui?: {
    showToast?: (args: {
      body: { title: string; message: string; variant: "warning"; duration: number }
      throwOnError: true
    }) => Promise<unknown>
  }
  app?: {
    log?: (args: {
      body: {
        service: string
        level: "debug" | "info" | "warn" | "error"
        message: string
        extra?: Record<string, unknown>
      }
      throwOnError?: true
    }) => Promise<unknown>
  }
}

export async function deliverDecision(
  clientInput: unknown,
  decision: InterventionDecision,
  config: WingmanConfig,
  context?: ContextAdvisories,
): Promise<DeliveryResult> {
  const client = clientInput as OpenCodeClient
  if (config.mode === "shadow") return logOnly(client, decision, "shadow")
  if (config.mode === "notify") return notify(client, decision)
  if (config.mode === "inject" && config.experimentalInject) return injectOrFallback(client, decision, context)
  return notify(client, decision, true)
}

export async function logDiagnostic(
  clientInput: unknown,
  level: "debug" | "info" | "warn" | "error",
  message: string,
  extra?: Record<string, unknown>,
): Promise<boolean> {
  const client = clientInput as OpenCodeClient
  if (!client.app?.log) return false
  try {
    await client.app.log({
      body: { service: "agent-wingman", level, message, ...(extra ? { extra } : {}) },
      throwOnError: true,
    })
    return true
  } catch {
    return false
  }
}

async function logOnly(client: OpenCodeClient, decision: InterventionDecision, mode: Mode): Promise<DeliveryResult> {
  const delivered = await logDiagnostic(client, "info", decision.notice, {
    episodeKey: decision.episodeKey,
    score: decision.score,
    confidence: decision.confidence,
    signals: decision.detections.map((detection) => detection.kind),
  })
  return { delivered, mode, fallbackUsed: false }
}

async function notify(client: OpenCodeClient, decision: InterventionDecision, fallbackUsed = false): Promise<DeliveryResult> {
  if (!client.tui?.showToast) {
    await logOnly(client, decision, "notify")
    return { delivered: false, mode: "notify", fallbackUsed: true, error: "TUI notification surface unavailable" }
  }
  try {
    await client.tui.showToast({
      body: {
        title: "Agent Wingman",
        message: decision.message,
        variant: "warning",
        duration: 9000,
      },
      throwOnError: true,
    })
    await logOnly(client, decision, "notify")
    return { delivered: true, mode: "notify", fallbackUsed }
  } catch (error) {
    await logOnly(client, decision, "notify")
    return {
      delivered: false,
      mode: "notify",
      fallbackUsed: true,
      error: redactSensitive(error),
    }
  }
}

async function injectOrFallback(
  client: OpenCodeClient,
  decision: InterventionDecision,
  context?: ContextAdvisories,
): Promise<DeliveryResult> {
  // Adding another user message can replace the active agent and execution context.
  if (!context) return notify(client, decision, true);
  try {
    if (!context.enqueue(decision)) return notify(client, decision, true);
    await logDiagnostic(client, 'info', 'advisory queued for model context');
    return {delivered: true, mode: 'inject', fallbackUsed: false};
  } catch (error) {
    const result = await notify(client, decision, true);
    return {...result, error: redactSensitive(error)};
  }
}

/** Holds bounded advisories until the next native model-context transformation. */
export class ContextAdvisories {
  private readonly pending = new Map<string, {root: string; decisions: InterventionDecision[]}>();
  private readonly roots = new Map<string, string>();
  private readonly compacting = new Set<string>();

  constructor(
    private readonly config: WingmanConfig,
    private readonly onRootChanged?: (sessionID: string) => void,
  ) {}

  enqueue(decision: InterventionDecision): boolean {
    const root = this.roots.get(decision.sessionID);
    if (!root) return false;
    const queued = this.pending.get(decision.sessionID)?.decisions ?? [];
    queued.push(decision);
    this.pending.delete(decision.sessionID);
    this.pending.set(decision.sessionID, {
      root,
      decisions: queued.slice(-this.config.maxInterventionsPerWindow),
    });
    while (this.pending.size > this.config.maxSessions) {
      const oldest = this.pending.keys().next().value;
      if (oldest === undefined) break;
      this.pending.delete(oldest);
    }
    return true;
  }

  isCurrent(info: Record<string, unknown>): boolean {
    return typeof info.sessionID === 'string'
      && this.roots.get(info.sessionID) === this.rootKey(info);
  }

  noteUserMessage(input: unknown): string | undefined {
    const info = asRecord(input);
    if (info?.role !== 'user' || typeof info.sessionID !== 'string') return undefined;
    const previous = this.roots.get(info.sessionID);
    const current = this.rootKey(info);
    if (!previous || previous === current) return undefined;
    this.clearSession(info.sessionID);
    return info.sessionID;
  }

  markCompaction(sessionID: string): void {
    this.compacting.delete(sessionID);
    this.compacting.add(sessionID);
    while (this.compacting.size > this.config.maxSessions) {
      const oldest = this.compacting.values().next().value;
      if (oldest === undefined) break;
      this.compacting.delete(oldest);
    }
  }

  clearSession(sessionID: string): void {
    this.pending.delete(sessionID);
    this.roots.delete(sessionID);
    this.compacting.delete(sessionID);
  }

  apply(output: unknown, now = Date.now()): number {
    const messages = asRecord(output)?.messages;
    if (!Array.isArray(messages)) return 0;
    const seen = new Set<string>();
    let inserted = 0;
    for (const raw of messages.slice().reverse()) {
      const message = asRecord(raw);
      const info = asRecord(message?.info);
      if (info?.role !== 'user' || typeof info.sessionID !== 'string') continue;
      if (seen.has(info.sessionID)) continue;
      seen.add(info.sessionID);
      if (this.compacting.delete(info.sessionID)) continue;
      inserted += this.append(message, info, now);
    }
    return inserted;
  }

  private append(
    message: Record<string, unknown> | undefined,
    info: Record<string, unknown>,
    now: number,
  ): number {
    const sessionID = info.sessionID as string;
    const queued = this.pending.get(sessionID);
    this.pending.delete(sessionID);
    const root = this.rootKey(info);
    if (!root || !Array.isArray(message?.parts)) return 0;
    this.rememberRoot(sessionID, root);
    if (queued?.root !== root) return 0;
    const current = queued.decisions.filter(
      decision => now - decision.timestamp <= this.config.interventionWindowMs,
    );
    for (const decision of current) {
      message.parts.push({
        id: 'prt_' + randomUUID().replaceAll('-', ''),
        sessionID,
        messageID: info.id,
        type: 'text',
        text: decision.message,
        synthetic: true,
      });
    }
    return current.length;
  }
  private rootKey(info: Record<string, unknown>): string | undefined {
    if (typeof info.id !== 'string') return undefined;
    const execution = asRecord(info.executionContext);
    return JSON.stringify([
      info.id, execution?.invocationID, execution?.runID, execution?.generation,
    ]);
  }

  private rememberRoot(sessionID: string, root: string): void {
    const changed = this.roots.get(sessionID) !== root;
    this.roots.delete(sessionID);
    this.roots.set(sessionID, root);
    // Old tools may finish after a new user event but before its model request.
    if (changed) this.onRootChanged?.(sessionID);
    while (this.roots.size > this.config.maxSessions) {
      const oldest = this.roots.keys().next().value;
      if (oldest === undefined) break;
      this.clearSession(oldest);
    }
  }

}
