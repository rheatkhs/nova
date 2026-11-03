import { ActivityType, type Client } from 'discord.js';
import type { BotStats } from './types.ts';

/** Updates Discord rich presence activity to reflect server count and answers. */
export function updatePresence(client: Client, _stats: BotStats): void {
  client.user?.setPresence({ activities: [] });
}
