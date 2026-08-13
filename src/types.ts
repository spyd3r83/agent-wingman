export type Mode = "shadow" | "notify" | "inject"

export type EventKind = "tool" | "message" | "session" | "consultation"

export type ToolClass = "shell" | "read" | "search" | "edit" | "consultation" | "other"

export type DetectionKind =
  | "exact_failed_action_recurrence"
  | "failure_recurrence"
  | "read_or_research_churn"
  | "zero_productive_delta"
  | "high_error_density"
  | "plan_restatement_similarity"
  | "consultation_churn"
  | "successful_resolution"
  | "meaningful_change"
  | "new_evidence"

export interface WingmanConfig {
  enabled: boolean
  mode: Mode
  maxObservations: number
  threshold: number
  minRelevantActions: number
  cooldownMs: number
  maxInterventionsPerWindow: number
  interventionWindowMs: number
  ignoredAdvisoryLimit: number
  experimentalInject: boolean
  supportedOpenCodeVersion: string
}

export interface RawTraceEvent {
  kind: EventKind
  sessionID?: string
  tool?: string
  callID?: string
  args?: unknown
  output?: unknown
  success?: boolean
  message?: string
  timestamp?: number
  source?: string
}

export interface NormalizedEvent {
  kind: EventKind
  sessionID: string
  sequence: number
  toolClass: ToolClass
  actionFingerprint: string
  outcomeFingerprint?: string | undefined
  resourceFingerprints: string[]
  errorClass?: string | undefined
  success?: boolean | undefined
  productive: boolean
  selfOriginated: boolean
  timestamp: number
  summary: string
}

export interface Detection {
  kind: DetectionKind
  score: number
  episodeKey: string
  explanation: string
  evidence: Record<string, number | string | boolean>
}

export interface EpisodeState {
  key: string
  score: number
  lastUpdated: number
  interventionCount: number
  ignoredCount: number
  lastInterventionAt?: number | undefined
}

export interface SessionState {
  sessionID: string
  sequence: number
  observations: NormalizedEvent[]
  episodes: Map<string, EpisodeState>
  interventionTimes: number[]
  selfFingerprints: Set<string>
}

export interface InterventionDecision {
  sessionID: string
  episodeKey: string
  score: number
  confidence: "eligible" | "high"
  detections: Detection[]
  message: string
  notice: string
  timestamp: number
}

export interface DeliveryResult {
  delivered: boolean
  mode: Mode
  fallbackUsed: boolean
  error?: string | undefined
}

export interface ReplayResult {
  file: string
  expected: boolean
  fired: boolean
  interventions: number
  falsePositive: boolean
  falseNegative: boolean
}
