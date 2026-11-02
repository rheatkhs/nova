import type { Tool } from './types.ts';

export const evalMathTool: Tool = {
  name: 'eval_math',
  description:
    'Evaluate a safe mathematical expression (supports +, -, *, /, %, ^, parentheses, sqrt, abs, round, floor, ceil, sin, cos, tan, log, pi, e).',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'Mathematical expression, e.g. "sqrt(144) + 12 * 3.5"' },
    },
    required: ['expression'],
  },
  async execute(args): Promise<string> {
    const expr = String(args.expression || '').trim();
    if (!expr) return 'Error: expression is required';
    try {
      const result = evaluateMath(expr);
      if (!Number.isFinite(result)) return 'Error: result is not a finite number';
      return String(result);
    } catch (err) {
      return `Math error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

/** Safe recursive-descent math expression evaluator with zero eval/Function usage. */
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
    const nameMatch = s.slice(pos).match(/^[a-zA-Z]+/);
    if (nameMatch) {
      const name = nameMatch[0].toLowerCase();
      pos += name.length;
      if (name === 'pi') return Math.PI;
      if (name === 'e') return Math.E;
      if (s[pos] === '(') {
        pos++;
        const arg = parseExpression();
        if (s[pos] !== ')') throw new Error(`missing closing parenthesis for ${name}`);
        pos++;
        switch (name) {
          case 'sqrt': return Math.sqrt(arg);
          case 'abs': return Math.abs(arg);
          case 'round': return Math.round(arg);
          case 'floor': return Math.floor(arg);
          case 'ceil': return Math.ceil(arg);
          case 'sin': return Math.sin(arg);
          case 'cos': return Math.cos(arg);
          case 'tan': return Math.tan(arg);
          case 'log': return Math.log(arg);
          default: throw new Error(`unknown function: ${name}`);
        }
      }
      throw new Error(`unknown identifier: ${name}`);
    }
    const numMatch = s.slice(pos).match(/^[0-9]+(?:\.[0-9]+)?/);
    if (numMatch) {
      pos += numMatch[0].length;
      return parseFloat(numMatch[0]);
    }
    throw new Error(`unexpected character at pos ${pos}: ${s[pos]}`);
  }

  const result = parseExpression();
  if (pos < s.length) throw new Error(`unexpected extra characters: ${s.slice(pos)}`);
  return result;
}
