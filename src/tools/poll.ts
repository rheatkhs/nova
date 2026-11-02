import type { Tool } from './types.ts';

const POLL_NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

export const createPollTool: Tool = {
  name: 'create_poll',
  description:
    'Generate a formatted community poll with numbered emoji reactions for voting on options or questions.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The poll question or decision topic' },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Between 2 and 10 poll options',
      },
    },
    required: ['question', 'options'],
  },
  async execute(args): Promise<string> {
    const question = String(args.question || '').trim();
    const options = Array.isArray(args.options) ? args.options.map(String).map((s) => s.trim()).filter(Boolean) : [];

    if (!question) return 'Error: question is required';
    if (options.length < 2) return 'Error: a poll requires at least 2 options';
    if (options.length > 10) return 'Error: maximum 10 options allowed';

    const lines = [
      `📊 **POLL: ${question}**`,
      '',
      ...options.map((opt, i) => `${POLL_NUMBERS[i]} ${opt}`),
      '',
      '-# React below with the corresponding number emoji to vote!',
    ];

    return lines.join('\n');
  },
};
