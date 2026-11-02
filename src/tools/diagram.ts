import type { Tool } from './types.ts';

export const renderDiagramTool: Tool = {
  name: 'render_diagram',
  description:
    'Render an architecture diagram, sequence diagram, state machine, or flowchart using Mermaid syntax. Returns a visual diagram image URL rendered inline in Discord.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Descriptive title for the diagram' },
      syntax: {
        type: 'string',
        description: 'Complete Mermaid diagram definition (e.g. "graph TD\\n  A --> B", "sequenceDiagram\\n  Alice->>Bob: Hello")',
      },
    },
    required: ['syntax'],
  },
  async execute(args): Promise<string> {
    const rawSyntax = String(args.syntax || '').trim();
    const title = String(args.title || 'Diagram').trim();

    if (!rawSyntax) return 'Error: syntax is required';

    // Clean optional markdown code fences from model output
    const cleanSyntax = rawSyntax
      .replace(/^```(?:mermaid)?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();

    const b64 = Buffer.from(cleanSyntax, 'utf-8').toString('base64');
    const url = `https://mermaid.ink/img/${b64}?bgColor=181a20`;

    return `[Diagram rendered: ${title}]\n${url}\n\n\`\`\`mermaid\n${cleanSyntax}\n\`\`\``;
  },
};
