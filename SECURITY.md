# Security policy

## Supported versions

Until `0.1.0` is released, only the latest commit on `main` receives security fixes. After release, the latest `0.1.x` version will be supported.

## Reporting a vulnerability

Do not open a public issue for a suspected secret leak, unsafe model-facing injection, prompt-injection path, dependency compromise, or data exposure.

Use GitHub's **Security → Report a vulnerability** flow for this repository. Include the affected version or commit, synthetic reproduction steps, observed impact, and whether any credential or private content may have been exposed. Do not include real secrets or private transcripts.

## Security invariants

- Tool execution and permissions are never blocked or approved by Agent Wingman.
- Advisories use fixed templates and never quote tool output.
- Secret-like values are redacted before keyed fingerprinting.
- Fingerprint keys are random, process-local, and never persisted.
- Model-facing delivery is disabled unless two explicit settings agree.
- Plugin-originated synthetic messages are excluded from detection.
- Session, observation, episode, message-role, and deduplication state are bounded.
- Detector and delivery failures are handled fail-open.

Dependency updates and OpenCode compatibility changes must pass tests, trace gates, type checks, package inspection, and a real CLI plugin-load smoke.
