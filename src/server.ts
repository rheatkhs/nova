import type { Client } from 'discord.js';
import { Elysia } from 'elysia';
import type { BotStats } from './bot.ts';

/** Read-only status API for health checks and monitoring. */
export function createServer(client: Client, stats: Readonly<BotStats>) {
  return new Elysia()
    .get('/health', ({ status }) => (client.isReady() ? { ok: true } : status(503, { ok: false })))
    .get('/stats', () => ({
      ready: client.isReady(),
      uptimeSec: Math.floor(process.uptime()),
      guilds: client.guilds.cache.size,
      pingMs: client.ws.ping,
      ...stats,
    }));
}
