import type { Tool } from './types.ts';

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
