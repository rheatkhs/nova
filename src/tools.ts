export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>): Promise<string>;
}

export const getCurrentTimeTool: Tool = {
  name: 'get_current_time',
  description: 'Get the current date and time in UTC.',
  parameters: {
    type: 'object',
    properties: {},
  },
  async execute(): Promise<string> {
    const now = new Date();
    return JSON.stringify({
      utc: now.toISOString(),
      weekday: now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
      date: now.toLocaleDateString('en-US', { timeZone: 'UTC' }),
    });
  },
};

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

export const wikipediaSearchTool: Tool = {
  name: 'wikipedia_search',
  description: 'Search Wikipedia for articles, facts, history, people, places, and concepts.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search keywords' },
    },
    required: ['query'],
  },
  async execute(args): Promise<string> {
    const query = String(args.query || '').trim();
    if (!query) return 'Error: query is required';
    try {
      const base = process.env.WIKIPEDIA_BASE_URL || 'https://en.wikipedia.org/w/api.php';
      const url = `${base}?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'NovaDiscordBot/1.0 (https://github.com/rheatkhs/nova)' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return `Wikipedia API error (${res.status})`;
      const data = (await res.json()) as { query?: { search?: Array<{ title: string; snippet: string }> } };
      const hits = data.query?.search?.slice(0, 3) ?? [];
      if (hits.length === 0) return `No Wikipedia results found for "${query}"`;
      return hits
        .map((h, i) => `${i + 1}. ${h.title}: ${h.snippet.replace(/<[^>]+>/g, '').trim()}`)
        .join('\n');
    } catch (err) {
      return `Failed to search Wikipedia: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const fetchPageTool: Tool = {
  name: 'fetch_page',
  description: 'Fetch and extract readable text from a web page URL.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'HTTP or HTTPS web page URL to read' },
    },
    required: ['url'],
  },
  async execute(args): Promise<string> {
    const rawUrl = String(args.url || '').trim();
    if (!rawUrl) return 'Error: url is required';
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return 'Error: only http and https URLs are allowed';
      }
    } catch {
      return 'Error: invalid URL';
    }

    try {
      const res = await fetch(parsed.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NovaBot/1.0)' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return `HTTP error ${res.status}`;
      const html = await res.text();
      // Strip script, style, and HTML tags; collapse whitespace.
      const text = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return text.slice(0, 3_000) || '(page had no readable text)';
    } catch (err) {
      return `Failed to fetch URL: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const webSearchTool: Tool = {
  name: 'web_search',
  description:
    'Search the web using SearXNG or Brave Search (falls back to Wikipedia if unconfigured). Set SEARXNG_URL or BRAVE_API_KEY in .env for full web search.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search keywords' },
    },
    required: ['query'],
  },
  async execute(args): Promise<string> {
    const query = String(args.query || '').trim();
    if (!query) return 'Error: query is required';

    const braveKey = process.env.BRAVE_API_KEY?.trim();
    if (braveKey) {
      return searchBrave(query, braveKey);
    }

    const searxngUrl = process.env.SEARXNG_URL?.trim();
    if (searxngUrl) {
      return searchSearxng(query, searxngUrl);
    }
    const wiki = await wikipediaSearchTool.execute({ query });
    return `[Note: neither BRAVE_API_KEY nor SEARXNG_URL configured; fell back to Wikipedia]\n\n${wiki}`;
  },
};

async function searchBrave(query: string, apiKey: string): Promise<string> {
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
    const res = await fetch(url, {
      headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return `Brave API error (${res.status})`;
    const data = (await res.json()) as {
      web?: { results?: Array<{ title: string; url: string; description: string }> };
    };
    const results = data.web?.results ?? [];
    if (results.length === 0) return `No web results found for "${query}"`;
    return results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`)
      .join('\n\n');
  } catch (err) {
    return `Brave search error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function searchSearxng(query: string, baseUrl: string): Promise<string> {
  try {
    const url = `${baseUrl.replace(/\/+$/, '')}/search?q=${encodeURIComponent(query)}&format=json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'NovaBot/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return `SearXNG error (${res.status})`;
    const data = (await res.json()) as {
      results?: Array<{ title: string; url: string; content?: string }>;
    };
    const results = data.results?.slice(0, 5) ?? [];
    if (results.length === 0) return `No SearXNG results found for "${query}"`;
    return results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content || ''}`.trim())
      .join('\n\n');
  } catch (err) {
    return `SearXNG search error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export const renderChartTool: Tool = {
  name: 'render_chart',
  description:
    'Generate a visual chart image (bar, line, pie, or doughnut) for statistics, trends, or comparisons. Returns an image URL that renders inline in Discord.',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['bar', 'line', 'pie', 'doughnut'],
        description: 'Chart visualization type',
      },
      title: { type: 'string', description: 'Chart title' },
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Category or X-axis labels',
      },
      data: {
        type: 'array',
        items: { type: 'number' },
        description: 'Numeric values corresponding to each label',
      },
      datasetLabel: {
        type: 'string',
        description: 'Optional legend label for the dataset (e.g. "Adoption", "Revenue")',
      },
    },
    required: ['type', 'labels', 'data'],
  },
  async execute(args): Promise<string> {
    const type = String(args.type || 'bar').toLowerCase();
    const title = String(args.title || '').trim();
    const labels = Array.isArray(args.labels) ? args.labels.map(String) : [];
    const data = Array.isArray(args.data) ? args.data.map(Number) : [];
    const datasetLabel = String(args.datasetLabel || title || 'Data');

    if (labels.length === 0 || data.length === 0) {
      return 'Error: labels and data arrays cannot be empty';
    }
    if (labels.length !== data.length) {
      return `Error: labels count (${labels.length}) must match data count (${data.length})`;
    }

    const config = {
      type,
      data: {
        labels,
        datasets: [{ label: datasetLabel, data }],
      },
      options: {
        title: title ? { display: true, text: title, fontColor: '#ffffff' } : undefined,
        legend: { labels: { fontColor: '#d1d5db' } },
        scales:
          type === 'pie' || type === 'doughnut'
            ? undefined
            : {
                xAxes: [{ ticks: { fontColor: '#9ca3af' }, gridLines: { color: 'rgba(255,255,255,0.1)' } }],
                yAxes: [{ ticks: { fontColor: '#9ca3af' }, gridLines: { color: 'rgba(255,255,255,0.1)' } }],
              },
      },
    };

    const encoded = encodeURIComponent(JSON.stringify(config));
    const url = `https://quickchart.io/chart?c=${encoded}&w=550&h=320&bkg=%23181a20`;
    return `[Chart generated: ${title || type}]\n${url}`;
  },
};

