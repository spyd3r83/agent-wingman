# Security policy

## Supported versions

The private MVP supports only the current development branch. Public support policy will be defined before release.

## Reporting a vulnerability

Do not open a public issue for a suspected secret leak, prompt-injection path, unsafe model-facing delivery issue, or data exposure. Report privately to the repository maintainer through the private repository's security contact.

Include:

- affected commit;
- reproduction steps using synthetic data;
- observed impact;
- whether raw tool output, credentials, or private content were exposed.

## Threat model

Primary risks:

- untrusted tool output being reflected as instructions;
- secret-bearing command output entering diagnostics;
- plugin-originated advisories triggering more advisories;
- model-facing injection disturbing an active turn;
- detector failure blocking normal work.

Controls:

- advisories use fixed templates and do not quote raw output;
- secret-like values are redacted before hashing;
- synthetic advisory prefixes are excluded from detection;
- model-facing delivery is disabled by default;
- errors are caught and handled fail-open.
