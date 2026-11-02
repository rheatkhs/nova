export const DISCORD_MESSAGE_LIMIT = 2000;

/**
 * Splits text into Discord-sized parts, preferring newline, then space, else hard cut.
 * If a split cuts through a fenced code block, closes it with ``` on the current part
 * and reopens with ```lang on the next, so syntax formatting survives across messages.
 */
export function chunk(text: string, max = DISCORD_MESSAGE_LIMIT): string[] {
  const parts: string[] = [];
  let rest = tagCodeFences(text);
  let activeFence: string | null = null; // e.g. "ts", "json", or ""

  while (rest.length > max) {
    const brk = [rest.lastIndexOf('\n', max), rest.lastIndexOf(' ', max)].find((i) => i > 0);
    const cut = brk ?? max;
    const slice = rest.slice(0, cut);
    rest = brk === undefined ? rest.slice(max) : rest.slice(brk + 1);

    activeFence = trackFences(slice, activeFence);

    if (activeFence !== null) {
      parts.push(`${slice}\n\`\`\``);
      rest = `\`\`\`${activeFence}\n${rest}`;
    } else {
      parts.push(slice);
    }
  }

  if (rest) parts.push(rest);
  return parts;
}

/**
 * Scans slice line by line. Tracks whether we end inside a code fence and its tag.
 */
function trackFences(slice: string, initial: string | null): string | null {
  let active = initial;
  for (const line of slice.split('\n')) {
    const trimmed = line.trimEnd();
    if (active === null) {
      if (trimmed.startsWith('```')) {
        active = trimmed.slice(3).trim();
      }
    } else if (trimmed === '```') {
      active = null;
    }
  }
  return active;
}

/**
 * Scans markdown text for bare code fences and adds auto-detected language tags
 * based on snippet heuristics to enable Discord syntax highlighting.
 */
export function tagCodeFences(text: string): string {
  return text.replace(/^```[ \t]*\n([\s\S]*?)\n```/gm, (match, body: string) => {
    const lang = detectLanguage(body.trim());
    return lang ? `\`\`\`${lang}\n${body}\n\`\`\`` : match;
  });
}

/** Detects code snippet language using common syntax heuristics. */
export function detectLanguage(snippet: string): string | null {
  const trimmed = snippet.trim();
  if (!trimmed) return null;

  // JSON
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {}
  }

  // HTML / XML
  if (/^<(?:!DOCTYPE|html|svg|xml)[\s>]/i.test(trimmed)) {
    return 'html';
  }

  // Python
  if (
    /(?:^|\n)\s*(?:def\s+[a-zA-Z_]\w*\s*\(|class\s+[a-zA-Z_]\w*[:(]|import\s+\w+|from\s+\w+\s+import)/.test(
      snippet,
    )
  ) {
    return 'py';
  }

  // TypeScript / JavaScript
  if (
    /(?:^|\n)\s*(?:import\s+(?:type\s+)?[\w{*\s,]+from|export\s+(?:default\s+)?(?:function|class|const|interface|type)|const\s+\w+\s*[:=]|let\s+\w+\s*[:=]|console\.log\()/.test(
      snippet,
    )
  ) {
    return 'ts';
  }

  // SQL
  if (
    /^(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\b/i.test(
      trimmed,
    )
  ) {
    return 'sql';
  }

  // Shell / Bash
  if (/^(?:#!\/bin\/(?:bash|sh)|(?:bun|npm|pnpm|yarn|git|curl|docker)\s+)/m.test(trimmed)) {
    return 'bash';
  }

  return null;
}
