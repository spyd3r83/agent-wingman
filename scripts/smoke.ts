import plugin from "../src/index"

const logs: unknown[] = []
const toasts: unknown[] = []
const prompts: unknown[] = []
let hooks: Awaited<ReturnType<typeof plugin.server>>;
const input = {
  client: {
    app: { log: async (value: unknown) => { logs.push(value) } },
    tui: { showToast: async (value: unknown) => { toasts.push(value) } },
    session: {prompt: async (value: {body: Record<string, unknown>; path: {id: string}}) => {
      prompts.push(value);
      const message = {id: 'msg_advisory', sessionID: value.path.id, role: 'user'};
      const output = {message, parts: value.body.parts};
      await hooks['chat.message']?.({}, output);
      return {data: {info: output.message, parts: output.parts}};
    }},
  },
  project: {} as never,
  directory: process.cwd(),
  worktree: process.cwd(),
  experimental_workspace: { register: () => undefined },
  serverUrl: new URL("http://localhost"),
  $: {} as never,
}
hooks = await plugin.server(input as never, {
  minRelevantActions: 1,
  cooldownMs: 0,
})

if (plugin.id !== "agent-wingman") throw new Error("plugin id mismatch")
if (!hooks["tool.execute.after"]) throw new Error("missing tool.execute.after hook")
if (!hooks.event) throw new Error("missing event fallback hook")
const info = {
  id: 'msg_smoke',
  role: 'user',
  sessionID: 'smoke',
  agent: 'worker',
  model: {providerID: 'fixture', modelID: 'worker'},
  variant: 'bounded',
  tools: {task: false},
  executionContext: {invocationID: 'smoke-invocation'},
};
await hooks['experimental.chat.messages.transform']?.({}, {messages: [{info, parts: []}]});
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
const before = structuredClone(info);
const output = {messages: [{info, parts: [{type: 'text', text: 'Original smoke task'}]}]};
await hooks['experimental.chat.messages.transform']?.({}, output);
if (prompts.length !== 1) throw new Error('Expected one visible user message');
if (toasts.length !== 0) throw new Error('Unexpected notification fallback');
if (JSON.stringify(info) !== JSON.stringify(before)) throw new Error('Original worker metadata changed');
if (output.messages.length !== 2) throw new Error('Visible advisory missing from model request');
const advisory = output.messages[1];
if (!advisory?.parts[0]?.text.includes('Agent Wingman advisory')) throw new Error('Advisory text missing');
if ('synthetic' in advisory.parts[0] && advisory.parts[0].synthetic === true) throw new Error('Advisory hidden');
console.log(JSON.stringify({status: 'ok', prompts: prompts.length, metadataPreserved: true}));
