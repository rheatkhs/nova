import { expect, test } from 'bun:test';
import { chunk, detectLanguage, tagCodeFences } from './chunk.ts';
import { extractCodeSnippet, formatFooter, generateSpeechAudio, toolLabel } from './bot.ts';

test('chunk respects limit and preserves content', () => {
  expect(chunk('')).toEqual([]);
  expect(chunk('short')).toEqual(['short']);
  expect(chunk('aaa bbb ccc', 7)).toEqual(['aaa bbb', 'ccc']);
  expect(chunk('aaa\nbbb ccc', 9)).toEqual(['aaa', 'bbb ccc']);
  expect(chunk('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']); // no break point: hard cut

  const long = Array.from({ length: 500 }, (_, i) => `word${i}`).join(' ');
  const parts = chunk(long);
  expect(parts.length).toBeGreaterThan(1);
  expect(parts.every((p) => p.length <= 2000)).toBe(true);
  expect(parts.join(' ')).toBe(long);
});

test('re-closes and re-opens fenced code blocks across splits', () => {
  const code = '```ts\nconst a = 1;\nconst b = 2;\n```';
  // Cut roughly between line 1 and line 2.
  const parts = chunk(code, 30);
  expect(parts.length).toBe(2);

  // First part ends with closed fence.
  expect(parts[0]?.endsWith('```')).toBe(true);
  // Second part starts with reopened fence with same language.
  expect(parts[1]?.startsWith('```ts\n')).toBe(true);
  expect(parts[1]?.endsWith('```')).toBe(true);
});

test('handles bare code fences without language tag', () => {
  const code = '```\nline 1\nline 2\n```';
  const parts = chunk(code, 18);
  expect(parts.length).toBe(2);
  expect(parts[0]?.endsWith('```')).toBe(true);
  expect(parts[1]?.startsWith('```\n')).toBe(true);
});

test('does not mangle code blocks that fit entirely within one chunk', () => {
  const code = 'before\n```ts\nconst x = 1;\n```\nafter';
  expect(chunk(code, 100)).toEqual([code]);
});

test('formatFooter produces clean subtext with model, latency, and tools', () => {
  expect(formatFooter()).toBe('');
  expect(formatFooter({ model: 'gpt-4o', latencyMs: 250 })).toBe('\n\n-# ⚡ `gpt-4o` • ⏱️ 250ms');
  expect(
    formatFooter({ model: 'claude', latencyMs: 320, toolsUsed: ['web_search', 'web_search', 'eval_math'] }),
  ).toBe('\n\n-# ⚡ `claude` • ⏱️ 320ms • 🔎 web_search • 🔢 eval_math');
  expect(toolLabel('web_search')).toBe('Searching the web');
  expect(toolLabel('render_chart')).toBe('Generating visual chart');
});

test('detectLanguage correctly identifies languages from snippets', () => {
  expect(detectLanguage('{"hello": "world"}')).toBe('json');
  expect(detectLanguage('def test():\n    print("ok")')).toBe('py');
  expect(detectLanguage('const x = 5;\nconsole.log(x);')).toBe('ts');
  expect(detectLanguage('SELECT * FROM users;')).toBe('sql');
  expect(detectLanguage('curl -s http://localhost:3000')).toBe('bash');
  expect(detectLanguage('plain English notes without syntax')).toBeNull();
});

test('tagCodeFences tags bare code fences automatically', () => {
  const bare = '```\nconst a = 1;\nconsole.log(a);\n```';
  expect(tagCodeFences(bare)).toBe('```ts\nconst a = 1;\nconsole.log(a);\n```');

  const alreadyTagged = '```py\nx = 1\n```';
  expect(tagCodeFences(alreadyTagged)).toBe('```py\nx = 1\n```');
});

test('extractCodeSnippet extracts code block and maps file extension', () => {
  expect(extractCodeSnippet('Plain text without code')).toBeNull();

  const pySnippet = extractCodeSnippet('Here is the script:\n```python\nprint("hello")\n```');
  expect(pySnippet?.ext).toBe('py');
  expect(pySnippet?.code).toBe('print("hello")');

  const rustSnippet = extractCodeSnippet('```rs\nfn main() {}\n```');
  expect(rustSnippet?.ext).toBe('rs');
  expect(rustSnippet?.code).toBe('fn main() {}');
});

test('generateSpeechAudio produces an audio buffer', async () => {
  const server = Bun.serve({
    port: 3955,
    fetch() {
      return new Response(Buffer.from('FAKE_MP3_DATA'), {
        headers: { 'Content-Type': 'audio/mpeg' },
      });
    },
  });

  // Mock fetch endpoint or test fallback
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(Buffer.from('FAKE_AUDIO'), { status: 200 });

  try {
    const buf = await generateSpeechAudio('Hello Discord!');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString()).toBe('FAKE_AUDIO');
  } finally {
    globalThis.fetch = origFetch;
    server.stop();
  }
});
