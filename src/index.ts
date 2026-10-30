import { createChat } from './ai.ts';
import { createBot, type BotStats } from './bot.ts';
import { loadConfig } from './config.ts';
import { ConversationMemory } from './memory.ts';
import { createRateLimiter } from './rate-limit.ts';
import { createServer } from './server.ts';

const config = loadConfig();
const stats: BotStats = { answered: 0, failed: 0 };
const memory = new ConversationMemory(config.historyLimit, config.memoryPath);
const bot = createBot({
  chat: createChat(config.ai),
  memory,
  aiChannels: config.aiChannels,
  rateLimiter: createRateLimiter(config.userCooldownMs),
  stats,
});

const server = createServer(bot, stats).listen(config.http);
console.log(`Status API on http://${server.server?.hostname}:${server.server?.port}`);

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    console.log(`Received ${signal}, shutting down...`);
    void Promise.allSettled([server.stop(), bot.destroy()]).then(() => {
      try { memory.close(); } catch {}
      process.exit(0);
    });
  });
}

await bot.login(config.discordToken);
