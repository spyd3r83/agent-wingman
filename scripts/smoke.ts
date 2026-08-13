import plugin from "../src/index"

const logs: unknown[] = []
const toasts: unknown[] = []
const prompts: unknown[] = []
const input = {
  client: {
    app: { log: async (value: unknown) => { logs.push(value) } },
    tui: { showToast: async (value: unknown) => { toasts.push(value) } },
    session: { prompt: async (value: unknown) => { prompts.push(value) } },
  },
  project: {} as never,
  directory: process.cwd(),
  worktree: process.cwd(),
  experimental_workspace: { register: () => undefined },
  serverUrl: new URL("http://localhost"),
  $: {} as never,
}
const hooks = await plugin.server(input as never, {
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
if (prompts.length === 0) throw new Error("default inline injection did not produce a synthetic prompt")
if (toasts.length !== 0) throw new Error("default inline injection unexpectedly used notification fallback")
const prompt = prompts[0] as { body?: { noReply?: boolean; parts?: Array<{ synthetic?: boolean }> } }
if (prompt.body?.noReply !== true || prompt.body.parts?.[0]?.synthetic !== true) {
  throw new Error("inline injection does not match the OpenCode no-reply synthetic contract")
}
console.log(JSON.stringify({ status: "ok", prompts: prompts.length, toasts: toasts.length, logs: logs.length }))
