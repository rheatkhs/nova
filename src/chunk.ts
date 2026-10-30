export const DISCORD_MESSAGE_LIMIT = 2000;

/**
 * Splits text into Discord-sized parts, preferring newline, then space, else a hard cut.
 * ponytail: code fences split across parts lose formatting; re-open ``` per part if it matters.
 */
export function chunk(text: string, max = DISCORD_MESSAGE_LIMIT): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const brk = [rest.lastIndexOf('\n', max), rest.lastIndexOf(' ', max)].find((i) => i > 0);
    parts.push(rest.slice(0, brk ?? max));
    rest = brk === undefined ? rest.slice(max) : rest.slice(brk + 1);
  }
  if (rest) parts.push(rest);
  return parts;
}
