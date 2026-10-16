import { describe, expect, test } from "bun:test"
import { OpenCodeEventAdapter } from "../src/opencode"
import plugin from "../src/index";
import {ContextAdvisories} from "../src/adapters";
import {loadConfig} from "../src/config";

describe("OpenCodeEventAdapter", () => {
  test("observes a terminal tool event once", () => {
    const adapter = new OpenCodeEventAdapter(128)
    const event = {
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-1",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          callID: "call-1",
          tool: "bash",
          state: {
            status: "error",
            input: { command: "bun test" },
            error: "exit code 1",
            time: { start: 1, end: 2 },
          },
        },
      },
    } as const
    expect(adapter.fromEvent(event as never)).toHaveLength(1)
    expect(adapter.fromEvent(event as never)).toHaveLength(0)
  })

  test("observes completed assistant text but not user or synthetic text", () => {
    const adapter = new OpenCodeEventAdapter(128)
    adapter.fromEvent({
      type: "message.updated",
      properties: { info: { id: "assistant-1", sessionID: "session-1", role: "assistant" } },
    })
    adapter.fromEvent({
      type: "message.updated",
      properties: { info: { id: "user-1", sessionID: "session-1", role: "user" } },
    })

    const part = {
      id: "part-1",
      sessionID: "session-1",
      messageID: "assistant-1",
      type: "text",
      text: "I will repeat the plan",
      time: { start: 1, end: 2 },
    } as const
    expect(adapter.fromEvent({ type: "message.part.updated", properties: { part } })).toHaveLength(1)
    expect(adapter.fromEvent({
      type: "message.part.updated",
      properties: { part: { ...part, id: "part-2", messageID: "user-1" } },
    })).toHaveLength(0)
    expect(adapter.fromEvent({
      type: "message.part.updated",
      properties: { part: { ...part, id: "part-3", synthetic: true } },
    })).toHaveLength(0)
  })

  test("deduplicates the after hook and terminal event paths", () => {
    const adapter = new OpenCodeEventAdapter(128)
    expect(adapter.fromToolAfter({
      tool: "bash",
      sessionID: "session-1",
      callID: "call-1",
      args: { command: "bun test" },
    }, { title: "bash", output: "failed", metadata: { exitCode: 1 } })).toBeDefined()
    expect(adapter.fromEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-1",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          callID: "call-1",
          tool: "bash",
          state: {
            status: "error",
            input: { command: "bun test" },
            error: "failed",
            time: { start: 1, end: 2 },
          },
        },
      },
    })).toHaveLength(0)
  })

  test("ignores unknown shapes and accepts the legacy deletion identity", () => {
    const adapter = new OpenCodeEventAdapter(128)
    expect(adapter.fromEvent(undefined)).toEqual([])
    expect(adapter.fromEvent({ type: "message.part.updated", properties: { part: { type: "tool" } } })).toEqual([])
    expect(adapter.fromToolAfter({ tool: "bash" }, {})).toBeUndefined()
    expect(adapter.deletedSessionID({
      type: "session.deleted",
      properties: { sessionID: "session-legacy" },
    })).toBe("session-legacy")
  })
})

