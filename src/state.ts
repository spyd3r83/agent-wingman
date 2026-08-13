import type { NormalizedEvent, SessionState, WingmanConfig } from "./types"

export function createSessionState(sessionID: string, now = Date.now()): SessionState {
  return { sessionID, sequence: 0, lastObservedAt: now, observations: [], episodes: new Map(), interventionTimes: [] }
}

export function addObservation(state: SessionState, event: NormalizedEvent, config: WingmanConfig): void {
  state.lastObservedAt = event.timestamp
  if (!event.selfOriginated) state.observations.push(event)
  while (state.observations.length > config.maxObservations) state.observations.shift()
}

export function recent(state: SessionState, count: number): NormalizedEvent[] {
  return state.observations.slice(Math.max(0, state.observations.length - count))
}
