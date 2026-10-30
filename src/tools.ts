export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>): Promise<string>;
}

export const getCurrentTimeTool: Tool = {
  name: 'get_current_time',
  description: 'Get the current date and time in UTC.',
  parameters: {
    type: 'object',
    properties: {},
  },
  async execute(): Promise<string> {
    const now = new Date();
    return JSON.stringify({
      utc: now.toISOString(),
      weekday: now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
      date: now.toLocaleDateString('en-US', { timeZone: 'UTC' }),
    });
  },
};

export const wikipediaSearchTool: Tool = {
  name: 'wikipedia_search',
  description: 'Search Wikipedia for articles, facts, history, people, places, and concepts.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search keywords' },
    },
    required: ['query'],
  },
  async execute(args): Promise<string> {
    const query = String(args.query || '').trim();
    if (!query) return 'Error: query is required';
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'NovaDiscordBot/1.0 (https://github.com/rheatkhs/nova)' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return `Wikipedia API error (${res.status})`;
      const data = (await res.json()) as { query?: { search?: Array<{ title: string; snippet: string }> } };
      const hits = data.query?.search?.slice(0, 3) ?? [];
      if (hits.length === 0) return `No Wikipedia results found for "${query}"`;
      return hits
        .map((h, i) => `${i + 1}. ${h.title}: ${h.snippet.replace(/<[^>]+>/g, '').trim()}`)
        .join('\n');
    } catch (err) {
      return `Failed to search Wikipedia: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const fetchPageTool: Tool = {
  name: 'fetch_page',
  description: 'Fetch and extract readable text from a web page URL.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'HTTP or HTTPS web page URL to read' },
    },
    required: ['url'],
  },
  async execute(args): Promise<string> {
    const rawUrl = String(args.url || '').trim();
    if (!rawUrl) return 'Error: url is required';
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return 'Error: only http and https URLs are allowed';
      }
    } catch {
      return 'Error: invalid URL';
    }

    try {
      const res = await fetch(parsed.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NovaBot/1.0)' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return `HTTP error ${res.status}`;
      const html = await res.text();
      // Strip script, style, and HTML tags; collapse whitespace.
      const text = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return text.slice(0, 3_000) || '(page had no readable text)';
    } catch (err) {
      return `Failed to fetch URL: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const defaultTools: readonly Tool[] = [getCurrentTimeTool, wikipediaSearchTool, fetchPageTool];

/** Creates a channel-scoped tool that allows the agent to inspect recent Discord chat. */
export function createChannelHistoryTool(channel: unknown): Tool {
  return {
    name: 'read_channel_history',
    description: 'Read recent messages from the current Discord channel to inspect prior conversation.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of recent messages to read (1 to 20, default 10)' },
      },
    },
    async execute(args): Promise<string> {
      if (!channel || typeof channel !== 'object' || !('messages' in channel)) {
        return 'Error: channel does not support reading message history';
      }
      const ch = channel as {
        messages: {
          fetch: (opt: { limit: number }) => Promise<{
            values?: () => IterableIterator<{ author: { displayName?: string; username: string }; content: string }>;
          }>;
        };
      };
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
      try {
        const fetched = await ch.messages.fetch({ limit });
        const items = fetched.values ? Array.from(fetched.values()) : [];
        if (items.length === 0) return '(no messages found in channel)';
        return items
          .reverse()
          .map((m) => `${m.author.displayName || m.author.username}: ${m.content.slice(0, 300)}`)
          .join('\n');
      } catch (err) {
        return `Failed to read channel history: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}
