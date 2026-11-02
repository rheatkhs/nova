import { ActivityType, type Client } from 'discord.js';
import type { BotStats } from './types.ts';

/** Updates Discord rich presence activity to reflect server count and answers. */
export function updatePresence(client: Client, stats: BotStats): void {
  const servers = client.guilds.cache.size;
  const serverText = servers === 1 ? '1 server' : `${servers} servers`;
  const answered = stats.answered;
  const statusText = answered > 0
    ? `${serverText} • ${answered} answers • /help`
    : `${serverText} • /help`;

  client.user?.setActivity(statusText, { type: ActivityType.Watching });
}
