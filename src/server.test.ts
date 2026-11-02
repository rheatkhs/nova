import { expect, test } from 'bun:test';
import type { Client } from 'discord.js';
import { createServer } from './server.ts';
import { ConversationMemory } from './memory.ts';
import { renderHtmlTool } from './tools.ts';
import { events } from './events.ts';

interface StatsResponse {
  ready: boolean;
  uptimeSec: number;
  guilds: number;
  pingMs: number;
  model: string;
  answered: number;
  failed: number;
  toolCalls: number;
  consecutiveFailures: number;
  lastResponseMs: number;
  memory: { totalMessages: number; channels: number };
}

function mockClient(ready: boolean, guilds = 0, ping = 0): Client {
  return {
    isReady: () => ready,
    guilds: { cache: { size: guilds } },
    ws: { ping },
  } as unknown as Client; // Test mock covering only the status routes
}

test('GET /health returns 200 when ready and 503 when not', async () => {
  const memory = new ConversationMemory(10, ':memory:');

  const unreadyApp = createServer({
    client: mockClient(false),
    memory,
    stats: { answered: 0, failed: 0, toolCalls: 0, consecutiveFailures: 0, lastResponseMs: 0 },
    model: 'test-model',
  });
  const resUnready = await unreadyApp.handle(new Request('http://localhost/health'));
  expect(resUnready.status).toBe(503);

  const readyApp = createServer({
    client: mockClient(true),
    memory,
    stats: { answered: 0, failed: 0, toolCalls: 0, consecutiveFailures: 0, lastResponseMs: 0 },
    model: 'test-model',
  });
  const resReady = await readyApp.handle(new Request('http://localhost/health'));
  expect(resReady.status).toBe(200);
  expect(await resReady.json()).toEqual({ ok: true });
  memory.close();
});

test('GET /health returns 503 when database is inaccessible', async () => {
  const brokenMemory = {
    stats: () => {
      throw new Error('disk I/O error');
    },
  } as unknown as ConversationMemory;

  const app = createServer({
    client: mockClient(true),
    memory: brokenMemory,
    stats: { answered: 0, failed: 0, toolCalls: 0, consecutiveFailures: 0, lastResponseMs: 0 },
    model: 'test-model',
  });
  const res = await app.handle(new Request('http://localhost/health'));
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ ok: false, error: 'sqlite database inaccessible' });
});

test('GET /health returns 503 when consecutiveFailures >= 5', async () => {
  const memory = new ConversationMemory(10, ':memory:');
  const app = createServer({
    client: mockClient(true),
    memory,
    stats: { answered: 10, failed: 5, toolCalls: 0, consecutiveFailures: 5, lastResponseMs: 0 },
    model: 'test-model',
  });
  const res = await app.handle(new Request('http://localhost/health'));
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ ok: false, error: 'consecutive upstream ai failures' });
  memory.close();
});

test('GET /stats returns full metrics including memory and tool calls', async () => {
  const memory = new ConversationMemory(10, ':memory:');
  memory.append('c1', { role: 'user', content: 'hi' });

  const app = createServer({
    client: mockClient(true, 3, 25),
    memory,
    stats: { answered: 10, failed: 2, toolCalls: 7, consecutiveFailures: 0, lastResponseMs: 145 },
    model: 'gpt-4o-mini',
  });

  const res = await app.handle(new Request('http://localhost/stats'));
  expect(res.status).toBe(200);
  const data = (await res.json()) as StatsResponse;

  expect(data.ready).toBe(true);
  expect(data.guilds).toBe(3);
  expect(data.pingMs).toBe(25);
  expect(data.model).toBe('gpt-4o-mini');
  expect(data.answered).toBe(10);
  expect(data.failed).toBe(2);
  expect(data.toolCalls).toBe(7);
  expect(data.consecutiveFailures).toBe(0);
  expect(data.lastResponseMs).toBe(145);
  expect(data.memory).toEqual({ totalMessages: 1, channels: 1 });
  memory.close();
});

test('GET /metrics returns Prometheus formatted exposition text', async () => {
  const memory = new ConversationMemory(10, ':memory:');
  memory.append('c1', { role: 'user', content: 'test' });

  const app = createServer({
    client: mockClient(true, 5, 20),
    memory,
    stats: { answered: 15, failed: 1, toolCalls: 8, consecutiveFailures: 0, lastResponseMs: 250 },
    model: 'gpt-4o-mini',
  });

  const res = await app.handle(new Request('http://localhost/metrics'));
  expect(res.status).toBe(200);
  expect(res.headers.get('Content-Type')).toContain('text/plain');

  const text = await res.text();
  expect(text).toContain('nova_ready 1');
  expect(text).toContain('nova_guilds_count 5');
  expect(text).toContain('nova_ping_ms 20');
  expect(text).toContain('nova_messages_answered_total 15');
  expect(text).toContain('nova_messages_failed_total 1');
  expect(text).toContain('nova_tool_calls_total 8');
  expect(text).toContain('nova_last_response_ms 250');
  expect(text).toContain('nova_memory_messages_total 1');
  expect(text).toContain('nova_memory_channels_total 1');
  memory.close();
});

