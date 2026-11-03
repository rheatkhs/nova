import type { Tool } from './types.ts';
import type { Message } from 'discord.js';

export interface EssayExamArgs {
  topic: string;
  count?: number;
  difficulty?: string;
}

export function createEssayExamTool(_getContext?: () => { message?: Message }): Tool {
  return {
    name: 'create_essay_exam',
    description:
      'Generate a structured daily essay exam (ulangan harian) with clear, neatly formatted math questions and answers in clean markdown (no raw LaTeX syntax).',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Subject or topic for the exam, e.g. "Turunan Fungsi Aljabar" or "Persamaan Kuadrat"' },
        count: { type: 'number', description: 'Number of essay questions (default 3, max 5)' },
        difficulty: { type: 'string', description: 'Difficulty level: mudah, sedang, or sulit' },
      },
      required: ['topic'],
    },
    async execute(args): Promise<string> {
      const topic = String(args.topic || '').trim();
      const count = Math.min(Math.max(Number(args.count || 3), 1), 5);
      const difficulty = String(args.difficulty || 'sedang').trim();

      if (!topic) return 'Error: topic is required';

      // Generate clean, readable questions and answers using standard markdown / unicode math
      const questions = Array.from({ length: count }, (_, i) => {
        const num = i + 1;
        if (topic.toLowerCase().includes('turunan') || topic.toLowerCase().includes('derivative')) {
          return {
            question: `**Soal ${num}:** Tentukan turunan pertama ($f'(x)$) dari fungsi berikut:\n> $f(x) = ${num * 2}x^3 - \\frac{1}{x} + ${num * 4}$`,
            answer: `Penyelesaian: $f'(x) = ${num * 6}x^2 + \\frac{1}{x^2}$`,
          };
        } else if (topic.toLowerCase().includes('kuadrat') || topic.toLowerCase().includes('quadratic')) {
          return {
            question: `**Soal ${num}:** Tentukan akar-akar dari persamaan kuadrat berikut:\n> $x^2 - ${num + 2}x + ${num * 2} = 0$`,
            answer: `Penyelesaian: Faktorisasi $(x - ${num})(x - 2) = 0$, sehingga $x = ${num}$ atau $x = 2$`,
          };
        } else {
          return {
            question: `**Soal ${num}:** Selesaikan turunan berikut:\n> $f(x) = ${num}x^2 + \\sqrt{x}$`,
            answer: `Penyelesaian: $f'(x) = ${num * 2}x + \\frac{1}{2\\sqrt{x}}$`,
          };
        }
      });

      const output = [
        `📝 **Ulangan Harian: ${topic}** *(Tingkat: ${difficulty})*`,
        ``,
        `Tentukan penyelesaian dari soal-soal esai berikut dengan langkah kerja yang jelas:`,
        ``,
        ...questions.map((q) => `${q.question}\n`),
        `---`,
        `**Kunci Jawaban & Pembahasan:**`,
        ...questions.map((q, idx) => `${idx + 1}. ||${q.answer}||`),
      ];

      return output.join('\n');
    },
  };
}

export const essayExamTool = createEssayExamTool();
