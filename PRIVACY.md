# Privacy

Agent Wingman is local and memory-only by default.

- No telemetry or remote service.
- No added external network calls.
- No persistence or transcript collection.
- No raw prompt, tool argument, tool output, source file, or command result retained in detector state.
- No untrusted output copied into an advisory.

The detector retains bounded in-memory observations containing coarse event and tool classes, success status, timestamps, fixed explanations, and fingerprints. Secret-shaped values are redacted before fingerprinting. Fingerprints use a random per-process HMAC key, so the same input produces unrelated identifiers after restart and cannot be correlated between installations.

OpenCode's own storage and logging behaviour is outside this plugin's boundary. Shadow and notify modes write structured local OpenCode logs containing signal names, confidence, scores, and keyed episode identifiers—not raw event material.

Any future persistence, telemetry, or diagnostic export would require a documented threat model, explicit opt-in, retention controls, and a separate public review before release.
