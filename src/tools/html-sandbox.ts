import type { Tool } from './types.ts';

export interface SandboxSnippet {
  id: string;
  title: string;
  html: string;
  createdAt: number;
}

const SANDBOX_STORE = new Map<string, SandboxSnippet>();

export function getSandboxSnippet(id: string): SandboxSnippet | undefined {
  return SANDBOX_STORE.get(id);
}

export const renderHtmlTool: Tool = {
  name: 'render_html',
  description:
    'Render an interactive web page, calculator, game, or component with HTML, CSS, and JavaScript. Returns a live browser preview link hosted by Nova.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Brief descriptive title for the webpage or component' },
      html: { type: 'string', description: 'Complete self-contained HTML document with embedded CSS and JS' },
    },
    required: ['html'],
  },
  async execute(args): Promise<string> {
    const rawHtml = String(args.html || '').trim();
    const title = String(args.title || 'Interactive Preview').trim();

    if (!rawHtml) return 'Error: html content is required';

    const id = Math.random().toString(36).slice(2, 10);
    const fullHtml = rawHtml.includes('<html')
      ? rawHtml
      : `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>body { font-family: system-ui, sans-serif; padding: 1.5rem; background: #0f1117; color: #f3f4f6; }</style>
</head>
<body>
  ${rawHtml}
</body>
</html>`;

    SANDBOX_STORE.set(id, { id, title, html: fullHtml, createdAt: Date.now() });

    // Keep store bounded to latest 50 snippets
    if (SANDBOX_STORE.size > 50) {
      const oldestKey = SANDBOX_STORE.keys().next().value;
      if (oldestKey) SANDBOX_STORE.delete(oldestKey);
    }

    const host = process.env.PUBLIC_URL || `http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || '3000'}`;
    const viewUrl = `${host.replace(/\/+$/, '')}/view/${id}`;

    return `[Live Webpage Preview: ${title}]\n${viewUrl}\n\nUsers can open this link to test and interact with the live page in their browser.`;
  },
};
