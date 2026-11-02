import type { Tool } from './types.ts';

/** Creates a channel-scoped tool that allows the agent to inspect recent Discord chat. */
export function createChannelHistoryTool(channel: unknown): Tool {
  return {
    name: 'read_channel_history',
    description: 'Read recent messages from the current Discord channel to inspect prior conversation.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of recent messages to read (1 to 20, default 10)' },
      },
    },
    async execute(args): Promise<string> {
      if (!channel || typeof channel !== 'object' || !('messages' in channel)) {
        return 'Error: channel does not support reading message history';
      }
      const ch = channel as {
        messages: {
          fetch: (opt: { limit: number }) => Promise<{
            values?: () => IterableIterator<{ author: { displayName?: string; username: string }; content: string }>;
          }>;
        };
      };
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
      try {
        const fetched = await ch.messages.fetch({ limit });
        const items = fetched.values ? Array.from(fetched.values()) : [];
        if (items.length === 0) return '(no messages found in channel)';
        return items
          .reverse()
          .map((m) => `${m.author.displayName || m.author.username}: ${m.content.slice(0, 300)}`)
          .join('\n');
      } catch (err) {
        return `Failed to read channel history: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}
