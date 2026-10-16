# Architecture

Agent Wingman separates event ingestion, detection, policy, and delivery.

```text
OpenCode stable hooks and events
  -> deduplicating OpenCode adapter
  -> event normalizer and ephemeral HMAC fingerprints
  -> bounded per-session state
  -> deterministic detectors
  -> scoring, cooldown, and rate policy
  -> run-bound visible user-message delivery, notification-only, or shadow adapter
```

## Core modules

- `src/opencode.ts` converts terminal tool and assistant-text events into one deduplicated stream. The event path covers runtimes where `tool.execute.after` is unavailable or incomplete.
- `src/normalizer.ts` derives compact observations and progress markers.
- `src/fingerprint.ts` redacts likely secrets and creates process-local keyed fingerprints.
- `src/state.ts` keeps bounded observations.
- `src/detectors.ts` emits positive and negative struggle signals.
- `src/policy.ts` applies scoring, cooldown, per-episode caps, and rate limits.
- `src/adapters.ts` feature-detects OpenCode client surfaces for structured logs and TUI notifications. Its bounded advisory queue attaches fixed synthetic text to the next model-context transform for the same user-message ID and execution generation, with notification fallback when context is unknown. The queue is consumed by `src/user-messages.ts`, which persists a labelled user message and restores the original worker metadata in `chat.message` before it is saved. A transient internal text part is removed before delivery; only unsupported hosts retain model-context delivery. The compaction hook marks the next transform as compaction-only, so compaction history cannot receive worker advice. Idle, deletion and any changed user root, including an internal compaction continuation, clear pending advice.
- `bin/replay.ts` evaluates labelled synthetic traces without a model.

## Data boundary

Detector state contains event classes, booleans, timestamps, keyed fingerprints, and short fixed explanations. It does not retain raw prompts, tool arguments, tool output, source files, command results, or real transcripts. Visible delivery briefly copies active message metadata to preserve worker context; OpenCode stores that metadata with the advisory. Every session collection and cross-session collection has a hard limit.

## Fail-open rule

Detector and delivery errors are contained and logged. The message-creation hook rejects an expired or unregistered internal advisory to avoid saving it with the wrong worker context; ordinary user messages are left unchanged. The plugin never denies a permission, alters tool arguments, or blocks an active worker because the detector failed.
