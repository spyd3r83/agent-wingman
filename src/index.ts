import { deliverDecision, logDiagnostic } from "./adapters"
import { loadConfig } from "./config"
import { WingmanEngine } from "./engine"
import { redactSensitive } from "./fingerprint"
import { OpenCodeEventAdapter } from "./opencode"
import type { RawTraceEvent } from "./types"

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
  "tool.execute.after"?: (input: unknown, output: unknown) => Promise<void>
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
  const eventAdapter = new OpenCodeEventAdapter(config.maxSessions * config.maxObservations)

  await logDiagnostic(input.client, "info", "agent-wingman initialized", {
    mode: config.mode,
    injectionEnabled: config.mode === "inject" && config.experimentalInject,
  })

  const observe = async (raw: RawTraceEvent): Promise<void> => {
    try {
      const decision = engine.observe(raw)
      if (decision) await deliverDecision(input.client, decision, config)
    } catch (error) {
      await logDiagnostic(input.client, "warn", "fail-open detector error", { error: redactSensitive(error) })
    }
  }

  return {
    "tool.execute.after": async (toolInput, output) => {
      const raw = eventAdapter.fromToolAfter(toolInput, output)
      if (raw) await observe(raw)
    },
    event: async (hookInput) => {
      try {
        const event = readHookEvent(hookInput)
        const deletedSessionID = eventAdapter.deletedSessionID(event)
        if (deletedSessionID) {
          engine.deleteSession(deletedSessionID)
          eventAdapter.clearSession(deletedSessionID)
          return
        }
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
