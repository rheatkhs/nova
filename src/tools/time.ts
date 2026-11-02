import type { Tool } from './types.ts';

export const getCurrentTimeTool: Tool = {
  name: 'get_current_time',
  description: 'Get the current date and time in UTC.',
  parameters: {
    type: 'object',
    properties: {},
  },
  async execute(): Promise<string> {
    const now = new Date();
    return JSON.stringify({
      utc: now.toISOString(),
      weekday: now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
      date: now.toLocaleDateString('en-US', { timeZone: 'UTC' }),
    });
  },
};
