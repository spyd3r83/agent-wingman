import plugin from "../src/index"

const logs: unknown[] = []
const toasts: unknown[] = []
const input = {
  client: {
    app: { log: async (value: unknown) => { logs.push(value) } },
    tui: { showToast: async (value: unknown) => { toasts.push(value) } },
  },
  project: {} as never,
  directory: process.cwd(),
  worktree: process.cwd(),
  experimental_workspace: { register: () => undefined },
  serverUrl: new URL("http://localhost"),
  $: {} as never,
}
const hooks = await plugin.server(input as never, {
  mode: "notify",
  minRelevantActions: 1,
  cooldownMs: 0,
})

if (plugin.id !== "agent-wingman") throw new Error("plugin id mismatch")
if (!hooks["tool.execute.after"]) throw new Error("missing tool.execute.after hook")
if (!hooks.event) throw new Error("missing event fallback hook")
for (let index = 0; index < 6; index += 1) {
  await hooks["tool.execute.after"]({
    tool: "bash",
    sessionID: "smoke",
    callID: String(index),
    args: { command: "bun test" },
  }, {
    title: "bash",
    output: "Error: test failed",
    metadata: { exitCode: 1 },
  })
}
if (toasts.length === 0) throw new Error("notify smoke did not produce a toast")
const toast = toasts[0] as { body?: { title?: string } }
if (toast.body?.title !== "Agent Wingman") throw new Error("toast request does not match the OpenCode SDK contract")
console.log(JSON.stringify({ status: "ok", toasts: toasts.length, logs: logs.length }))
