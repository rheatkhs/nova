const CODE_EXTENSIONS: Record<string, string> = {
  python: 'py',
  typescript: 'ts',
  javascript: 'js',
  bash: 'sh',
  shell: 'sh',
  rust: 'rs',
  golang: 'go',
  cplusplus: 'cpp',
  cpp: 'cpp',
  markdown: 'md',
};

/** Extracts the first markdown code block and maps language tag to file extension. */
export function extractCodeSnippet(text: string): { code: string; ext: string } | null {
  const match = text.match(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)\n```/);
  if (!match) return null;
  const rawLang = (match[1] || 'txt').toLowerCase();
  const code = match[2]!.trim();
  const ext = CODE_EXTENSIONS[rawLang] || rawLang || 'txt';
  return { code, ext };
}
