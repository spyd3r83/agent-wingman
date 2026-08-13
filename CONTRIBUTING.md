# Contributing

This repository is private during the MVP phase.

Before proposing a change:

1. Keep the detector deterministic unless a later roadmap item explicitly approves classifiers.
2. Do not add telemetry, network calls, or persistence by default.
3. Do not include real private transcripts or internal infrastructure details.
4. Add or update trace fixtures for behaviour changes.
5. Run `bun run verify`.

Detection changes should explain which false positive or false negative they address.
