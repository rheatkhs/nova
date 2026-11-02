import type { Tool } from './tools.ts';

export type MessageContent = string | MessagePart[];

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: MessageContent;
}

export interface ChatRunOptions {
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  extraTools?: readonly Tool[];
  now?: Date;
  onToolStart?: (toolName: string) => Promise<void> | void;
}

/** Sends a conversation to the model and resolves with its reply. */
export type Chat = (messages: readonly ChatMessage[], options?: ChatRunOptions) => Promise<string>;

export interface AiOptions {
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
  systemPrompt: string;
  tools?: readonly Tool[];
  maxToolSteps?: number;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ApiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: MessageContent | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface CompletionResponse {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: ToolCall[];
    };
  }[];
}

/** OpenAI-compatible agent client with multi-step tool calling loop. */
export function createChat({
  baseUrl,
  apiKey,
  model,
  systemPrompt,
  tools = [],
  maxToolSteps = 5,
  retries = 1,
  retryDelayMs = 1_000,
  timeoutMs = 120_000,
}: AiOptions): Chat {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  return async (messages, options) => {
    const allTools = [...tools, ...(options?.extraTools ?? [])];
    const toolMap = new Map(allTools.map((t) => [t.name, t]));
    const openAiTools =
      allTools.length > 0
        ? allTools.map((t) => ({
            type: 'function' as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          }))
        : undefined;
    const activeSystemPrompt = options?.systemPrompt || systemPrompt;
    const now = options?.now ?? new Date();
    const dateContext = `Current time: ${now.toISOString().slice(0, 10)} (${now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}, UTC).`;
    const conversation: ApiMessage[] = [
      { role: 'system', content: `${activeSystemPrompt}\n\n${dateContext}` },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const activeModel = options?.model || model;
    for (let step = 0; step < maxToolSteps; step++) {
      const body: Record<string, unknown> = {
        model: activeModel,
        stream: false,
        messages: conversation,
      };
      if (options?.temperature !== undefined) {
        body.temperature = options.temperature;
      }
      if (openAiTools) {
        body.tools = openAiTools;
        body.tool_choice = 'auto';
      }

      const res = await fetchWithRetry(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        },
        retries,
        retryDelayMs,
      );
      if (!res.ok) throw new Error(`AI request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);

      const data = (await res.json()) as CompletionResponse;
      const msg = data.choices?.[0]?.message;
      if (!msg) return '(empty response)';

      const toolCalls = msg.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        const raw = msg.content?.trim() || '(empty response)';
        return sanitizeOutput(raw, activeSystemPrompt);
      }

      conversation.push({
        role: 'assistant',
        content: msg.content ?? null,
        tool_calls: toolCalls,
      });

      const toolResults = await Promise.all(
        toolCalls.map(async (call) => {
          try {
            await options?.onToolStart?.(call.function.name);
          } catch {}
          const tool = toolMap.get(call.function.name);
          let output: string;
          if (!tool) {
            output = `Error: unknown tool "${call.function.name}"`;
          } else {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(call.function.arguments || '{}');
            } catch {
              args = {};
            }
            try {
              output = await tool.execute(args);
            } catch (err) {
              output = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
            }
          }
          return { role: 'tool' as const, tool_call_id: call.id, content: output };
        }),
      );

      conversation.push(...toolResults);
    }

    return 'Agent reached max tool execution steps.';
  };
}

const TRANSIENT_STATUSES: Record<number, true> = {
  429: true,
  500: true,
  502: true,
  503: true,
  504: true,
};

/** Performs fetch with retries on transient errors (429 rate limit or 5xx gateway/server errors). */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries: number,
  delayMs: number,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0 && delayMs > 0) {
      await Bun.sleep(delayMs);
    }
    try {
      const res = await fetch(url, init);
      if (res.ok || !TRANSIENT_STATUSES[res.status] || attempt === retries) {
        return res;
      }
    } catch (err) {
      if (attempt === retries) throw err;
    }
  }
  throw new Error('AI request failed: retry attempts exhausted');
}

/**
 * Detects if the model's output leaks the active system prompt verbatim.
 * Replaces verbatim leaks with a polite privacy refusal.
 */
export function sanitizeOutput(output: string, systemPrompt: string): string {
  const normOut = output.toLowerCase().replace(/\s+/g, ' ');
  const normSys = systemPrompt.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normSys.length >= 30 && normOut.includes(normSys)) {
    return 'I cannot disclose my internal system instructions.';
  }
  return output;
}
