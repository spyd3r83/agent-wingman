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

  const episode = session.episodes.get(key) ?? { key, score: 0, lastUpdated: now, interventionCount: 0 }
  episode.score = Math.max(0, episode.score * decayFactor(episode.lastUpdated, now) + detections.reduce((sum, item) => sum + item.score, 0))
  episode.lastUpdated = now
  touchEpisode(session, episode, config.maxEpisodesPerSession)

  if (episode.score < config.threshold) return undefined
  if (episode.interventionCount >= config.maxInterventionsPerEpisode) return undefined
  if (!withinWindow(session, config, now)) return undefined
  if (episode.lastInterventionAt !== undefined && now - episode.lastInterventionAt < config.cooldownMs) return undefined

  episode.interventionCount += 1
  episode.lastInterventionAt = now
  session.interventionTimes.push(now)
  session.interventionTimes = session.interventionTimes.filter((time) => now - time <= config.interventionWindowMs)

  const message = buildMessage()
  return {
    sessionID: session.sessionID,
    episodeKey: key,
    score: episode.score,
    confidence: episode.score >= 11 ? "high" : "eligible",
    detections: positives,
    message,
    notice: `Detected ${positives.length} struggle signal(s); score ${episode.score.toFixed(1)}.`,
    timestamp: now,
  }
}

function dominantEpisodeKey(detections: Detection[]): string | undefined {
  return [...detections].sort((left, right) => right.score - left.score)[0]?.episodeKey
}

function decayFactor(last: number, now: number): number {
  return now - last > 10 * 60 * 1000 ? 0 : 1
}

function withinWindow(session: SessionState, config: WingmanConfig, now: number): boolean {
  const count = session.interventionTimes.filter((time) => now - time <= config.interventionWindowMs).length
  return count < config.maxInterventionsPerWindow
}

function touchEpisode(session: SessionState, episode: SessionState["episodes"] extends Map<string, infer T> ? T : never, limit: number): void {
  session.episodes.delete(episode.key)
  session.episodes.set(episode.key, episode)
  while (session.episodes.size > limit) {
    const oldest = session.episodes.keys().next().value as string | undefined
    if (oldest === undefined) break
    session.episodes.delete(oldest)
  }
}

function buildMessage(): string {
  return `${SYNTHETIC_PREFIX} `
    + "The current approach appears repetitive and lacks sufficient new evidence. "
    + "Pause to consolidate what is known, then examine relevant context beyond "
    + "your existing knowledge by consulting external sources, official "
    + "documentation, standards or tools. "
    + "Develop an alternative hypothesis and assess it using a significantly "
    + "different method before proceeding with the work. "
    + "Don't end your turn now, continue."
}
