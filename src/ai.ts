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
  systemPrompt?: string;
  extraTools?: readonly Tool[];
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
    const conversation: ApiMessage[] = [
      { role: 'system', content: activeSystemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    for (let step = 0; step < maxToolSteps; step++) {
      const body: Record<string, unknown> = {
        model,
        stream: false,
        messages: conversation,
      };
      if (openAiTools) {
        body.tools = openAiTools;
        body.tool_choice = 'auto';
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`AI request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);

      const data = (await res.json()) as CompletionResponse;
      const msg = data.choices?.[0]?.message;
      if (!msg) return '(empty response)';

      const toolCalls = msg.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        return msg.content?.trim() || '(empty response)';
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
