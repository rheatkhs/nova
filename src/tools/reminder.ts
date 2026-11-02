import type { Tool } from './types.ts';

/** Creates a contextual channel-scoped tool that schedules and posts a reminder. */
export function createReminderTool(channel: unknown, authorId: string): Tool {
  return {
    name: 'create_reminder',
    description:
      'Schedule a reminder note to be sent back to this Discord channel after a specified number of seconds or minutes.',
    parameters: {
      type: 'object',
      properties: {
        seconds: { type: 'number', description: 'Duration in seconds before triggering (minimum 5, maximum 86400)' },
        note: { type: 'string', description: 'The reminder message or task description' },
      },
      required: ['seconds', 'note'],
    },
    async execute(args): Promise<string> {
      const rawSec = Number(args.seconds);
      const note = String(args.note || '').trim();

      if (!note) return 'Error: note is required';
      if (!Number.isFinite(rawSec) || rawSec < 5) {
        return 'Error: seconds must be a positive number of at least 5';
      }
      const seconds = Math.min(Math.round(rawSec), 86_400); // capped at 24 hours

      if (!channel || typeof channel !== 'object' || !('send' in channel)) {
        return 'Error: current channel does not support sending reminder messages';
      }

      const ch = channel as { send: (opt: { content: string }) => Promise<unknown> };

      setTimeout(() => {
        ch.send({
          content: `⏰ <@${authorId}> **Reminder:** ${note}`,
        }).catch(() => {});
      }, seconds * 1_000);

      const durationText = seconds >= 60 ? `${Math.round(seconds / 60)} minute(s)` : `${seconds} second(s)`;
      return `[Reminder scheduled]\nAlarm set for ${durationText} from now: "${note}". I will ping you here when the time is up!`;
    },
  };
}
