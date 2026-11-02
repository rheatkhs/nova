import type { MessageMentionOptions } from 'discord.js';
import type { Chat } from '../ai.ts';
import type { ConversationMemory } from '../memory.ts';
import type { RateLimiter } from '../rate-limit.ts';

export interface BotStats {
  answered: number;
  failed: number;
  toolCalls: number;
  consecutiveFailures: number;
  lastResponseMs: number;
}

export interface BotDeps {
  chat: Chat;
  memory: ConversationMemory;
  /** Channels where the bot answers every message, no mention needed. */
  aiChannels: ReadonlySet<string>;
  /** Enforces minimum spacing between questions per user. */
  rateLimiter: RateLimiter;
  /** Maximum character budget across history before older messages are pruned. */
  historyCharLimit?: number;
  /** Mutated in place; read by the status API. */
  stats: BotStats;
}

export interface AnswerMeta {
  model: string;
  latencyMs: number;
  toolsUsed?: readonly string[];
  stepTraces?: readonly string[];
}

/** Model output must never ping @everyone, roles, or users. */
export const NO_PINGS: MessageMentionOptions = { parse: [], repliedUser: false };

/** Discord's typing indicator lasts ~10s. */
export const TYPING_REFRESH_MS = 8_000;
