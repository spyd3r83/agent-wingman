# Agent Wingman for OpenCode

Agent Wingman for OpenCode detects repetitive, low-progress agent behaviour locally and gives concise, explainable nudges before a loop becomes expensive.

This project is community-maintained. It is not an official OpenCode product.

The current repository is a private detector-first MVP. The durable product is the deterministic detector, not prompt injection.

## What ships in v0.1

- Local event normalization for tool, message, session, and consultation-style observations.
- Bounded in-memory session state.
- Secret-aware fingerprints that avoid storing raw tool output in advisories.
- Deterministic signals for repeated failures, failure recurrence, read/search churn, zero productive delta, high error density, plan repetition, and consultation churn.
- Scoring, thresholding, cooldown, episode deduplication, self-event exclusion, and fail-open delivery.
- Trace replay CLI with labelled productive and unproductive fixtures.
- Shadow mode and notify-only mode.
- Experimental model-facing no-reply adapter, disabled by default, with notify fallback.

## What does not ship

- No telemetry, network calls, or persistence by default.
- No model classifier, embeddings, vector database, dashboard, or remote service.
- No automatic browsing, tool execution, file mutation, or agent delegation.
- No real private transcripts or internal infrastructure details.

## Install for local development

```bash
bun install
bun run verify
```

## OpenCode plugin configuration

For local plugin loading, point OpenCode at the built plugin entry after running `bun run build`.

```json
{
  "plugin": ["./dist/src/index.js"]
}
```

Recommended default:

```json
{
  "plugin": [["./dist/src/index.js", { "mode": "shadow" }]]
}
```

Use notify-only mode after reviewing trace results:

```json
{
  "plugin": [["./dist/src/index.js", { "mode": "notify" }]]
}
```

Model-facing injection requires both `mode: "inject"` and `experimentalInject: true`. Do not enable it until compatibility testing has passed for the exact OpenCode version in use.

## Trace replay

```bash
bun run trace:replay
```

The replay command exits non-zero if the fixture corpus falls below the current precision or recall gates.

## Fresh-clone smoke path

After a remote exists:

```bash
git clone <private-repo-url> agent-wingman-smoke
cd agent-wingman-smoke
bun install
bun run verify
```

## License

Apache-2.0. See `LICENSE`.
