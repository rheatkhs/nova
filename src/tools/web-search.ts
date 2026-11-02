import type { Tool } from './types.ts';
import { wikipediaSearchTool } from './wikipedia.ts';

export const webSearchTool: Tool = {
  name: 'web_search',
  description:
    'Search the web using SearXNG or Brave Search (falls back to Wikipedia if unconfigured). Set SEARXNG_URL or BRAVE_API_KEY in .env for full web search.',
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

    const braveKey = process.env.BRAVE_API_KEY?.trim();
    if (braveKey) {
      return searchBrave(query, braveKey);
    }

    const searxngUrl = process.env.SEARXNG_URL?.trim();
    if (searxngUrl) {
      return searchSearxng(query, searxngUrl);
    }
    const wiki = await wikipediaSearchTool.execute({ query });
    return `[Note: neither BRAVE_API_KEY nor SEARXNG_URL configured; fell back to Wikipedia]\n\n${wiki}`;
  },
};

async function searchBrave(query: string, apiKey: string): Promise<string> {
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
    const res = await fetch(url, {
      headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return `Brave API error (${res.status})`;
    const data = (await res.json()) as {
      web?: { results?: Array<{ title: string; url: string; description: string }> };
    };
    const results = data.web?.results ?? [];
    if (results.length === 0) return `No web results found for "${query}"`;
    return results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`)
      .join('\n\n');
  } catch (err) {
    return `Brave search error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function searchSearxng(query: string, baseUrl: string): Promise<string> {
  try {
    const url = `${baseUrl.replace(/\/+$/, '')}/search?q=${encodeURIComponent(query)}&format=json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'NovaBot/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return `SearXNG error (${res.status})`;
    const data = (await res.json()) as {
      results?: Array<{ title: string; url: string; content?: string }>;
    };
    const results = data.results?.slice(0, 5) ?? [];
    if (results.length === 0) return `No SearXNG results found for "${query}"`;
    return results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content || ''}`.trim())
      .join('\n\n');
  } catch (err) {
    return `SearXNG search error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
