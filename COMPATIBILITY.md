# Compatibility

## Compatibility contract

Agent Wingman targets the stable OpenCode V1 plugin contract, beginning with OpenCode `1.3.5`. It has no runtime dependency, peer dependency, exact-version gate, or public declaration import on an OpenCode package.

Compatibility is based on capabilities and structural event data:

- The adapter accepts unknown host values and ignores event shapes it does not understand.
- Tool observations use `tool.execute.after` and the stable event stream, with cross-path deduplication.
- Notifications, logs, and inline injection are attempted only when their client methods exist.
- A missing or changed optional surface degrades to another delivery mode or a no-op; it never blocks OpenCode.

## Continuous verification

| OpenCode lane | Version | Purpose |
|---|---:|---|
| Minimum | `1.3.5` | Protects the documented support floor. |
| Midpoint | `1.14.17` | Detects compatibility assumptions hidden by endpoint-only testing. |
| Current | npm `latest` | Tests the newest stable release on every pull request. |

Every lane loads the same built JavaScript artifact from `.opencode/plugins/` in an isolated real CLI startup. Unit tests separately exercise event parsing, malformed/unknown input, dual-path deduplication, and delivery contracts. Bun `1.3.14` runs the build and test toolchain.

The package does not use OpenCode's beta V2 plugin API. Default model-facing delivery uses the stable V1 `session.prompt` client with `noReply` and a synthetic fixed-template part. Setting `mode: "notify"`, `mode: "shadow"`, or `experimentalInject: false` disables inline injection. A missing or failing prompt surface falls back to notification.

“Version-neutral” means supported stable V1 releases are selected by capabilities instead of exact version numbers. It does not promise compatibility with pre-`1.3.5` releases, beta APIs, or a future breaking V2 contract. A failure in the npm `latest` lane blocks release until compatibility is restored or the support statement is deliberately revised.
