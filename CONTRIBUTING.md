# Contributing

Thank you for helping agents get unstuck.

Before opening a pull request:

1. Keep the detector deterministic unless a roadmap decision explicitly changes that boundary.
2. Do not add telemetry, remote services, raw transcript persistence, or model-facing text derived from untrusted event data. Inline advisories must remain fixed-template, synthetic, no-reply, bounded, and fail-open.
3. Use only synthetic traces and public-safe examples.
4. Add or update a labelled trace for every detection behaviour change.
5. Run `bun run verify`.
6. Explain which false positive or false negative the change addresses.

Pull requests from forks run with read-only permissions and no repository secrets. Maintainers may ask for a smaller trace or detector change if the evidence does not justify added complexity.

By submitting a contribution, you agree that it is licensed under Apache-2.0.
