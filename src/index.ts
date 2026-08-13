import type { Hooks, PluginInput, PluginOptions } from "@opencode-ai/plugin"
import { deliverDecision } from "./adapters"
import { loadConfig } from "./config"
import { WingmanEngine } from "./engine"

export { WingmanEngine } from "./engine"
export { loadConfig } from "./config"
export type { RawTraceEvent, ReplayResult, WingmanConfig } from "./types"

export async function server(input: PluginInput, options?: PluginOptions): Promise<Hooks> {
  const config = loadConfig(options)
  const engine = new WingmanEngine(config)
  return {
    "tool.execute.after": async (toolInput, output) => {
      try {
        const decision = engine.observe({
          kind: "tool",
          sessionID: toolInput.sessionID,
          tool: toolInput.tool,
          callID: toolInput.callID,
          args: toolInput.args,
          output: output.output,
          timestamp: Date.now(),
        })
        if (decision) await deliverDecision(input.client, decision, config)
      } catch (error) {
        await input.client.app.log({ body: { service: "agent-wingman", level: "warn", message: "fail-open detector error", extra: { error: String(error) } } })
      }
    },
    "chat.message": async (messageInput, output) => {
      try {
        const text = output.parts.map((part) => "text" in part ? String(part.text) : "").join(" ")
        const decision = engine.observe({ kind: "message", sessionID: messageInput.sessionID, message: text, timestamp: Date.now() })
        if (decision) await deliverDecision(input.client, decision, config)
      } catch (error) {
        await input.client.app.log({ body: { service: "agent-wingman", level: "warn", message: "fail-open message detector error", extra: { error: String(error) } } })
      }
    },
  }
}

export default { id: "agent-wingman", server }
