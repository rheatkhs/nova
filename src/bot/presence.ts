import { ActivityType, type Client } from 'discord.js';
import type { BotStats } from './types.ts';

/** Updates Discord rich presence activity to reflect a professional status. */
export function updatePresence(client: Client, _stats: BotStats): void {
  client.user?.setPresence({
    activities: [
      {
        name: '✨ Nova AI & Music • /help',
        type: ActivityType.Listening,
      },
    ],
    status: 'online',
  });
}
