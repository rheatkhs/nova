import type { Tool } from './types.ts';

export interface QuizItem {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

const QUIZ_STORE = new Map<string, QuizItem>();

export function getQuizItem(id: string): QuizItem | undefined {
  return QUIZ_STORE.get(id);
}

export const createQuizTool: Tool = {
  name: 'create_quiz',
  description:
    'Generate an interactive multiple-choice quiz question with buttons (A, B, C, D) and immediate feedback.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The quiz question or trivia prompt' },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Exactly 2 to 4 answer choices',
      },
      correctIndex: {
        type: 'number',
        description: 'Zero-based index of the correct answer (0, 1, 2, or 3)',
      },
      explanation: {
        type: 'string',
        description: 'Educational explanation shown when an option is selected',
      },
    },
    required: ['question', 'options', 'correctIndex'],
  },
  async execute(args): Promise<string> {
    const question = String(args.question || '').trim();
    const options = Array.isArray(args.options)
      ? args.options.map(String).map((s) => s.trim()).filter(Boolean)
      : [];
    const correctIndex = Number(args.correctIndex);
    const explanation = String(args.explanation || 'Correct answer!').trim();

    if (!question) return 'Error: question is required';
    if (options.length < 2 || options.length > 4) {
      return 'Error: quiz must have between 2 and 4 options';
    }
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
      return `Error: correctIndex must be between 0 and ${options.length - 1}`;
    }

    const id = Math.random().toString(36).slice(2, 8);
    QUIZ_STORE.set(id, { id, question, options, correctIndex, explanation });

    if (QUIZ_STORE.size > 50) {
      const oldest = QUIZ_STORE.keys().next().value;
      if (oldest) QUIZ_STORE.delete(oldest);
    }

    const LETTERS = ['A', 'B', 'C', 'D'];
    const optionLines = options.map((opt, i) => `**${LETTERS[i]}.** ${opt}`);

    return `[QUIZ:${id}]\n🧠 **QUIZ: ${question}**\n\n${optionLines.join('\n')}\n\n-# Click a button below to check your answer!`;
  },
};
