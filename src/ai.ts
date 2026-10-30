export type MessageContent = string | MessagePart[];

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: MessageContent;
}

/** Sends a conversation to the model and resolves with its reply. */
export type Chat = (messages: readonly ChatMessage[]) => Promise<string>;

export interface AiOptions {
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
  systemPrompt: string;
  timeoutMs?: number;
}

interface CompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

/** OpenAI-compatible chat client: OpenAI, OpenRouter, Groq, Ollama, LM Studio, ... */
export function createChat({ baseUrl, apiKey, model, systemPrompt, timeoutMs = 120_000 }: AiOptions): Chat {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  return async (messages) => {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      // stream:false explicit: some proxies (e.g. 9router) default to SSE when omitted.
      body: JSON.stringify({ model, stream: false, messages: [{ role: 'system', content: systemPrompt }, ...messages] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`AI request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);

    const data = (await res.json()) as CompletionResponse;
    return data.choices?.[0]?.message?.content?.trim() || '(empty response)';
  };
}
