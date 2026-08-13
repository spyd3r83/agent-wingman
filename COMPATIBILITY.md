# Compatibility

Tested development surfaces:

- Bun 1.3.11.
- Node.js 22.22.0 for toolchain compatibility.
- `@opencode-ai/plugin` 1.3.5.
- `@opencode-ai/sdk` 1.3.5 as a transitive dependency of the plugin package.
- OpenCode V1 plugin hook types: `tool.execute.after` and `chat.message`.
- Client surfaces used defensively: `tui.showToast`, `app.log`, and disabled-by-default `session.prompt` with `noReply`.

The V2 SDK exists in the installed package but is not used by this MVP because it remains outside the stable V1 target for this run.

Compatibility claims are limited to the local development and type surfaces above. A full OpenCode runtime compatibility matrix must be added before public release.
