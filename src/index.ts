import { ContextAdvisories, deliverDecision, logDiagnostic } from "./adapters"
import { loadConfig } from "./config"
import { WingmanEngine } from "./engine"
import { redactSensitive } from "./fingerprint"
import { asRecord, OpenCodeEventAdapter } from "./opencode"
import type { RawTraceEvent } from "./types"
import {UserMessageAdvisories} from "./user-messages";

export type { RawTraceEvent, ReplayResult, WingmanConfig } from "./types"

/**
 * The stable OpenCode plugin contract used by Agent Wingman.
 *
 * These structural types intentionally live in this package instead of leaking
 * one host SDK release into the public declarations. OpenCode
 * supplies the concrete client at runtime and the adapter feature-detects every
 * surface it uses.
 */
export interface OpenCodePluginContext {
  client: unknown
  [key: string]: unknown
}

export interface OpenCodeHookSet {
  event?: (input: unknown) => Promise<void>
  "chat.message"?: (input: unknown, output: unknown) => Promise<void>
  "tool.execute.after"?: (input: unknown, output: unknown) => Promise<void>
  "experimental.chat.messages.transform"?: (input: unknown, output: unknown) => Promise<void>
  "experimental.session.compacting"?: (input: unknown, output: unknown) => Promise<void>
}

export type OpenCodePlugin = (
  input: OpenCodePluginContext,
  options?: Record<string, unknown>,
) => Promise<OpenCodeHookSet>

export interface OpenCodePluginModule {
  id: string
  server: OpenCodePlugin
}

export type OpenCodeCallablePluginModule = OpenCodePlugin & OpenCodePluginModule

const AgentWingmanPlugin: OpenCodePlugin = async (input, options): Promise<OpenCodeHookSet> => {
  const config = loadConfig(options)
  const engine = new WingmanEngine(config)
  const context = new ContextAdvisories(config, sessionID => engine.deleteSession(sessionID));
  const visible = new UserMessageAdvisories(input.client);
  const eventAdapter = new OpenCodeEventAdapter(config.maxSessions * config.maxObservations)

  await logDiagnostic(input.client, "info", "agent-wingman initialized", {
    mode: config.mode,
    injectionEnabled: config.mode === "inject" && config.experimentalInject,
    injectionTransport: "user-message",
  })

  const observe = async (raw: RawTraceEvent): Promise<void> => {
    try {
      const decision = engine.observe(raw)
      if (decision) await deliverDecision(input.client, decision, config, context)
    } catch (error) {
      await logDiagnostic(input.client, "warn", "fail-open detector error", { error: redactSensitive(error) })
    }
  }

  return {
    'chat.message': async (input, output) => { visible.preserveContext(input, output); },
    'experimental.session.compacting': async (input) => {
      const sessionID = asRecord(input)?.sessionID;
      if (typeof sessionID === 'string') context.markCompaction(sessionID);
    },
    'experimental.chat.messages.transform': async (_input, output) => {
      try {
        const inserted = await visible.apply(output, context);
        if (inserted > 0) {
          await logDiagnostic(input.client, 'info', 'advisory included in current model request', {count: inserted});
        }
      } catch (error) {
        await logDiagnostic(input.client, 'warn', 'fail-open context injection error', {error: redactSensitive(error)});
      }
    },
    "tool.execute.after": async (toolInput, output) => {
      const raw = eventAdapter.fromToolAfter(toolInput, output)
      if (raw) await observe(raw)
    },
    event: async (hookInput) => {
      try {
        const event = readHookEvent(hookInput)
        const deletedSessionID = eventAdapter.deletedSessionID(event)
        if (deletedSessionID) {
          context.clearSession(deletedSessionID);
          engine.deleteSession(deletedSessionID)
          eventAdapter.clearSession(deletedSessionID)
          return
        }
        const changedRoot = context.noteUserMessage(asRecord(asRecord(event)?.properties)?.info);
        if (changedRoot) engine.deleteSession(changedRoot);
        const state = readSessionState(event);
        if (state) context.clearSession(state);
        for (const raw of eventAdapter.fromEvent(event)) await observe(raw)
      } catch (error) {
        await logDiagnostic(input.client, "warn", "fail-open event adapter error", { error: redactSensitive(error) })
      }
    },
  }
}

const pluginModule = Object.assign(AgentWingmanPlugin, {
  id: "agent-wingman",
  server: AgentWingmanPlugin,
}) satisfies OpenCodeCallablePluginModule

export default pluginModule

function readHookEvent(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return undefined
  return (input as Record<string, unknown>).event
}

function readSessionState(event: unknown): string | undefined {
  const record = asRecord(event);
  const properties = asRecord(record?.properties);
  const status = asRecord(properties?.status);
  const idle = record?.type === 'session.idle'
    || (record?.type === 'session.status' && status?.type === 'idle');
  return idle && typeof properties?.sessionID === 'string'
    ? properties.sessionID : undefined;
}
