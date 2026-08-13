import type { NormalizedEvent, SessionState, WingmanConfig } from "./types"

export function createSessionState(sessionID: string): SessionState {
  return { sessionID, sequence: 0, observations: [], episodes: new Map(), interventionTimes: [], selfFingerprints: new Set() }
}

export function addObservation(state: SessionState, event: NormalizedEvent, config: WingmanConfig): void {
  if (event.selfOriginated) state.selfFingerprints.add(event.actionFingerprint)
  if (!event.selfOriginated) state.observations.push(event)
  while (state.observations.length > config.maxObservations) state.observations.shift()
}

export function recent(state: SessionState, count: number): NormalizedEvent[] {
  return state.observations.slice(Math.max(0, state.observations.length - count))
}
