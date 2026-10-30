export const DISCORD_MESSAGE_LIMIT = 2000;

/**
 * Splits text into Discord-sized parts, preferring newline, then space, else hard cut.
 * If a split cuts through a fenced code block, closes it with ``` on the current part
 * and reopens with ```lang on the next, so syntax formatting survives across messages.
 */
export function chunk(text: string, max = DISCORD_MESSAGE_LIMIT): string[] {
  const parts: string[] = [];
  let rest = text;
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
