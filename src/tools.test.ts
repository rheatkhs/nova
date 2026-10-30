import { expect, test } from 'bun:test';
import { fetchPageTool, getCurrentTimeTool, wikipediaSearchTool } from './tools.ts';

test('get_current_time returns valid UTC date info', async () => {
  const result = JSON.parse(await getCurrentTimeTool.execute({}));
  expect(typeof result.utc).toBe('string');
  expect(typeof result.weekday).toBe('string');
  expect(typeof result.date).toBe('string');
  expect(new Date(result.utc).getTime()).toBeGreaterThan(0);
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
