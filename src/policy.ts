import { SYNTHETIC_PREFIX } from "./normalizer"
import type { Detection, InterventionDecision, SessionState, WingmanConfig } from "./types"

const NEGATIVE = new Set(["successful_resolution", "meaningful_change", "new_evidence"])

export function evaluatePolicy(
  session: SessionState,
  detections: Detection[],
  config: WingmanConfig,
  now = Date.now(),
): InterventionDecision | undefined {
  if (!config.enabled || session.observations.length < config.minRelevantActions) return undefined
  const positives = detections.filter((item) => !NEGATIVE.has(item.kind))
  const repetition = positives.some((item) => item.kind.includes("recurrence") || item.kind.includes("churn") || item.kind.includes("similarity"))
  if (!repetition) return undefined
  const key = dominantEpisodeKey(positives)
  if (!key) return undefined
  const episode = session.episodes.get(key) ?? { key, score: 0, lastUpdated: now, interventionCount: 0, ignoredCount: 0 }
  episode.score = Math.max(0, episode.score * decayFactor(episode.lastUpdated, now) + detections.reduce((sum, item) => sum + item.score, 0))
  episode.lastUpdated = now
  session.episodes.set(key, episode)
  if (episode.score < config.threshold || !withinWindow(session, config, now)) return undefined
  if (episode.ignoredCount >= config.ignoredAdvisoryLimit) return undefined
  if (episode.lastInterventionAt && now - episode.lastInterventionAt < config.cooldownMs) return undefined
  episode.interventionCount += 1
  episode.lastInterventionAt = now
  session.interventionTimes.push(now)
  session.interventionTimes = session.interventionTimes.filter((time) => now - time <= config.interventionWindowMs)
  const message = buildMessage(positives)
  return {
    sessionID: session.sessionID,
    episodeKey: key,
    score: episode.score,
    confidence: episode.score >= 11 ? "high" : "eligible",
    detections: positives,
    message,
    notice: `Agent Wingman detected ${positives.length} struggle signal(s), score ${episode.score.toFixed(1)}.`,
    timestamp: now,
  }
}

function dominantEpisodeKey(detections: Detection[]): string | undefined {
  return detections.sort((a, b) => b.score - a.score)[0]?.episodeKey
}

function decayFactor(last: number, now: number): number {
  return now - last > 10 * 60 * 1000 ? 0 : 1
}

function withinWindow(session: SessionState, config: WingmanConfig, now: number): boolean {
  const count = session.interventionTimes.filter((time) => now - time <= config.interventionWindowMs).length
  return count < config.maxInterventionsPerWindow
}

function buildMessage(detections: Detection[]): string {
  const dominant = detections.sort((a, b) => b.score - a.score)[0]
  const advice = dominant?.kind === "read_or_research_churn"
    ? "Summarize what is already known, identify the missing fact, and use a different source or path."
    : dominant?.kind === "consultation_churn"
      ? "Consolidate the advice already received before consulting again."
      : dominant?.kind === "plan_restatement_similarity"
        ? "Convert the current evidence into one concrete next action before revising the plan."
        : "Do not retry unchanged. State a different hypothesis and test one materially different approach."
  return `${SYNTHETIC_PREFIX} ${advice}`
}
