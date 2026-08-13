# Compatibility

## Verified release candidate

| Surface | Verified version | Evidence |
|---|---:|---|
| OpenCode CLI | `1.18.18` | Built plugin loaded from `.opencode/plugins/` in an isolated real CLI startup. |
| `@opencode-ai/plugin` | `1.18.18` | Strict TypeScript compilation against stable `Hooks`, `Plugin`, and `PluginModule` types. |
| Bun | `1.3.14` | Install, tests, build, trace replay, smoke, and package dry-run. |
| Node types | `24.x` | Toolchain type compatibility only; the runtime target is Bun. |

The stable V1 surfaces used are `tool.execute.after`, `event`, `message.updated`, `message.part.updated`, `session.error`, and `session.deleted`. Tool terminal events are deduplicated when both hook paths fire.

The plugin does not use OpenCode's beta V2 plugin API. Model-facing injection uses the stable V1 `session.prompt` client with `noReply` and remains disabled unless both `mode: "inject"` and `experimentalInject: true` are set.

Compatibility claims apply only to versions exercised by CI. A dependency update must pass the real CLI load smoke before this table changes.
