import type { Tool } from './types.ts';
import { AttachmentBuilder, type Message } from 'discord.js';
import { renderMathToPng } from './math-renderer.ts';

export function createEvalMathTool(getContext?: () => { message?: Message }): Tool {
  return {
    name: 'eval_math',
    description:
      'Evaluate a mathematical expression or render a LaTeX math formula into a pristine typeset image and result block.',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Mathematical expression to calculate, e.g. "sqrt(144) + 12 * 3.5"' },
        latex: { type: 'string', description: 'Optional LaTeX formula notation to render as a typeset image, e.g. "\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}"' },
      },
      required: ['expression'],
    },
    async execute(args): Promise<string> {
      const expr = String(args.expression || '').trim();
      const latex = String(args.latex || expr).trim();
      if (!expr && !latex) return 'Error: expression or latex is required';

      const ctx = getContext?.();
      const msg = ctx?.message;

      try {
        const result = evaluateMath(expr || '0');
        if (!Number.isFinite(result)) return 'Error: result is not a finite number';

        const pngBuf = renderMathToPng(latex);
        const file = new AttachmentBuilder(pngBuf, { name: 'formula.png' });

        if (msg && msg.channel && msg.channel.isSendable()) {
          await msg.channel.send({
            content: `📐 **Typeset Mathematical Formula:**`,
            files: [file],
          });
        }

        return `🧮 **Calculation Result:** \`${expr} = ${result}\``;
      } catch (err) {
        return `Math error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}

export const evalMathTool = createEvalMathTool();

export function evaluateMath(expr: string): number {
  let pos = 0;
  const s = expr.replace(/\s+/g, '');

  function parseExpression(): number {
    let val = parseTerm();
    while (pos < s.length && (s[pos] === '+' || s[pos] === '-')) {
      const op = s[pos++];
      const next = parseTerm();
      val = op === '+' ? val + next : val - next;
    }
    return val;
  }

  function parseTerm(): number {
    let val = parseFactor();
    while (pos < s.length && (s[pos] === '*' || s[pos] === '/' || s[pos] === '%')) {
      const op = s[pos++];
      const next = parseFactor();
      if (op === '*') val *= next;
      else if (op === '/') {
        if (next === 0) throw new Error('division by zero');
        val /= next;
      } else val %= next;
    }
    return val;
  }

  function parseFactor(): number {
    let val = parsePrimary();
    while (pos < s.length && s[pos] === '^') {
      pos++;
      val = Math.pow(val, parseFactor());
    }
    return val;
  }

  function parsePrimary(): number {
    if (pos >= s.length) throw new Error('unexpected end of expression');
    if (s[pos] === '-') {
      pos++;
      return -parsePrimary();
    }
    if (s[pos] === '+') {
      pos++;
      return parsePrimary();
    }
    if (s[pos] === '(') {
      pos++;
      const val = parseExpression();
      if (s[pos] !== ')') throw new Error('missing closing parenthesis');
      pos++;
      return val;
    }

    if (/[a-zA-Z_]/.test(s[pos] ?? '')) {
      let id = '';
      while (pos < s.length && /[a-zA-Z0-9_]/.test(s[pos] ?? '')) {
        id += s[pos++];
      }
      if (s[pos] === '(') {
        pos++;
        const arg = parseExpression();
        if (s[pos] !== ')') throw new Error('missing closing parenthesis');
        pos++;
        switch (id.toLowerCase()) {
          case 'sqrt': return Math.sqrt(arg);
          case 'abs': return Math.abs(arg);
          case 'round': return Math.round(arg);
          case 'floor': return Math.floor(arg);
          case 'ceil': return Math.ceil(arg);
          case 'sin': return Math.sin(arg);
          case 'cos': return Math.cos(arg);
          case 'tan': return Math.tan(arg);
          case 'log': return Math.log10(arg);
          case 'ln': return Math.log(arg);
          default: throw new Error(`unknown function: ${id}`);
        }
      } else {
        switch (id.toLowerCase()) {
          case 'pi': return Math.PI;
          case 'e': return Math.E;
          default: throw new Error(`unknown constant: ${id}`);
        }
      }
    }

    let numStr = '';
    while (pos < s.length && (/[0-9]/.test(s[pos] ?? '') || s[pos] === '.')) {
      numStr += s[pos++];
    }
    if (numStr === '') throw new Error(`unexpected character at position ${pos}: "${s[pos]}"`);
    const num = Number(numStr);
    if (isNaN(num)) throw new Error(`invalid number: "${numStr}"`);
    return num;
  }

  return parseExpression();
}
