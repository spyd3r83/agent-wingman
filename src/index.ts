import type { Hooks, Plugin, PluginModule } from "@opencode-ai/plugin"
import { deliverDecision, logDiagnostic } from "./adapters"
import { loadConfig } from "./config"
import { WingmanEngine } from "./engine"
import { redactSensitive } from "./fingerprint"
import { OpenCodeEventAdapter } from "./opencode"
import type { RawTraceEvent } from "./types"

export { WingmanEngine } from "./engine"
export { loadConfig } from "./config"
export { OpenCodeEventAdapter } from "./opencode"
export type { RawTraceEvent, ReplayResult, WingmanConfig } from "./types"

export const AgentWingmanPlugin: Plugin = async (input, options): Promise<Hooks> => {
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
    event: async ({ event }) => {
      try {
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

export const server = AgentWingmanPlugin

const pluginModule = { id: "agent-wingman", server } satisfies PluginModule

export default pluginModule
