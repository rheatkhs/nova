import { expect, test } from 'bun:test';
import { createChannelHistoryTool, createPollTool, createQuizTool, createReminderTool, evalMathTool, evaluateMath, fetchPageTool, generateImageTool, getCurrentTimeTool, getQuizItem, getSandboxSnippet, playSpotifyTool, renderChartTool, renderDiagramTool, renderHtmlTool, runCodeTool, testWebhookTool, webSearchTool, wikipediaSearchTool } from './tools.ts';

test('get_current_time returns valid UTC date info', async () => {
  const result = JSON.parse(await getCurrentTimeTool.execute({}));
  expect(typeof result.utc).toBe('string');
  expect(typeof result.weekday).toBe('string');
  expect(typeof result.date).toBe('string');
  expect(new Date(result.utc).getTime()).toBeGreaterThan(0);
});

test('evalMathTool evaluates arithmetic with precedence and parentheses', async () => {
  expect(await evalMathTool.execute({ expression: '3 + 5 * 2' })).toContain('13');
  expect(await evalMathTool.execute({ expression: '(3 + 5) * 2' })).toContain('16');
  expect(await evalMathTool.execute({ expression: '2 ^ 3' })).toContain('8');
  expect(await evalMathTool.execute({ expression: 'sqrt(144) + abs(-6)' })).toContain('18');
});

