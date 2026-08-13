# Privacy

Agent Wingman is local by default.

- No telemetry by default.
- No network calls by default.
- No persistence by default.
- No raw tool output in advisories.
- No full transcript collection.
- No real private traces in the repository.

The detector stores bounded in-memory observations containing event type, coarse tool class, success status, hashes, and short explanations. Hash input is normalized and secret-like values are redacted before hashing.

If future diagnostic persistence is added, it must be opt-in, locally salted, documented, and disabled by default.
