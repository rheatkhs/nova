import { expect, test } from 'bun:test';
import { createChannelHistoryTool, createPollTool, evalMathTool, evaluateMath, fetchPageTool, getCurrentTimeTool, getSandboxSnippet, renderChartTool, renderHtmlTool, webSearchTool, wikipediaSearchTool } from './tools.ts';

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
  const server = Bun.serve({
    port: 3949,
    fetch() {
      return Response.json({
        query: {
          search: [{ title: 'Bun (software)', snippet: 'A fast all-in-one JavaScript runtime' }],
        },
      });
    },
  });

  const origBrave = process.env.BRAVE_API_KEY;
  const origSearxng = process.env.SEARXNG_URL;
  const origWiki = process.env.WIKIPEDIA_BASE_URL;
  delete process.env.BRAVE_API_KEY;
  delete process.env.SEARXNG_URL;
  process.env.WIKIPEDIA_BASE_URL = 'http://127.0.0.1:3949';

  try {
    const res = await webSearchTool.execute({ query: 'Bun (software)' });
    expect(res).toContain('neither BRAVE_API_KEY nor SEARXNG_URL configured');
    expect(res).toContain('Bun (software)');
  } finally {
    if (origBrave) process.env.BRAVE_API_KEY = origBrave;
    if (origSearxng) process.env.SEARXNG_URL = origSearxng;
    if (origWiki) process.env.WIKIPEDIA_BASE_URL = origWiki;
    else delete process.env.WIKIPEDIA_BASE_URL;
    server.stop();
  }
});

test('renderChartTool validates labels and data arrays', async () => {
  expect(await renderChartTool.execute({ labels: [], data: [] })).toBe('Error: labels and data arrays cannot be empty');
  expect(await renderChartTool.execute({ labels: ['A'], data: [1, 2] })).toBe(
    'Error: labels count (1) must match data count (2)',
  );
});

test('renderChartTool generates a valid QuickChart URL', async () => {
  const res = await renderChartTool.execute({
    type: 'bar',
    title: 'Adoption Rate',
    labels: ['Q1', 'Q2', 'Q3'],
    data: [10, 20, 30],
    datasetLabel: 'Growth',
  });
  expect(res).toContain('[Chart generated: Adoption Rate]');
  expect(res).toContain('https://quickchart.io/chart?c=');
  expect(res).toContain('bkg=%23181a20');
});

test('createPollTool validates options count and question', async () => {
  expect(await createPollTool.execute({ question: '', options: ['A', 'B'] })).toBe('Error: question is required');
  expect(await createPollTool.execute({ question: 'Fav language?', options: ['Rust'] })).toBe(
    'Error: a poll requires at least 2 options',
  );
  const tooMany = Array.from({ length: 11 }, (_, i) => `Opt ${i}`);
  expect(await createPollTool.execute({ question: 'Too many?', options: tooMany })).toBe(
    'Error: maximum 10 options allowed',
  );
});

test('createPollTool formats clean numbered poll block', async () => {
  const poll = await createPollTool.execute({
    question: 'Best JavaScript Runtime?',
    options: ['Bun', 'Node.js', 'Deno'],
  });
  expect(poll).toContain('📊 **POLL: Best JavaScript Runtime?**');
  expect(poll).toContain('1️⃣ Bun');
  expect(poll).toContain('2️⃣ Node.js');
  expect(poll).toContain('3️⃣ Deno');
  expect(poll).toContain('React below with the corresponding number emoji to vote!');
});

test('renderHtmlTool validates html parameter', async () => {
  expect(await renderHtmlTool.execute({})).toBe('Error: html content is required');
  expect(await renderHtmlTool.execute({ html: '   ' })).toBe('Error: html content is required');
});

test('renderHtmlTool generates live preview URL and stores snippet in sandbox', async () => {
  const output = await renderHtmlTool.execute({
    title: 'Counter App',
    html: '<button onclick="alert(1)">Click</button>',
  });

  expect(output).toContain('[Live Webpage Preview: Counter App]');
  expect(output).toContain('/view/');

  const idMatch = output.match(/\/view\/([a-z0-9]+)/);
  expect(idMatch).not.toBeNull();
  const id = idMatch![1]!;

  const snippet = getSandboxSnippet(id);
  expect(snippet).toBeDefined();
  expect(snippet?.title).toBe('Counter App');
  expect(snippet?.html).toContain('<button onclick="alert(1)">Click</button>');
  expect(snippet?.html).toContain('<!DOCTYPE html>');
});
