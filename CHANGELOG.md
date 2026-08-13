# Changelog

All notable changes will be documented here.

## 0.1.1 - 2026-08-13

- Fixed the packaged replay executable so npm installations contain one valid Bun shebang.
- Added an executable package regression test using a representative trace.

## 0.1.0 - 2026-08-13

- Added bounded, deterministic struggle detection and synthetic trace replay.
- Added stable OpenCode event ingestion with terminal-event deduplication and assistant-only text observation.
- Added a version-neutral structural adapter with no OpenCode runtime, peer, or public type dependency.
- Verified the same artifact against OpenCode `1.3.5`, `1.14.17`, and the latest stable release.
- Corrected stable V1 TUI and no-reply request contracts.
- Added default inline synthetic injection, notification-only and shadow overrides, and fail-open delivery fallback.
- Added real OpenCode CLI load testing, package-content checks, and pinned CI actions.
- Added ephemeral HMAC fingerprints, bounded cross-session state, and public-safe documentation.
- Added an original Agent Wingman vector logo.
