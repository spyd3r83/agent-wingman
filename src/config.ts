import type { Mode, WingmanConfig } from "./types"

export const DEFAULT_CONFIG: WingmanConfig = {
  enabled: true,
  mode: "shadow",
  maxObservations: 128,
  threshold: 8,
  minRelevantActions: 8,
  cooldownMs: 5 * 60 * 1000,
  maxInterventionsPerWindow: 2,
  interventionWindowMs: 30 * 60 * 1000,
  ignoredAdvisoryLimit: 2,
  experimentalInject: false,
  supportedOpenCodeVersion: "1.3.5",
}

export function loadConfig(options: Record<string, unknown> = {}, env = process.env): WingmanConfig {
  const mode = readMode(options.mode ?? env.AGENT_WINGMAN_MODE)
  return {
    ...DEFAULT_CONFIG,
    enabled: readBool(options.enabled ?? env.AGENT_WINGMAN_ENABLED, true),
    mode,
    maxObservations: readInt(options.maxObservations, DEFAULT_CONFIG.maxObservations),
    threshold: readInt(options.threshold, DEFAULT_CONFIG.threshold),
    experimentalInject: readBool(options.experimentalInject ?? env.AGENT_WINGMAN_EXPERIMENTAL_INJECT, false),
  }
}

function readMode(value: unknown): Mode {
  return value === "notify" || value === "inject" || value === "shadow" ? value : "shadow"
}

function readBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback
  if (value === true || value === "1" || value === "true") return true
  if (value === false || value === "0" || value === "false") return false
  return fallback
}

function readInt(value: unknown, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}
