import { expect, test } from 'bun:test';
import type { Client } from 'discord.js';
import { createServer } from './server.ts';
import { ConversationMemory } from './memory.ts';

interface StatsResponse {
  ready: boolean;
  uptimeSec: number;
  guilds: number;
  pingMs: number;
  model: string;
  answered: number;
  failed: number;
  toolCalls: number;
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
    stats: { answered: 0, failed: 0, toolCalls: 0 },
    model: 'test-model',
  });
  const resUnready = await unreadyApp.handle(new Request('http://localhost/health'));
  expect(resUnready.status).toBe(503);

  const readyApp = createServer({
    client: mockClient(true),
    memory,
    stats: { answered: 0, failed: 0, toolCalls: 0 },
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
    stats: { answered: 0, failed: 0, toolCalls: 0 },
    model: 'test-model',
  });
  const res = await app.handle(new Request('http://localhost/health'));
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ ok: false, error: 'sqlite database inaccessible' });
});

test('GET /stats returns full metrics including memory and tool calls', async () => {
  const memory = new ConversationMemory(10, ':memory:');
  memory.append('c1', { role: 'user', content: 'hi' });

  const app = createServer({
    client: mockClient(true, 3, 25),
    memory,
    stats: { answered: 10, failed: 2, toolCalls: 7 },
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
  expect(data.memory).toEqual({ totalMessages: 1, channels: 1 });
  memory.close();
});