test('evalMathTool handles errors safely', async () => {
  expect(await evalMathTool.execute({})).toBe('Error: expression or latex is required');
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

test('renderDiagramTool validates syntax and strips code fences', async () => {
  expect(await renderDiagramTool.execute({})).toBe('Error: syntax is required');
  expect(await renderDiagramTool.execute({ syntax: '   ' })).toBe('Error: syntax is required');

  const output = await renderDiagramTool.execute({
    title: 'Architecture',
    syntax: '```mermaid\ngraph TD\n  Client --> Server\n```',
  });

  expect(output).toContain('[Diagram rendered: Architecture]');
  expect(output).toContain('https://mermaid.ink/img/');
  expect(output).toContain('bgColor=181a20');
  expect(output).toContain('```mermaid\ngraph TD\n  Client --> Server\n```');
});

test('createQuizTool validates options count and correctIndex', async () => {
  expect(await createQuizTool.execute({ question: '', options: ['A', 'B'], correctIndex: 0 })).toBe(
    'Error: question is required',
  );
  expect(await createQuizTool.execute({ question: 'Q', options: ['A'], correctIndex: 0 })).toBe(
    'Error: quiz must have between 2 and 4 options',
  );
  expect(await createQuizTool.execute({ question: 'Q', options: ['A', 'B'], correctIndex: 5 })).toBe(
    'Error: correctIndex must be between 0 and 1',
  );
});

test('createQuizTool stores quiz in QUIZ_STORE and returns quiz formatted text', async () => {
  const output = await createQuizTool.execute({
    question: 'What is 2+2?',
    options: ['3', '4', '5'],
    correctIndex: 1,
    explanation: 'Basic arithmetic: 2 plus 2 equals 4.',
  });

  expect(output).toContain('[QUIZ:');
  expect(output).toContain('🧠 **QUIZ: What is 2+2?**');
  expect(output).toContain('**A.** 3');
  expect(output).toContain('**B.** 4');

  const idMatch = output.match(/\[QUIZ:([a-z0-9]+)\]/);
  expect(idMatch).not.toBeNull();
  const id = idMatch![1]!;

  const item = getQuizItem(id);
  expect(item).toBeDefined();
  expect(item?.question).toBe('What is 2+2?');
  expect(item?.correctIndex).toBe(1);
  expect(item?.explanation).toBe('Basic arithmetic: 2 plus 2 equals 4.');
});

test('generateImageTool validates prompt and formats Pollinations URL with aspect ratio', async () => {
  expect(await generateImageTool.execute({})).toBe('Error: prompt is required');
  expect(await generateImageTool.execute({ prompt: '   ' })).toBe('Error: prompt is required');

  const resLandscape = await generateImageTool.execute({ prompt: 'Cyberpunk city', aspectRatio: 'landscape' });
  expect(resLandscape).toContain('https://image.pollinations.ai/prompt/Cyberpunk%20city');
  expect(resLandscape).toContain('width=768&height=512');

  const resSquare = await generateImageTool.execute({ prompt: 'Cute cat', aspectRatio: 'square' });
  expect(resSquare).toContain('width=512&height=512');

  const resPortrait = await generateImageTool.execute({ prompt: 'Tall tower', aspectRatio: 'portrait' });
  expect(resPortrait).toContain('width=512&height=768');
});

test('createReminderTool validates parameters and schedules timer', async () => {
  const sentMessages: string[] = [];
  const fakeChannel = {
    send: async (opt: { content: string }) => {
      sentMessages.push(opt.content);
    },
  };

  const tool = createReminderTool(fakeChannel, 'user-123');

  expect(await tool.execute({ seconds: 1, note: '' })).toBe('Error: note is required');
  expect(await tool.execute({ seconds: 2, note: 'Wake up' })).toBe(
    'Error: seconds must be a positive number of at least 5',
  );

  const res = await tool.execute({ seconds: 10, note: 'Stand up and stretch' });
  expect(res).toContain('[Reminder scheduled]');
  expect(res).toContain('10 second(s)');
  expect(res).toContain('Stand up and stretch');
});

test('testWebhookTool validates URL, restricts loopback addresses, and tests public endpoints', async () => {
  expect(await testWebhookTool.execute({})).toBe('Error: url is required');
  expect(await testWebhookTool.execute({ url: 'not-a-valid-url' })).toBe('Error: invalid URL format');
  expect(await testWebhookTool.execute({ url: 'http://localhost:3000' })).toBe(
    'Error: local loopback and private network addresses are restricted',
  );
  expect(await testWebhookTool.execute({ url: 'http://127.0.0.1:8080' })).toBe(
    'Error: local loopback and private network addresses are restricted',
  );
  expect(await testWebhookTool.execute({ url: 'http://192.168.1.1' })).toBe(
    'Error: local loopback and private network addresses are restricted',
  );

  // Mock public server test
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    return new Response(JSON.stringify({ status: 'delivered', id: 123 }), {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  try {
    const res = await testWebhookTool.execute({
      url: 'https://example.com/api/webhook',
      method: 'POST',
      payload: '{"event":"ping"}',
    });
    expect(res).toContain('[Webhook Test Result]');
    expect(res).toContain('200 OK');
    expect(res).toContain('https://example.com/api/webhook');
    expect(res).toContain('POST');
    expect(res).toContain('delivered');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('runCodeTool validates input and executes JavaScript in Bun subprocess', async () => {
  expect(await runCodeTool.execute({})).toBe('Error: code is required');
  expect(await runCodeTool.execute({ code: '   ' })).toBe('Error: code is required');

  const res = await runCodeTool.execute({
    code: 'const nums = [1, 2, 3]; console.log(nums.map(x => x * 10).join(", "));',
  });

  expect(res).toContain('[Code Execution Result');
  expect(res).toContain('Exit code: 0');
  expect(res).toContain('10, 20, 30');
});

test('runCodeTool handles syntax errors and stderr output', async () => {
  const res = await runCodeTool.execute({
    code: 'console.error("Test error trace"); process.exit(1);',
  });

  expect(res).toContain('Exit code: 1');
  expect(res).toContain('Test error trace');
});

test('playSpotifyTool validates query and searches iTunes/Spotify mock', async () => {
  expect(await playSpotifyTool.execute({})).toBe('Error: query is required');
  expect(await playSpotifyTool.execute({ query: '   ' })).toBe('Error: query is required');

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return Response.json({
      results: [
        {
          trackName: 'Shape of You',
          artistName: 'Ed Sheeran',
          collectionName: '÷',
          previewUrl: 'https://audio.preview.com/shape.m4a',
          artworkUrl100: 'https://artwork.com/100x100bb.jpg',
          trackTimeMillis: 233000,
        },
      ],
    });
  }) as unknown as typeof fetch;

  try {
    const res = await playSpotifyTool.execute({ query: 'Shape of You' });
    expect(res).toContain('Shape of You');
    expect(res).toContain('Ed Sheeran');
    expect(res).toContain('÷');
    expect(res).toContain('https://audio.preview.com/shape.m4a');
  } finally {
    globalThis.fetch = origFetch;
  }
});