const POLL_NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

export const createPollTool: Tool = {
  name: 'create_poll',
  description:
    'Generate a formatted community poll with numbered emoji reactions for voting on options or questions.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The poll question or decision topic' },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Between 2 and 10 poll options',
      },
    },
    required: ['question', 'options'],
  },
  async execute(args): Promise<string> {
    const question = String(args.question || '').trim();
    const options = Array.isArray(args.options) ? args.options.map(String).map((s) => s.trim()).filter(Boolean) : [];

    if (!question) return 'Error: question is required';
    if (options.length < 2) return 'Error: a poll requires at least 2 options';
    if (options.length > 10) return 'Error: maximum 10 options allowed';

    const lines = [
      `📊 **POLL: ${question}**`,
      '',
      ...options.map((opt, i) => `${POLL_NUMBERS[i]} ${opt}`),
      '',
      '-# React below with the corresponding number emoji to vote!',
    ];

    return lines.join('\n');
  },
};

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

export interface QuizItem {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

const QUIZ_STORE = new Map<string, QuizItem>();

export function getQuizItem(id: string): QuizItem | undefined {
  return QUIZ_STORE.get(id);
}

export const createQuizTool: Tool = {
  name: 'create_quiz',
  description:
    'Generate an interactive multiple-choice quiz question with buttons (A, B, C, D) and immediate feedback.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The quiz question or trivia prompt' },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Exactly 2 to 4 answer choices',
      },
      correctIndex: {
        type: 'number',
        description: 'Zero-based index of the correct answer (0, 1, 2, or 3)',
      },
      explanation: {
        type: 'string',
        description: 'Educational explanation shown when an option is selected',
      },
    },
    required: ['question', 'options', 'correctIndex'],
  },
  async execute(args): Promise<string> {
    const question = String(args.question || '').trim();
    const options = Array.isArray(args.options)
      ? args.options.map(String).map((s) => s.trim()).filter(Boolean)
      : [];
    const correctIndex = Number(args.correctIndex);
    const explanation = String(args.explanation || 'Correct answer!').trim();

    if (!question) return 'Error: question is required';
    if (options.length < 2 || options.length > 4) {
      return 'Error: quiz must have between 2 and 4 options';
    }
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
      return `Error: correctIndex must be between 0 and ${options.length - 1}`;
    }

    const id = Math.random().toString(36).slice(2, 8);
    QUIZ_STORE.set(id, { id, question, options, correctIndex, explanation });

    if (QUIZ_STORE.size > 50) {
      const oldest = QUIZ_STORE.keys().next().value;
      if (oldest) QUIZ_STORE.delete(oldest);
    }

    const LETTERS = ['A', 'B', 'C', 'D'];
    const optionLines = options.map((opt, i) => `**${LETTERS[i]}.** ${opt}`);

    return `[QUIZ:${id}]\n🧠 **QUIZ: ${question}**\n\n${optionLines.join('\n')}\n\n-# Click a button below to check your answer!`;
  },
};

export const defaultTools: readonly Tool[] = [
  getCurrentTimeTool,
  evalMathTool,
  wikipediaSearchTool,
  webSearchTool,
  fetchPageTool,
  renderChartTool,
  createPollTool,
  renderHtmlTool,
  renderDiagramTool,
  createQuizTool,
];

/** Creates a channel-scoped tool that allows the agent to inspect recent Discord chat. */
export function createChannelHistoryTool(channel: unknown): Tool {
  return {
    name: 'read_channel_history',
    description: 'Read recent messages from the current Discord channel to inspect prior conversation.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of recent messages to read (1 to 20, default 10)' },
      },
    },
    async execute(args): Promise<string> {
      if (!channel || typeof channel !== 'object' || !('messages' in channel)) {
        return 'Error: channel does not support reading message history';
      }
      const ch = channel as {
        messages: {
          fetch: (opt: { limit: number }) => Promise<{
            values?: () => IterableIterator<{ author: { displayName?: string; username: string }; content: string }>;
          }>;
        };
      };
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
      try {
        const fetched = await ch.messages.fetch({ limit });
        const items = fetched.values ? Array.from(fetched.values()) : [];
        if (items.length === 0) return '(no messages found in channel)';
        return items
          .reverse()
          .map((m) => `${m.author.displayName || m.author.username}: ${m.content.slice(0, 300)}`)
          .join('\n');
      } catch (err) {
        return `Failed to read channel history: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}
