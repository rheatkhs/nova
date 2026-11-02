import type { AiOptions } from './ai.ts';

export interface Config {
  discordToken: string;
  ai: AiOptions;
  aiChannels: ReadonlySet<string>;
  historyLimit: number;
  historyCharLimit: number;
  memoryPath: string;
  userCooldownMs: number;
  http: { hostname: string; port: number };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    discordToken: required(env, 'DISCORD_TOKEN'),
    ai: {
      baseUrl: env.AI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: env.AI_API_KEY || undefined,
      model: env.AI_MODEL || 'gpt-4o-mini',
      fallbackModel: env.AI_FALLBACK_MODEL?.trim() || undefined,
      systemPrompt: env.SYSTEM_PROMPT || 'You are Nova, a helpful Discord assistant. Keep answers concise.',
    },
    aiChannels: new Set((env.AI_CHANNELS ?? '').split(',').map((s) => s.trim()).filter(Boolean)),
    historyLimit: nonNegativeInt(env, 'HISTORY_LIMIT', 20),
    historyCharLimit: nonNegativeInt(env, 'HISTORY_CHAR_LIMIT', 12_000),
    memoryPath: env.MEMORY_PATH?.trim() || 'data/nova.db',
    userCooldownMs: nonNegativeInt(env, 'USER_COOLDOWN_SEC', 3) * 1_000,
    http: {
      hostname: env.HOST || '127.0.0.1',
      port: nonNegativeInt(env, 'PORT', 3000),
    },
  };
}

function nonNegativeInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const value = Number(env[key] || fallback);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative integer, got "${env[key]}"`);
  }
  return value;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing required env var ${key} (see .env.example)`);
  return value;
}

