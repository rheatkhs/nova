import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Message,
  type MessageMentionOptions,
  type SendableChannels,
} from 'discord.js';
import type { Chat, ChatMessage } from './ai.ts';
import { chunk } from './chunk.ts';
import type { ConversationMemory } from './memory.ts';
import { createQueue, type TaskQueue } from './queue.ts';

export interface BotStats {
  answered: number;
  failed: number;
}

export interface BotDeps {
  chat: Chat;
  memory: ConversationMemory;
  /** Channels where the bot answers every message, no mention needed. */
  aiChannels: ReadonlySet<string>;
  /** Mutated in place; read by the status API. */
  stats: BotStats;
}

/** Model output must never ping @everyone, roles, or users. */
const NO_PINGS: MessageMentionOptions = { parse: [], repliedUser: false };
/** Discord's typing indicator lasts ~10s. */
const TYPING_REFRESH_MS = 8_000;

export function createBot(deps: BotDeps): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel], // required to receive DMs
  });
  const queue = createQueue();

  client.once(Events.ClientReady, (c) => console.log(`Logged in as ${c.user.tag}`));
  client.on(Events.MessageCreate, (msg) => void handleMessage(msg, deps, queue).catch(console.error));
  return client;
}

async function handleMessage(msg: Message, deps: BotDeps, queue: TaskQueue): Promise<void> {
  const botId = msg.client.user.id;
  if (msg.author.bot || !msg.channel.isSendable()) return;

  const addressed =
    !msg.inGuild() || // DM
    deps.aiChannels.has(msg.channelId) ||
    msg.mentions.users.has(botId) ||
    msg.mentions.repliedUser?.id === botId;
  if (!addressed) return;

  const text = msg.content.replace(new RegExp(`<@!?${botId}>`, 'g'), '').trim();
  if (!text) return;

  const channel = msg.channel;
  await queue(msg.channelId, async () => {
    const question: ChatMessage = { role: 'user', content: `${msg.author.displayName}: ${text}` };
    let answer: string;
    try {
      answer = await withTyping(channel, () => deps.chat([...deps.memory.get(msg.channelId), question]));
    } catch (err) {
      deps.stats.failed++;
      console.error(err);
      await msg.reply({ content: 'AI request failed, try again later.', allowedMentions: NO_PINGS });
      return;
    }

    try {
      await sendAnswer(msg, channel, answer);
    } catch (err) {
      deps.stats.failed++;
      throw err;
    }
    deps.memory.append(msg.channelId, question, { role: 'assistant', content: answer });
    deps.stats.answered++;
  });
}

async function withTyping<T>(channel: SendableChannels, task: () => Promise<T>): Promise<T> {
  const ping = () => void channel.sendTyping().catch(() => {});
  ping();
  const timer = setInterval(ping, TYPING_REFRESH_MS);
  try {
    return await task();
  } finally {
    clearInterval(timer);
  }
}

async function sendAnswer(msg: Message, channel: SendableChannels, answer: string): Promise<void> {
  const [first, ...rest] = chunk(answer);
  await msg.reply({ content: first ?? '', allowedMentions: NO_PINGS });
  for (const part of rest) await channel.send({ content: part, allowedMentions: NO_PINGS });
}
