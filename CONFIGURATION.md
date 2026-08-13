# Configuration

Configuration can be supplied through plugin options or environment variables.

| Option | Environment | Default | Purpose |
|---|---|---:|---|
| `enabled` | `AGENT_WINGMAN_ENABLED` | `true` | Enables detection. |
| `mode` | `AGENT_WINGMAN_MODE` | `shadow` | `shadow`, `notify`, or `inject`. |
| `threshold` | n/a | `8` | Minimum score for intervention. |
| `maxObservations` | n/a | `128` | Per-session observation limit. |
| `experimentalInject` | `AGENT_WINGMAN_EXPERIMENTAL_INJECT` | `false` | Allows no-reply prompt delivery when `mode` is `inject`. |

Recommended initial setting:

```json
[["./dist/src/index.js", { "mode": "shadow" }]]
```

Notify-only setting:

```json
[["./dist/src/index.js", { "mode": "notify" }]]
```

Do not enable `inject` mode until exact-version compatibility tests pass.
