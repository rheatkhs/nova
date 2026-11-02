import type { Tool } from './types.ts';

export const generateImageTool: Tool = {
  name: 'generate_image',
  description:
    'Generate an artwork, illustration, or realistic photo from a descriptive prompt. Returns an image URL rendered inline in Discord.',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Detailed visual description of the image to generate' },
      aspectRatio: {
        type: 'string',
        enum: ['square', 'landscape', 'portrait'],
        description: 'Aspect ratio: square (512x512), landscape (768x512), or portrait (512x768)',
      },
    },
    required: ['prompt'],
  },
  async execute(args): Promise<string> {
    const prompt = String(args.prompt || '').trim();
    if (!prompt) return 'Error: prompt is required';

    const ratio = String(args.aspectRatio || 'landscape').toLowerCase();
    const dimensions: Record<string, { w: number; h: number }> = {
      square: { w: 512, h: 512 },
      landscape: { w: 768, h: 512 },
      portrait: { w: 512, h: 768 },
    };
    const { w, h } = dimensions[ratio] ?? { w: 768, h: 512 };
    const seed = Math.floor(Math.random() * 1_000_000);

    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&seed=${seed}`;
    return `[AI Image Generated: "${prompt.slice(0, 80)}"]\n${url}`;
  },
};
