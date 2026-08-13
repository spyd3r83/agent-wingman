import { redactSensitive } from "./fingerprint"
import type { DeliveryResult, InterventionDecision, Mode, WingmanConfig } from "./types"

type OpenCodeClient = {
  tui?: {
    showToast?: (args: {
      body: { title: string; message: string; variant: "warning"; duration: number }
      throwOnError: true
    }) => Promise<unknown>
  }
  session?: {
    prompt?: (args: {
      path: { id: string }
      body: { noReply: true; parts: Array<{ type: "text"; text: string; synthetic: true }> }
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
): Promise<DeliveryResult> {
  const client = clientInput as OpenCodeClient
  if (config.mode === "shadow") return logOnly(client, decision, "shadow")
  if (config.mode === "notify") return notify(client, decision)
  if (config.mode === "inject" && config.experimentalInject) return injectOrFallback(client, decision)
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

async function injectOrFallback(client: OpenCodeClient, decision: InterventionDecision): Promise<DeliveryResult> {
  if (!client.session?.prompt) return notify(client, decision, true)
  try {
    await client.session.prompt({
      path: { id: decision.sessionID },
      body: {
        noReply: true,
        parts: [{ type: "text", text: decision.message, synthetic: true }],
      },
      throwOnError: true,
    })
    await logOnly(client, decision, "inject")
    return { delivered: true, mode: "inject", fallbackUsed: false }
  } catch (error) {
    const result = await notify(client, decision, true)
    return { ...result, error: redactSensitive(error) }
  }
}
