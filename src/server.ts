import type { Client } from 'discord.js';
import { Elysia } from 'elysia';
import type { BotStats } from './bot.ts';
import type { ConversationMemory } from './memory.ts';

export interface ServerDeps {
  client: Client;
  memory: ConversationMemory;
  stats: Readonly<BotStats>;
  model: string;
}

/** Read-only status API for health checks and monitoring. */
export function createServer({ client, memory, stats, model }: ServerDeps) {
  return new Elysia()
    .get('/health', ({ status }) => {
      if (!client.isReady()) {
        return status(503, { ok: false, error: 'discord gateway disconnected' });
      }
      try {
        memory.stats();
        return { ok: true };
      } catch {
        return status(503, { ok: false, error: 'sqlite database inaccessible' });
      }
    })
    .get('/stats', () => ({
      ready: client.isReady(),
      uptimeSec: Math.floor(process.uptime()),
      guilds: client.guilds.cache.size,
      pingMs: client.ws.ping,
      model,
      ...stats,
      memory: memory.stats(),
    }));
}