describe('visible user-message delivery', () => {
  async function fixture(failWrite = false) {
    const prompts: Array<Record<string, unknown>> = [];
    let hooks: Awaited<ReturnType<typeof plugin>>;
    const source = {
      id: 'msg_worker', sessionID: 'ses_worker', role: 'user', agent: 'change-engineer',
      model: {providerID: 'openai', modelID: 'worker-model'}, variant: 'xhigh',
      tools: {task: false}, system: 'Keep the worker authority.', format: {type: 'text'},
      executionContext: {invocationID: 'inv_worker', runID: 'run_worker', rootMessageID: 'msg_worker', generation: 7},
    };
    hooks = await plugin({client: {
      app: {log: async () => undefined},
      session: {prompt: async (input: {
        body: Record<string, unknown>; path: {id: string};
      }) => {
        prompts.push(input.body);
        if (failWrite) throw new Error('Transport lost; write outcome unknown');
        const info = {
          id: 'msg_advisory', sessionID: input.path.id, role: 'user',
          time: {created: Date.now()}, agent: 'wrong-default',
        } as Record<string, unknown>;
        const response = {message: info, parts: input.body.parts};
        await hooks['chat.message']?.({}, response);
        return {data: {info, parts: response.parts}};
      }},
    }}, {mode: 'inject', experimentalInject: true});
    const request = () => ({messages: [{
      info: structuredClone(source), parts: [{type: 'text', text: 'Original task'}],
    }]});
    await hooks['experimental.chat.messages.transform']?.({}, request());
    for (let i = 0; i < 8; i++) {
      await hooks['tool.execute.after']?.({
        tool: 'bash', sessionID: source.sessionID, callID: 'call_' + i,
        args: {command: 'false'},
      }, {output: 'Error: command failed', metadata: {exitCode: 1}});
    }
    return {hooks, prompts, source, request};
  }

  test('persists one labelled user message with all worker context intact', async () => {
    const {hooks, prompts, source, request} = await fixture();
    const output = request();
    await hooks['experimental.chat.messages.transform']?.({}, output);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.noReply).toBe(true);
    expect(output.messages).toHaveLength(2);
    expect(output.messages[0]?.info).toEqual(source);
    expect(output.messages[0]?.parts).toEqual([{type: 'text', text: 'Original task'}]);
    const added = output.messages[1];
    expect(added?.info).toMatchObject({...source, id: 'msg_advisory'});
    expect(added?.parts[0]?.text).toContain('Agent Wingman advisory');
    expect(added?.parts[0]).not.toHaveProperty('synthetic', true);
    await hooks['experimental.chat.messages.transform']?.({}, request());
    expect(prompts).toHaveLength(1);
  });

  test('does not persist advice across idle, deletion or a new user root', async () => {
    for (const event of [
      {type: 'session.idle', properties: {sessionID: 'ses_worker'}},
      {type: 'session.deleted', properties: {info: {id: 'ses_worker'}}},
      {type: 'message.updated', properties: {info: {
        id: 'msg_new', role: 'user', sessionID: 'ses_worker',
      }}},
    ]) {
      const {hooks, prompts, request} = await fixture();
      await hooks.event?.({event});
      await hooks['experimental.chat.messages.transform']?.({}, request());
      expect(prompts).toHaveLength(0);
    }
  });

  test('skips compaction and delivers only on the subsequent worker request', async () => {
    const {hooks, prompts, request} = await fixture();
    await hooks['experimental.session.compacting']?.({sessionID: 'ses_worker'}, {});
    await hooks['experimental.chat.messages.transform']?.({}, request());
    expect(prompts).toHaveLength(0);
    await hooks['experimental.chat.messages.transform']?.({}, request());
    expect(prompts).toHaveLength(1);
  });

  test('does not blindly retry an ambiguous persistence failure', async () => {
    const {hooks, prompts, request} = await fixture(true);
    await hooks['experimental.chat.messages.transform']?.({}, request());
    await hooks['experimental.chat.messages.transform']?.({}, request());
    expect(prompts).toHaveLength(1);
  });

  test('rejects a delayed server write after the client reports failure', async () => {
    const {hooks, prompts, request} = await fixture(true);
    await hooks['experimental.chat.messages.transform']?.({}, request());
    await expect(hooks['chat.message']?.({}, {
      message: {id: 'late', sessionID: 'ses_worker', role: 'user'},
      parts: prompts[0]?.parts,
    })).rejects.toThrow('Unregistered or expired Wingman advisory');
  });

  test('leaves unrelated user messages untouched', async () => {
    const {hooks} = await fixture();
    const output = {message: {id: 'human', sessionID: 'ses_worker', agent: 'human-agent'},
      parts: [{type: 'text', text: 'A genuine human instruction'}]};
    const before = structuredClone(output);
    await hooks['chat.message']?.({}, output);
    expect(output).toEqual(before);
  });
});

describe('advisory run boundaries', () => {
  test('drops advice when the next worker request has a different root or generation', () => {
    const context = new ContextAdvisories(loadConfig({}, {}));
    const info = {
      id: 'msg_old', sessionID: 'ses_run', role: 'user',
      executionContext: {invocationID: 'invocation-old', generation: 1},
    };
    context.apply({messages: [{info, parts: []}]}, 1);
    const decision = {
      sessionID: 'ses_run', episodeKey: 'episode', score: 8,
      confidence: 'eligible' as const, detections: [], message: 'Old advice',
      notice: 'Notice', timestamp: 1,
    };
    context.enqueue(decision);
    const next = {messages: [{
      info: {...info, id: 'msg_new', executionContext: {invocationID: 'invocation-new', generation: 1}},
      parts: [],
    }]};
    expect(context.apply(next, 1)).toBe(0);
    context.enqueue(decision);
    const retry = {messages: [{
      info: {...next.messages[0]?.info, executionContext: {invocationID: 'invocation-new', generation: 2}},
      parts: [],
    }]};
    expect(context.apply(retry, 1)).toBe(0);
  });

  test('invalidates the old root before a finishing old tool can queue more advice', () => {
    const context = new ContextAdvisories(loadConfig({}, {}));
    const info = {id: 'msg_old', sessionID: 'ses_run', role: 'user'};
    context.apply({messages: [{info, parts: []}]}, 1);
    expect(context.noteUserMessage({...info, id: 'msg_new'})).toBe('ses_run');
    expect(context.enqueue({
      sessionID: 'ses_run', episodeKey: 'old-tool', score: 8,
      confidence: 'eligible', detections: [], message: 'Late old advice',
      notice: 'Notice', timestamp: 1,
    })).toBe(false);
  });
});
