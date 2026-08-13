# Architecture

Agent Wingman separates event ingestion, detection, policy, and delivery.

```text
OpenCode stable hooks and events
  -> deduplicating OpenCode adapter
  -> event normalizer and ephemeral HMAC fingerprints
  -> bounded per-session state
  -> deterministic detectors
  -> scoring, cooldown, and rate policy
  -> shadow, notify, or opt-in injection adapter
```

## Core modules

- `src/opencode.ts` converts terminal tool and assistant-text events into one deduplicated stream. The event path covers runtimes where `tool.execute.after` is unavailable or incomplete.
- `src/normalizer.ts` derives compact observations and progress markers.
- `src/fingerprint.ts` redacts likely secrets and creates process-local keyed fingerprints.
- `src/state.ts` keeps bounded observations.
- `src/detectors.ts` emits positive and negative struggle signals.
- `src/policy.ts` applies scoring, cooldown, per-episode caps, and rate limits.
- `src/adapters.ts` feature-detects stable OpenCode client surfaces for structured logs, TUI notifications, and gated no-reply messages.
- `bin/replay.ts` evaluates labelled synthetic traces without a model.

## Data boundary

The retained in-memory state contains event classes, booleans, timestamps, keyed fingerprints, and short fixed explanations. It does not retain raw prompts, tool arguments, tool output, source files, command results, or real transcripts. Every session collection and cross-session collection has a hard limit.

## Fail-open rule

Every plugin hook catches detector and delivery failures. The plugin never denies a permission, alters tool arguments, or blocks OpenCode because the detector failed.
