import { expect, test } from 'bun:test';
import { createChannelHistoryTool, evalMathTool, evaluateMath, fetchPageTool, getCurrentTimeTool, webSearchTool, wikipediaSearchTool } from './tools.ts';

test('get_current_time returns valid UTC date info', async () => {
  const result = JSON.parse(await getCurrentTimeTool.execute({}));
  expect(typeof result.utc).toBe('string');
  expect(typeof result.weekday).toBe('string');
  expect(typeof result.date).toBe('string');
  expect(new Date(result.utc).getTime()).toBeGreaterThan(0);
});

test('evalMathTool evaluates arithmetic with precedence and parentheses', async () => {
  expect(await evalMathTool.execute({ expression: '3 + 5 * 2' })).toBe('13');
  expect(await evalMathTool.execute({ expression: '(3 + 5) * 2' })).toBe('16');
  expect(await evalMathTool.execute({ expression: '2 ^ 3' })).toBe('8');
  expect(await evalMathTool.execute({ expression: 'sqrt(144) + abs(-6)' })).toBe('18');
  expect(Number(await evalMathTool.execute({ expression: 'pi * 2' }))).toBeCloseTo(Math.PI * 2);
});

test('evalMathTool handles errors safely', async () => {
  expect(await evalMathTool.execute({})).toBe('Error: expression is required');
  expect(await evalMathTool.execute({ expression: '10 / 0' })).toBe('Math error: division by zero');
  expect(await evalMathTool.execute({ expression: 'alert(1)' })).toBe('Math error: unknown function: alert');
  expect(await evalMathTool.execute({ expression: '2 + (3 * 4' })).toBe('Math error: missing closing parenthesis');
});

test('wikipedia_search validates query parameter', async () => {
  expect(await wikipediaSearchTool.execute({})).toBe('Error: query is required');
  expect(await wikipediaSearchTool.execute({ query: '   ' })).toBe('Error: query is required');
});

test('fetch_page validates URL and scheme', async () => {
  expect(await fetchPageTool.execute({})).toBe('Error: url is required');
  expect(await fetchPageTool.execute({ url: 'not-a-url' })).toBe('Error: invalid URL');
  expect(await fetchPageTool.execute({ url: 'file:///etc/passwd' })).toBe(
    'Error: only http and https URLs are allowed',
  );
});

test('fetch_page strips HTML tags and scripts from page', async () => {
  const server = Bun.serve({
    port: 3929,
    fetch() {
      return new Response(
        '<html><head><script>alert(1)</script><style>body{color:red}</style></head><body><h1>Hello</h1><p>world</p></body></html>',
        { headers: { 'Content-Type': 'text/html' } },
      );
    },
  });

  try {
    const text = await fetchPageTool.execute({ url: 'http://127.0.0.1:3929' });
    expect(text).toBe('Hello world');
  } finally {
    server.stop();
  }
});

test('createChannelHistoryTool reads messages from channel', async () => {
  const fakeChannel = {
    messages: {
      fetch: async ({ limit }: { limit: number }) => ({
        values: () =>
          [
            { author: { displayName: 'Alice' }, content: 'first message' },
            { author: { username: 'Bob' }, content: 'second message' },
          ].slice(0, limit)[Symbol.iterator](),
      }),
    },
  };

  const tool = createChannelHistoryTool(fakeChannel);
  const result = await tool.execute({ limit: 5 });
  expect(result).toBe('Bob: second message\nAlice: first message');
});

test('createChannelHistoryTool handles unsupported channel types gracefully', async () => {
  const tool = createChannelHistoryTool(null);
  expect(await tool.execute({})).toBe('Error: channel does not support reading message history');
});

test('webSearchTool requires query', async () => {
  expect(await webSearchTool.execute({})).toBe('Error: query is required');
  expect(await webSearchTool.execute({ query: '   ' })).toBe('Error: query is required');
});

test('webSearchTool falls back to Wikipedia when neither Brave nor SearXNG configured', async () => {
  const origBrave = process.env.BRAVE_API_KEY;
  const origSearxng = process.env.SEARXNG_URL;
  delete process.env.BRAVE_API_KEY;
  delete process.env.SEARXNG_URL;

  const res = await webSearchTool.execute({ query: 'Bun (software)' });
  expect(res).toContain('neither BRAVE_API_KEY nor SEARXNG_URL configured');
  expect(res).toContain('Bun');

  if (origBrave) process.env.BRAVE_API_KEY = origBrave;
  if (origSearxng) process.env.SEARXNG_URL = origSearxng;
});
