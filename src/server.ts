import type { Client } from 'discord.js';
import { Elysia } from 'elysia';
import type { BotStats } from './bot.ts';
import type { ConversationMemory } from './memory.ts';
import { renderDashboard } from './dashboard.ts';
import { getSandboxSnippet } from './tools.ts';

export interface ServerDeps {
  client: Client;
  memory: ConversationMemory;
  stats: Readonly<BotStats>;
  model: string;
}

/** Read-only status API for health checks and monitoring. */
export function createServer({ client, memory, stats, model }: ServerDeps) {
  return new Elysia()
    .get('/', ({ set }) => {
      set.headers['Content-Type'] = 'text/html; charset=utf-8';
      const memStats = memory.stats();
      return renderDashboard({
        ready: client.isReady(),
        model,
        uptimeSec: Math.floor(process.uptime()),
        guilds: client.guilds.cache.size,
        pingMs: client.ws.ping,
        answered: stats.answered,
        failed: stats.failed,
        toolCalls: stats.toolCalls,
        lastResponseMs: stats.lastResponseMs,
        totalMessages: memStats.totalMessages,
        channels: memStats.channels,
      });
    })
    .get('/view/:id', ({ params, set, status }) => {
      const snippet = getSandboxSnippet(params.id);
      if (!snippet) {
        return status(404, 'Preview not found or expired.');
      }
      set.headers['Content-Type'] = 'text/html; charset=utf-8';
      return snippet.html;
    })
    .get('/health', ({ status }) => {
      if (!client.isReady()) {
        return status(503, { ok: false, error: 'discord gateway disconnected' });
      }
      if (stats.consecutiveFailures >= 5) {
        return status(503, { ok: false, error: 'consecutive upstream ai failures' });
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
    }))
    .get('/metrics', ({ set }) => {
      set.headers['Content-Type'] = 'text/plain; version=0.0.4; charset=utf-8';
      const memStats = memory.stats();
      return [
        '# HELP nova_ready Whether the bot Discord gateway connection is ready',
        '# TYPE nova_ready gauge',
        `nova_ready ${client.isReady() ? 1 : 0}`,
        '',
        '# HELP nova_uptime_seconds Total seconds the process has been running',
        '# TYPE nova_uptime_seconds counter',
        `nova_uptime_seconds ${Math.floor(process.uptime())}`,
        '',
        '# HELP nova_guilds_count Number of Discord guilds the bot belongs to',
        '# TYPE nova_guilds_count gauge',
        `nova_guilds_count ${client.guilds.cache.size}`,
        '',
        '# HELP nova_ping_ms WebSocket ping latency in milliseconds',
        '# TYPE nova_ping_ms gauge',
        `nova_ping_ms ${client.ws.ping}`,
        '',
        '# HELP nova_messages_answered_total Cumulative count of successfully answered questions',
        '# TYPE nova_messages_answered_total counter',
        `nova_messages_answered_total ${stats.answered}`,
        '',
        '# HELP nova_messages_failed_total Cumulative count of failed requests',
        '# TYPE nova_messages_failed_total counter',
        `nova_messages_failed_total ${stats.failed}`,
        '',
        '# HELP nova_tool_calls_total Cumulative count of tool executions',
        '# TYPE nova_tool_calls_total counter',
        `nova_tool_calls_total ${stats.toolCalls}`,
        '',
        '# HELP nova_consecutive_failures Number of consecutive failed requests',
        '# TYPE nova_consecutive_failures gauge',
        `nova_consecutive_failures ${stats.consecutiveFailures}`,
        '',
        '# HELP nova_last_response_ms Round-trip duration of the last model response in ms',
        '# TYPE nova_last_response_ms gauge',
        `nova_last_response_ms ${stats.lastResponseMs}`,
        '',
        '# HELP nova_memory_messages_total Total messages stored in SQLite memory',
        '# TYPE nova_memory_messages_total gauge',
        `nova_memory_messages_total ${memStats.totalMessages}`,
        '',
        '# HELP nova_memory_channels_total Total unique channels tracked in SQLite memory',
        '# TYPE nova_memory_channels_total gauge',
        `nova_memory_channels_total ${memStats.channels}`,
        '',
      ].join('\n');
    });
}
