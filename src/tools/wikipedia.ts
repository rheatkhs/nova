import type { Tool } from './types.ts';

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
      const base = process.env.WIKIPEDIA_BASE_URL || 'https://en.wikipedia.org/w/api.php';
      const url = `${base}?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1`;
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
