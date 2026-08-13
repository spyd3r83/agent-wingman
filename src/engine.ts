import { detect } from "./detectors"
import { normalizeEvent } from "./normalizer"
import { evaluatePolicy } from "./policy"
import { addObservation, createSessionState } from "./state"
import type { InterventionDecision, RawTraceEvent, SessionState, WingmanConfig } from "./types"

export class WingmanEngine {
  private readonly sessions = new Map<string, SessionState>()

  constructor(private readonly config: WingmanConfig) {}

  observe(raw: RawTraceEvent): InterventionDecision | undefined {
    const session = this.session(raw.sessionID ?? "default")
    const event = normalizeEvent(raw, session)
    const detections = detect(event, session)
    addObservation(session, event, this.config)
    return evaluatePolicy(session, detections, this.config, event.timestamp)
  }

  getState(sessionID = "default"): SessionState | undefined {
    return this.sessions.get(sessionID)
  }

  private session(sessionID: string): SessionState {
    const existing = this.sessions.get(sessionID)
    if (existing) return existing
    const created = createSessionState(sessionID)
    this.sessions.set(sessionID, created)
    return created
  }
}
