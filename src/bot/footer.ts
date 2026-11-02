import type { AnswerMeta } from './types.ts';

/** Maps a tool name to a short visual status emoji. */
export function toolEmoji(toolName: string): string {
  switch (toolName) {
    case 'wikipedia_search':
      return '🔍';
    case 'web_search':
      return '🔎';
    case 'fetch_page':
      return '🌐';
    case 'get_current_time':
      return '⏱️';
    case 'read_channel_history':
      return '📜';
    case 'eval_math':
      return '🔢';
    case 'render_chart':
      return '📊';
    case 'create_poll':
      return '🗳️';
    case 'render_html':
      return '💻';
    case 'generate_image':
      return '🎨';
    case 'render_diagram':
      return '📐';
    case 'test_webhook':
      return '📡';
    case 'create_reminder':
      return '⏰';
    default:
      return '⚙️';
  }
}

/** Maps a tool name to a human-friendly action description. */
export function toolLabel(toolName: string): string {
  switch (toolName) {
    case 'web_search':
      return 'Searching the web';
    case 'wikipedia_search':
      return 'Searching Wikipedia';
    case 'fetch_page':
      return 'Reading web page';
    case 'render_chart':
      return 'Generating visual chart';
    case 'create_poll':
      return 'Creating community poll';
    case 'render_html':
      return 'Rendering interactive webpage';
    case 'generate_image':
      return 'Generating AI artwork';
    case 'render_diagram':
      return 'Rendering Mermaid diagram';
    case 'eval_math':
      return 'Evaluating calculation';
    case 'test_webhook':
      return 'Testing API webhook';
    case 'create_reminder':
      return 'Setting reminder timer';
    case 'read_channel_history':
      return 'Reading channel history';
    case 'get_current_time':
      return 'Checking UTC clock';
    default:
      return 'Running tool';
  }
}

export function formatFooter(meta?: AnswerMeta): string {
  if (!meta) return '';
  const parts: string[] = [`⚡ \`${meta.model}\``, `⏱️ ${meta.latencyMs}ms`];
  if (meta.toolsUsed && meta.toolsUsed.length > 0) {
    const unique = [...new Set(meta.toolsUsed)];
    const badges = unique.map((name) => `${toolEmoji(name)} ${name}`);
    parts.push(badges.join(' • '));
  }
  return `\n\n-# ${parts.join(' • ')}`;
}
