import {randomUUID} from 'crypto';
import {ContextAdvisories, logDiagnostic} from './adapters';
import {asRecord} from './opencode';

const CONTEXT_FIELDS = [
  'agent', 'model', 'variant', 'tools', 'system', 'format', 'executionContext',
] as const;

interface PromptClient {
  session?: {
    prompt?: (input: {
      path: {id: string};
      body: Record<string, unknown>;
      throwOnError: true;
      signal: AbortSignal;
    }) => Promise<unknown>;
  };
}

interface PendingMessage {
  source: Record<string, unknown>;
  text: string;
  context: ContextAdvisories;
  preserved: boolean;
}

/** Persists labelled user messages without starting another model turn. */
export class UserMessageAdvisories {
  private readonly pending = new Map<string, PendingMessage>();

  constructor(private readonly client: unknown) {}

  /** Copies trusted context only onto the exact message created by this instance. */
  preserveContext(_input: unknown, output: unknown): void {
    const record = asRecord(output);
    const message = asRecord(record?.message);
    const parts = record?.parts;
    if (!message || !Array.isArray(parts)) return;
    for (const [token, pending] of this.pending) {
      if (message.sessionID !== pending.source.sessionID
          || !parts.some(part => asRecord(part)?.text === pending.text
            && asRecord(asRecord(part)?.metadata)?.agentWingmanToken === token)) continue;
      if (!pending.context.isCurrent(pending.source)) {
        throw new Error('Wingman user root changed before advisory persistence.');
      }
      for (const field of CONTEXT_FIELDS) {
        if (pending.source[field] === undefined) delete message[field];
        else message[field] = structuredClone(pending.source[field]);
      }
      pending.preserved = true;
      return;
    }
    // A timed-out SDK call may still reach the server. Never save its advisory
    // after the context needed to preserve the worker has been discarded.
    if (parts.some(part => {
      return typeof asRecord(asRecord(part)?.metadata)?.agentWingmanToken === 'string';
    })) {
      throw new Error('Unregistered or expired Wingman advisory.');
    }
  }

  async apply(output: unknown, context: ContextAdvisories): Promise<number> {
    const messages = asRecord(output)?.messages;
    if (!Array.isArray(messages)) return 0;
    const originalLengths = new Map<unknown, number>();
    for (const raw of messages) {
      const parts = asRecord(raw)?.parts;
      if (Array.isArray(parts)) originalLengths.set(raw, parts.length);
    }
    context.apply(output);
    let inserted = 0;
    for (const raw of [...messages]) {
      const message = asRecord(raw);
      const source = asRecord(message?.info);
      const parts = message?.parts;
      const length = originalLengths.get(raw);
      if (!source || !Array.isArray(parts) || length === undefined) continue;
      const added = parts.splice(length);
      if (!added.length) continue;
      const sessionID = source.sessionID;
      const model = asRecord(source.model);
      const prompt = (this.client as PromptClient).session?.prompt;
      if (typeof sessionID !== 'string' || typeof source.agent !== 'string'
          || typeof model?.providerID !== 'string' || typeof model.modelID !== 'string'
          || !prompt || !context.isCurrent(source)) {
        parts.push(...added);
        await logDiagnostic(this.client, 'warn', 'visible advisory unavailable; using model context', {sessionID});
        continue;
      }
      const token = randomUUID();
      const text = added.map(part => asRecord(part)?.text).join('\n\n');
      const pending: PendingMessage = {
        source: structuredClone(source), text, context, preserved: false,
      };
      this.pending.set(token, pending);
      try {
        const body: Record<string, unknown> = {
          noReply: true,
          parts: [{type: 'text', text, metadata: {agentWingmanToken: token}}],
        };
        for (const field of CONTEXT_FIELDS) {
          if (field !== 'executionContext' && source[field] !== undefined) {
            body[field] = structuredClone(source[field]);
          }
        }
        const result = asRecord(await prompt.call((this.client as PromptClient).session, {
          path: {id: sessionID}, body, throwOnError: true, signal: AbortSignal.timeout(5000),
        }));
        const persisted = asRecord(result?.data) ?? result;
        const info = asRecord(persisted?.info);
        if (!pending.preserved || info?.role !== 'user' || !Array.isArray(persisted?.parts)) {
          throw new Error('Host did not confirm context-preserving user-message delivery.');
        }
        for (const field of CONTEXT_FIELDS) {
          if (JSON.stringify(info[field]) !== JSON.stringify(source[field])) {
            throw new Error(`Host changed advisory context: ${field}`);
          }
        }
        messages.push(persisted);
        inserted += added.length;
        await logDiagnostic(this.client, 'info', 'advisory persisted as user message', {
          sessionID, messageID: info.id, count: added.length,
        });
      } catch {
        // A failed response may follow a successful write; never retry blindly.
        await logDiagnostic(this.client, 'warn', 'visible advisory delivery unconfirmed; not retried', {sessionID});
      } finally {
        this.pending.delete(token);
      }
    }
    return inserted;
  }
}
