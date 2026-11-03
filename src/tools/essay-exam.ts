import type { Tool } from './types.ts';
import { AttachmentBuilder, type Message } from 'discord.js';
import { renderMathToPng } from './math-renderer.ts';

export interface EssayExamArgs {
  topic: string;
  count?: number;
  difficulty?: string;
}

export function createEssayExamTool(getContext?: () => { message?: Message }): Tool {
  return {
    name: 'create_essay_exam',
    description:
      'Generate a structured daily essay exam (ulangan harian) with sequential math questions and rendered KaTeX formula images in exact order.',
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

      const ctx = getContext?.();
      const msg = ctx?.message;

      const questions = Array.from({ length: count }, (_, i) => {
        const num = i + 1;
        if (topic.toLowerCase().includes('turunan') || topic.toLowerCase().includes('derivative')) {
          return {
            question: `Soal ${num}: Tentukan turunan pertama dari fungsi berikut terhadap x.`,
            latex: `f(x) = ${num * 2}x^3 - ${num + 3}x^2 + ${num * 5}`,
            answer: `Penyelesaian: f'(x) = ${num * 6}x^2 - ${2 * (num + 3)}x`,
          };
        } else if (topic.toLowerCase().includes('kuadrat') || topic.toLowerCase().includes('quadratic')) {
          return {
            question: `Soal ${num}: Tentukan akar-akar dari persamaan kuadrat berikut.`,
            latex: `x^2 - ${num + 2}x + ${num * 2} = 0`,
            answer: `Penyelesaian: (x - ${num})(x - 2) = 0, sehingga x = ${num} atau x = 2`,
          };
        } else {
          return {
            question: `Soal ${num}: Selesaikan perhitungan matematis berikut untuk ${topic}.`,
            latex: `\\frac{d}{dx} \\left( ${num}x^{${num + 1}} + \\sqrt{x} \\right)`,
            answer: `Penyelesaian: ${num * (num + 1)}x^{${num}} + \\frac{1}{2\\sqrt{x}}`,
          };
        }
      });

      if (msg && msg.channel && msg.channel.isSendable()) {
        await msg.channel.send({
          content: `📝 **Ulangan Harian: ${topic}** *(Tingkat: ${difficulty})*`,
        });

        for (const [idx, q] of questions.entries()) {
          const pngBuf = renderMathToPng(q.latex);
          const file = new AttachmentBuilder(pngBuf, { name: `soal_${idx + 1}.png` });

          await msg.channel.send({
            content: `**${q.question}**`,
            files: [file],
          });
        }
      }

      const summary = [
        `✅ **Berhasil membuat ${count} soal esai untuk "${topic}" (${difficulty})!**`,
        ...questions.map((q, idx) => `• **Soal ${idx + 1}:** \`${q.latex}\`\n  *Kunci:* ||${q.answer}||`),
      ].join('\n');

      return summary;
    },
  };
}

export const essayExamTool = createEssayExamTool();
