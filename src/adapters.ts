import type { DeliveryResult, InterventionDecision, Mode, WingmanConfig } from "./types"

type OpenCodeClient = {
  tui?: { showToast?: (args: unknown) => Promise<unknown> }
  session?: { prompt?: (args: unknown) => Promise<unknown> }
  app?: { log?: (args: unknown) => Promise<unknown> }
}

export async function deliverDecision(clientInput: unknown, decision: InterventionDecision, config: WingmanConfig): Promise<DeliveryResult> {
  const client = clientInput as OpenCodeClient
  if (config.mode === "shadow") return logOnly(client, decision, "shadow")
  if (config.mode === "notify") return notify(client, decision)
  if (config.mode === "inject" && config.experimentalInject) return injectOrFallback(client, decision)
  return notify(client, decision, true)
}

async function logOnly(client: OpenCodeClient, decision: InterventionDecision, mode: Mode): Promise<DeliveryResult> {
  try {
    await client.app?.log?.({ body: { service: "agent-wingman", level: "info", message: decision.notice } })
  } catch {}
  return { delivered: true, mode, fallbackUsed: false }
}

async function notify(client: OpenCodeClient, decision: InterventionDecision, fallbackUsed = false): Promise<DeliveryResult> {
  try {
    await client.tui?.showToast?.({ message: decision.notice, variant: "warning", duration: 6000 })
    return { delivered: true, mode: "notify", fallbackUsed }
  } catch (error) {
    await logOnly(client, decision, "notify")
    return { delivered: false, mode: "notify", fallbackUsed: true, error: String(error) }
  }
}

async function injectOrFallback(client: OpenCodeClient, decision: InterventionDecision): Promise<DeliveryResult> {
  try {
    await client.session?.prompt?.({ path: { id: decision.sessionID }, body: { prompt: decision.message, noReply: true } })
    return { delivered: true, mode: "inject", fallbackUsed: false }
  } catch (error) {
    const result = await notify(client, decision, true)
    return { ...result, error: String(error) }
  }
}
