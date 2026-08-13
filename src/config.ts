import type { Mode, WingmanConfig } from "./types"

export const DEFAULT_CONFIG: WingmanConfig = {
  enabled: true,
  mode: "notify",
  maxSessions: 64,
  maxObservations: 128,
  maxEpisodesPerSession: 64,
  threshold: 8,
  minRelevantActions: 8,
  cooldownMs: 5 * 60 * 1000,
  maxInterventionsPerEpisode: 2,
  maxInterventionsPerWindow: 2,
  interventionWindowMs: 30 * 60 * 1000,
  experimentalInject: false,
}

export function loadConfig(options: Record<string, unknown> = {}, env = process.env): WingmanConfig {
  return {
    ...DEFAULT_CONFIG,
    enabled: readBool(options.enabled ?? env.AGENT_WINGMAN_ENABLED, DEFAULT_CONFIG.enabled),
    mode: readMode(options.mode ?? env.AGENT_WINGMAN_MODE),
    maxSessions: readBoundedInt(options.maxSessions, DEFAULT_CONFIG.maxSessions, 1, 1024),
    maxObservations: readBoundedInt(options.maxObservations, DEFAULT_CONFIG.maxObservations, 16, 2048),
    maxEpisodesPerSession: readBoundedInt(options.maxEpisodesPerSession, DEFAULT_CONFIG.maxEpisodesPerSession, 8, 1024),
    threshold: readBoundedInt(options.threshold, DEFAULT_CONFIG.threshold, 1, 100),
    minRelevantActions: readBoundedInt(options.minRelevantActions, DEFAULT_CONFIG.minRelevantActions, 1, 100),
    cooldownMs: readBoundedInt(options.cooldownMs, DEFAULT_CONFIG.cooldownMs, 0, 24 * 60 * 60 * 1000),
    maxInterventionsPerEpisode: readBoundedInt(options.maxInterventionsPerEpisode, DEFAULT_CONFIG.maxInterventionsPerEpisode, 1, 20),
    maxInterventionsPerWindow: readBoundedInt(options.maxInterventionsPerWindow, DEFAULT_CONFIG.maxInterventionsPerWindow, 1, 100),
    interventionWindowMs: readBoundedInt(options.interventionWindowMs, DEFAULT_CONFIG.interventionWindowMs, 1000, 24 * 60 * 60 * 1000),
    experimentalInject: readBool(
      options.experimentalInject ?? env.AGENT_WINGMAN_EXPERIMENTAL_INJECT,
      DEFAULT_CONFIG.experimentalInject,
    ),
  }
}

function readMode(value: unknown): Mode {
  return value === "notify" || value === "inject" || value === "shadow" ? value : DEFAULT_CONFIG.mode
}

function readBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback
  if (value === true || value === "1" || value === "true") return true
  if (value === false || value === "0" || value === "false") return false
  return fallback
}

function readBoundedInt(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}