test('GET / renders HTML dark-mode dashboard', async () => {
  const memory = new ConversationMemory(10, ':memory:');
  const app = createServer({
    client: mockClient(true, 2, 18),
    memory,
    stats: { answered: 20, failed: 0, toolCalls: 5, consecutiveFailures: 0, lastResponseMs: 180 },
    model: 'ag/gemini-3.8-flash',
  });

  const res = await app.handle(new Request('http://localhost/'));
  expect(res.status).toBe(200);
  expect(res.headers.get('Content-Type')).toContain('text/html');

  const html = await res.text();
  expect(html).toContain('Nova AI');
  expect(html).toContain('ONLINE');
  expect(html).toContain('ag/gemini-3.8-flash');
  expect(html).toContain('Questions Answered');
  expect(html).toContain('20');
  memory.close();
});

test('GET /view/:id serves sandbox snippet HTML and 404 when missing', async () => {
  const memory = new ConversationMemory(10, ':memory:');
  const app = createServer({
    client: mockClient(true),
    memory,
    stats: { answered: 0, failed: 0, toolCalls: 0, consecutiveFailures: 0, lastResponseMs: 0 },
    model: 'test-model',
  });

  // Missing snippet
  const resNotFound = await app.handle(new Request('http://localhost/view/nonexistent-id'));
  expect(resNotFound.status).toBe(404);

  // Stored snippet via tool
  const out = await renderHtmlTool.execute({ title: 'Game', html: '<h1>Pong</h1>' });
  const id = out.match(/\/view\/([a-z0-9]+)/)![1];

  const resFound = await app.handle(new Request(`http://localhost/view/${id}`));
  expect(resFound.status).toBe(200);
  expect(resFound.headers.get('Content-Type')).toContain('text/html');
  expect(await resFound.text()).toContain('<h1>Pong</h1>');
  memory.close();
});

test('GET /events streams SSE events', async () => {
  const memory = new ConversationMemory(10, ':memory:');
  const app = createServer({
    client: mockClient(true),
    memory,
    stats: { answered: 0, failed: 0, toolCalls: 0, consecutiveFailures: 0, lastResponseMs: 0 },
    model: 'test-model',
  });

  events.broadcast('info', 'Daemon booted successfully');
  const res = await app.handle(new Request('http://localhost/events'));
  expect(res.status).toBe(200);
  expect(res.headers.get('Content-Type')).toBe('text/event-stream');

  const reader = res.body?.getReader();
  expect(reader).toBeDefined();
  const chunk = await reader!.read();
  const text = new TextDecoder().decode(chunk.value);
  expect(text).toContain('data: ');
  expect(text).toContain('"type":');
  reader!.cancel();
  memory.close();
});

test('GET /tester renders HTTP request builder page', async () => {
  const memory = new ConversationMemory(10, ':memory:');
  const app = createServer({
    client: mockClient(true),
    memory,
    stats: { answered: 0, failed: 0, toolCalls: 0, consecutiveFailures: 0, lastResponseMs: 0 },
    model: 'test-model',
  });

  const res = await app.handle(new Request('http://localhost/tester'));
  expect(res.status).toBe(200);
  expect(res.headers.get('Content-Type')).toContain('text/html');
  expect(await res.text()).toContain('Webhook & API Tester');
  memory.close();
});

test('POST /api/test-webhook restricts loopback addresses and tests endpoints', async () => {
  const memory = new ConversationMemory(10, ':memory:');
  const app = createServer({
    client: mockClient(true),
    memory,
    stats: { answered: 0, failed: 0, toolCalls: 0, consecutiveFailures: 0, lastResponseMs: 0 },
    model: 'test-model',
  });

  // Block loopback
  const resLoopback = await app.handle(
    new Request('http://localhost/api/test-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://localhost:3000/health' }),
    }),
  );
  expect(resLoopback.status).toBe(400);
  expect(await resLoopback.json()).toEqual({ ok: false, error: 'loopback and private network IPs restricted' });
  memory.close();
});
