import plugin, { server } from "../src/index"

const logs: unknown[] = []
const toasts: unknown[] = []
const input = {
  client: {
    app: { log: async (input: unknown) => { logs.push(input) } },
    tui: { showToast: async (input: unknown) => { toasts.push(input) } },
  },
  project: {} as never,
  directory: process.cwd(),
  worktree: process.cwd(),
  serverUrl: new URL("http://localhost"),
  $: {} as never,
}
const hooks = await server(input as never, { mode: "notify" })

if (plugin.id !== "agent-wingman") throw new Error("plugin id mismatch")
if (!hooks["tool.execute.after"]) throw new Error("missing tool.execute.after hook")
for (let index = 0; index < 8; index += 1) {
  await hooks["tool.execute.after"]({ tool: "bash", sessionID: "smoke", callID: String(index), args: { command: "bun test" } }, {
    title: "bash",
    output: "Error: test failed",
    metadata: {},
  })
}
if (toasts.length === 0) throw new Error("notify smoke did not produce toast")
console.log(JSON.stringify({ status: "ok", toasts: toasts.length, logs: logs.length }))
