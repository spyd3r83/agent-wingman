import { classifyTool, normalizeForHash, safeStringify, stableFingerprint } from "./fingerprint"
import type { NormalizedEvent, RawTraceEvent, SessionState } from "./types"

export const SYNTHETIC_PREFIX = "[Agent Wingman advisory — synthetic, not user-authored]"

export function normalizeEvent(raw: RawTraceEvent, state: SessionState): NormalizedEvent {
  const sequence = ++state.sequence
  const sessionID = raw.sessionID ?? state.sessionID
  const toolClass = raw.kind === "tool"
    ? classifyTool(raw.tool ?? "")
    : raw.kind === "consultation"
      ? "consultation"
      : "other"
  const selfOriginated = isSelfOriginated(raw)
  const actionMaterial = raw.kind === "message" ? raw.message : { tool: raw.tool, args: raw.args, source: raw.source }
  const outputText = raw.output === undefined ? undefined : safeStringify(raw.output)
  const success = raw.success ?? inferSuccess(outputText)
  const actionFingerprint = stableFingerprint(actionMaterial, "action")
  const outcomeFingerprint = raw.output === undefined ? undefined : stableFingerprint(outputText, "outcome")
  const errorClass = success === false ? classifyError(outputText ?? "failure") : undefined
  const resources = resourceFingerprints(raw)
  const productive = isProductive(toolClass, success, raw, resources, state)
  return {
    kind: raw.kind,
    sessionID,
    sequence,
    toolClass,
    actionFingerprint,
    outcomeFingerprint,
    resourceFingerprints: resources,
    errorClass,
    success,
    productive,
    selfOriginated,
    timestamp: raw.timestamp ?? Date.now(),
    summary: makeSummary(raw, toolClass, success),
  }
}

function inferSuccess(output?: string): boolean | undefined {
  if (!output) return undefined
  const normalized = normalizeForHash(output)
  if (/\b(error|failed|exception|not found)\b|exit code [1-9]/.test(normalized) && !/\b0 (errors|failures)\b/.test(normalized)) return false
  if (/\b(pass|passed|success|successful|ok|completed)\b/.test(normalized)) return true
  return undefined
}

function classifyError(output: string): string {
  const normalized = normalizeForHash(output)
  if (normalized.includes("not found")) return "not_found"
  if (normalized.includes("permission")) return "permission"
  if (normalized.includes("timeout")) return "timeout"
  if (normalized.includes("typeerror") || /\bts<num>\b/.test(normalized)) return "typecheck"
  return stableFingerprint(normalized.slice(0, 160), "error")
}

function resourceFingerprints(raw: RawTraceEvent): string[] {
  const text = safeStringify(raw.args ?? raw.message ?? "")
  const matches = text.match(/[\w./\\-]+\.(ts|tsx|js|mjs|cjs|json|md|py|go|rs|yml|yaml)/gi) ?? []
  return [...new Set(matches.slice(0, 8).map((item) => stableFingerprint(item, "resource")))]
}

function isProductive(
  toolClass: string,
  success: boolean | undefined,
  raw: RawTraceEvent,
  resources: string[],
  state: SessionState,
): boolean {
  if (toolClass === "edit" && success !== false) return true
  if (success === true) return true
  if (resources.some((resource) => !state.observations.some((event) => event.resourceFingerprints.includes(resource)))) return true
  if (raw.output !== undefined) {
    const outcome = stableFingerprint(raw.output, "outcome")
    if (!state.observations.some((event) => event.outcomeFingerprint === outcome)) return true
  }
  return false
}

function isSelfOriginated(raw: RawTraceEvent): boolean {
  return safeStringify(raw.message ?? raw.output ?? raw.source ?? "").includes(SYNTHETIC_PREFIX)
}

function makeSummary(raw: RawTraceEvent, toolClass: string, success?: boolean): string {
  const status = success === undefined ? "unknown" : success ? "success" : "failure"
  return `${raw.kind}:${toolClass}:${status}`
}
