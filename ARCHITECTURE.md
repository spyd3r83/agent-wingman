# Architecture

Agent Wingman separates detection from delivery.

```text
OpenCode V1 hooks
  -> event normalizer
  -> bounded session state
  -> deterministic detectors
  -> scorer and policy
  -> delivery adapter
```

## Core modules

- `src/normalizer.ts` converts raw plugin and replay events into compact observations.
- `src/fingerprint.ts` redacts likely secrets and hashes normalized material.
- `src/state.ts` keeps bounded per-session observations and episode state in memory.
- `src/detectors.ts` produces positive and negative struggle signals.
- `src/policy.ts` applies scoring, hysteresis, cooldown, and deduplication.
- `src/adapters.ts` delivers shadow logs, TUI toasts, or gated no-reply prompts.
- `bin/replay.ts` evaluates labelled traces without OpenCode.

## State model

The MVP stores fingerprints, event classes, status, and derived facts. It does not persist raw prompts, tool output, source files, command results, or private transcripts.

## Fail-open rule

Detection and delivery errors are caught inside hooks. The plugin never blocks OpenCode tool execution because the detector failed.
