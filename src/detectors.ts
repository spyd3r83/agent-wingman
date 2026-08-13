import { recent } from "./state"
import type { Detection, NormalizedEvent, SessionState } from "./types"

export function detect(event: NormalizedEvent, state: SessionState): Detection[] {
  if (event.selfOriginated) return []
  return [
    exactFailedAction(state),
    failureRecurrence(state),
    readOrResearchChurn(state),
    zeroProductiveDelta(state),
    highErrorDensity(state),
    planRestatementSimilarity(state),
    consultationChurn(state),
    successfulResolution(event, state),
    meaningfulChange(event),
    newEvidence(event, state),
  ].filter((item): item is Detection => item !== undefined)
}

function exactFailedAction(state: SessionState): Detection | undefined {
  const failed = recent(state, 8).filter((event) => event.success === false)
  const key = countKey(failed, (event) => `${event.actionFingerprint}:${event.outcomeFingerprint}`)
  if (!key || key.count < 3) return undefined
  return make("exact_failed_action_recurrence", 4, key.value, "Same action and failure recurred three times.", { count: key.count })
}

function failureRecurrence(state: SessionState): Detection | undefined {
  const failed = recent(state, 12).filter((event) => event.success === false && event.errorClass)
  const key = countKey(failed, (event) => `${event.toolClass}:${event.errorClass}`)
  if (!key || key.count < 3) return undefined
  return make("failure_recurrence", 3, key.value, "Same failure class recurred across an action family.", { count: key.count })
}

function readOrResearchChurn(state: SessionState): Detection | undefined {
  const reads = recent(state, 12).filter((event) => event.toolClass === "read" || event.toolClass === "search")
  const key = countKey(reads, (event) => event.resourceFingerprints[0] ?? event.actionFingerprint)
  if (!key || key.count < 4) return undefined
  return make("read_or_research_churn", 2, key.value, "Same resource or query group was revisited repeatedly.", { count: key.count })
}

function zeroProductiveDelta(state: SessionState): Detection | undefined {
  const window = recent(state, 8)
  if (window.length < 8 || window.some((event) => event.productive)) return undefined
  return make("zero_productive_delta", 2, "stagnation", "Eight relevant operations produced no progress marker.", { count: 8 })
}

function highErrorDensity(state: SessionState): Detection | undefined {
  const window = recent(state, 8)
  const failures = window.filter((event) => event.success === false).length
  if (failures < 5) return undefined
  return make("high_error_density", 2, "error-density", "At least five of the last eight operations failed.", { failures })
}

function planRestatementSimilarity(state: SessionState): Detection | undefined {
  const messages = recent(state, 8).filter((event) => event.kind === "message")
  const key = countKey(messages, (event) => event.actionFingerprint)
  if (!key || key.count < 3) return undefined
  return make("plan_restatement_similarity", 1, key.value, "Planning text repeated without observable action.", { count: key.count })
}

function consultationChurn(state: SessionState): Detection | undefined {
  const consultations = recent(state, 10).filter((event) => event.toolClass === "consultation")
  const key = countKey(consultations, (event) => event.actionFingerprint)
  const edited = recent(state, 10).some((event) => event.toolClass === "edit" && event.success !== false)
  if (!key || key.count < 3 || edited) return undefined
  return make("consultation_churn", 2, key.value, "Consultation repeated without implementation or changed hypothesis.", { count: key.count })
}

function successfulResolution(event: NormalizedEvent, state: SessionState): Detection | undefined {
  if (event.success !== true) return undefined
  const failedBefore = state.observations.some((past) => past.actionFingerprint === event.actionFingerprint && past.success === false)
  if (!failedBefore) return undefined
  return make("successful_resolution", -5, event.actionFingerprint, "A previously failing action succeeded.", { resolved: true })
}

function meaningfulChange(event: NormalizedEvent): Detection | undefined {
  if (event.toolClass !== "edit" || event.success === false) return undefined
  return make("meaningful_change", -2, event.actionFingerprint, "An edit changed the apparent work area.", { changed: true })
}

function newEvidence(event: NormalizedEvent, state: SessionState): Detection | undefined {
  const knownOutcome = event.outcomeFingerprint && state.observations.some((past) => past.outcomeFingerprint === event.outcomeFingerprint)
  if (event.success === false || knownOutcome) return undefined
  return make("new_evidence", -2, event.actionFingerprint, "A new result or resource appeared.", { new: true })
}

function make(kind: Detection["kind"], score: number, key: string, explanation: string, evidence: Detection["evidence"]): Detection {
  return { kind, score, episodeKey: `${kind}:${key}`, explanation, evidence }
}

function countKey<T>(items: T[], select: (item: T) => string): { value: string; count: number } | undefined {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = select(item)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([value, count]) => ({ value, count }))[0]
}
