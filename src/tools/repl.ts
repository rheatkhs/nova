import type { Tool } from './types.ts';

export const runCodeTool: Tool = {
  name: 'run_code',
  description:
    'Execute a sandboxed JavaScript or TypeScript code snippet and return its runtime console stdout, stderr, and execution time.',
  parameters: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'Complete JavaScript or TypeScript code to execute (e.g. "console.log([1,2,3].map(x => x*2))")',
      },
    },
    required: ['code'],
  },
  async execute(args): Promise<string> {
    const rawCode = String(args.code || '').trim();
    if (!rawCode) return 'Error: code is required';

    const cleanCode = rawCode
      .replace(/^```(?:ts|js|typescript|javascript)?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();

    try {
      const t0 = Date.now();
      const proc = Bun.spawn(['bun', '-e', cleanCode], {
        stdout: 'pipe',
        stderr: 'pipe',
      });

      // Kill process if it exceeds 3,000ms
      const timeout = setTimeout(() => {
        try {
          proc.kill();
        } catch {}
      }, 3_000);

      const [stdoutBuf, stderrBuf, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      clearTimeout(timeout);
      const duration = Date.now() - t0;

      const stdout = stdoutBuf.slice(0, 1_500).trim();
      const stderr = stderrBuf.slice(0, 1_500).trim();

      const parts = [
        `[Code Execution Result • Exit code: ${exitCode} • ${duration}ms]`,
      ];
      if (stdout) {
        parts.push(`**stdout:**\n\`\`\`\n${stdout}\n\`\`\``);
      }
      if (stderr) {
        parts.push(`**stderr:**\n\`\`\`\n${stderr}\n\`\`\``);
      }
      if (!stdout && !stderr) {
        parts.push('*(Program produced no console output)*');
      }

      return parts.join('\n\n');
    } catch (err) {
      return `Code execution failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
