# Configuration

Options may be supplied in the OpenCode plugin tuple. Environment variables are intentionally limited to the operational mode and the two kill-switch style flags.

| Option | Environment | Default | Accepted range |
|---|---|---:|---:|
| `enabled` | `AGENT_WINGMAN_ENABLED` | `true` | boolean |
| `mode` | `AGENT_WINGMAN_MODE` | `inject` | `shadow`, `notify`, `inject` |
| `experimentalInject` | `AGENT_WINGMAN_EXPERIMENTAL_INJECT` | `true` | boolean |
| `threshold` | — | `8` | 1–100 |
| `minRelevantActions` | — | `8` | 1–100 |
| `maxSessions` | — | `64` | 1–1024 |
| `maxObservations` | — | `128` | 16–2048 |
| `maxEpisodesPerSession` | — | `64` | 8–1024 |
| `cooldownMs` | — | `300000` | 0–86400000 |
| `maxInterventionsPerEpisode` | — | `2` | 1–20 |
| `maxInterventionsPerWindow` | — | `2` | 1–100 |
| `interventionWindowMs` | — | `1800000` | 1000–86400000 |

Invalid numeric values fall back to defaults; out-of-range numeric values are clamped. Unknown modes fall back to `inject`.

Recommended calibration:

```json
{
  "plugin": [["opencode-agent-wingman", { "mode": "shadow", "threshold": 9 }]]
}
```

Default inline injection:

```json
{
  "plugin": ["opencode-agent-wingman"]
}
```

Notification-only override:

```json
{
  "plugin": [["opencode-agent-wingman", {
    "mode": "notify"
  }]]
}
```

The `experimentalInject` setting remains as a compatibility and emergency kill switch. Setting it to `false` while `mode` is `inject` forces notification delivery. If the host injection surface is missing or fails, delivery also falls back to a TUI notification and then to a structured local log. Detection never blocks the active OpenCode operation.
