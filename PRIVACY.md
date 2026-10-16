# Privacy

Agent Wingman keeps detector state in memory and uses OpenCode for local advisory delivery.

- No telemetry or remote service.
- No telemetry or separate remote service is added by Wingman. Inline delivery uses OpenCode's configured model provider and may cause one additional sequential model request.
- No separate transcript store. Visible advisories are persisted in the OpenCode conversation.
- No raw prompt, tool argument, tool output, source file, or command result retained in detector state.
- No untrusted output copied into an advisory.

The detector retains bounded in-memory observations containing coarse event and tool classes, success status, timestamps, fixed explanations, and fingerprints. Secret-shaped values are redacted before fingerprinting. Fingerprints use a random per-process HMAC key, so the same input produces unrelated identifiers after restart and cannot be correlated between installations.

OpenCode's own storage, session retention, and logging behaviour is outside this plugin's boundary. Every delivery mode writes structured local OpenCode logs containing signal names, confidence, scores, and keyed episode identifiers—not raw event material. The default inline mode persists a fixed, labelled user-role advisory in the OpenCode session. Delivery briefly copies the active message metadata to preserve the worker, model, system instructions, tool mask and execution context. OpenCode stores that metadata with the advisory. The advisory text never contains raw prompts, tool arguments, tool output, source text, or command results. A host without the prompt surface retains synthetic model-context delivery.

Any future persistence, telemetry, or diagnostic export would require a documented threat model, explicit opt-in, retention controls, and a separate public review before release.
