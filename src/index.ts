import { createChat } from './ai.ts';
import { createBot, type BotStats } from './bot.ts';
import { loadConfig } from './config.ts';
import { ConversationMemory } from './memory.ts';
import { createRateLimiter } from './rate-limit.ts';
import { createServer } from './server.ts';

const config = loadConfig();
const stats: BotStats = { answered: 0, failed: 0 };

const bot = createBot({
  chat: createChat(config.ai),
  memory: new ConversationMemory(config.historyLimit),
  aiChannels: config.aiChannels,
  rateLimiter: createRateLimiter(config.userCooldownMs),
  stats,
});

const server = createServer(bot, stats).listen(config.http);
console.log(`Status API on http://${server.server?.hostname}:${server.server?.port}`);

await bot.login(config.discordToken);
