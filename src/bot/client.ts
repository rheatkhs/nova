import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
} from 'discord.js';
import type { BotDeps } from './types.ts';
import { createQueue } from '../queue.ts';
import { BOT_COMMANDS } from './commands.ts';
import { updatePresence } from './presence.ts';
import { handleInteraction } from './interactions.ts';
import { handleMessage } from './messages.ts';
import { setupModeration } from './moderation.ts';
export function createBot(deps: BotDeps): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.Channel],
  });
  const queue = createQueue();
  setupModeration(client);
  client.once(Events.ClientReady, async (c) => {
    console.log(`Logged in as ${c.user.tag}`);
    updatePresence(client, deps.stats);
    try {
      await c.application.commands.set(BOT_COMMANDS);
      for (const guild of c.guilds.cache.values()) {
        await guild.commands.set(BOT_COMMANDS).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to register slash commands:', err);
    }
  });

  client.on(Events.GuildCreate, (guild) => {
    updatePresence(client, deps.stats);
    void guild.commands.set(BOT_COMMANDS).catch(() => {});
  });
  client.on(Events.GuildDelete, () => updatePresence(client, deps.stats));
  client.on(Events.MessageCreate, (msg) => void handleMessage(msg, deps, queue).catch(console.error));
  client.on(Events.InteractionCreate, (interaction) => void handleInteraction(interaction, deps).catch(console.error));

  return client;
}
