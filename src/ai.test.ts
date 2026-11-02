import { expect, test } from 'bun:test';
import { createChat, formatReasoning, sanitizeOutput } from './ai.ts';
import type { Tool } from './tools.ts';

interface RequestPayload {
  messages: Array<{ role: string; content?: string }>;
}

test('createChat handles direct text response', async () => {
  const server = Bun.serve({
    port: 3939,
    fetch() {
      return Response.json({
        choices: [{ message: { role: 'assistant', content: 'Direct answer' } }],
      });
    },
  });

  try {
    const chat = createChat({
      baseUrl: 'http://127.0.0.1:3939/v1',
      apiKey: undefined,
      model: 'test-model',
      systemPrompt: 'sys',
    });
    const reply = await chat([{ role: 'user', content: 'hi' }]);
    expect(reply).toBe('Direct answer');
  } finally {
    server.stop();
  }
});

test('createChat allows overriding systemPrompt per-call', async () => {
  let receivedSys = '';
  const server = Bun.serve({
    port: 3942,
    async fetch(req) {
      const body = (await req.json()) as RequestPayload;
      receivedSys = body.messages.find((m) => m.role === 'system')?.content || '';
      return Response.json({
        choices: [{ message: { role: 'assistant', content: 'Ahoy' } }],
      });
    },
  });

  try {
    const chat = createChat({
      baseUrl: 'http://127.0.0.1:3942/v1',
      apiKey: undefined,
      model: 'test-model',
      systemPrompt: 'default sys',
    });
    await chat([{ role: 'user', content: 'hi' }], {
      systemPrompt: 'custom persona',
      now: new Date('2026-11-02T12:00:00Z'),
    });
    expect(receivedSys).toBe('custom persona\n\nCurrent time: 2026-11-02 (Monday, UTC).');
  } finally {
    server.stop();
  }
});

test('createChat allows overriding model per-call', async () => {
  let receivedModel = '';
  const server = Bun.serve({
    port: 3943,
    async fetch(req) {
      const body = (await req.json()) as { model: string };
      receivedModel = body.model;
      return Response.json({
        choices: [{ message: { role: 'assistant', content: 'hello' } }],
      });
    },
  });

  try {
    const chat = createChat({
      baseUrl: 'http://127.0.0.1:3943/v1',
      apiKey: undefined,
      model: 'default-model',
      systemPrompt: 'sys',
    });
    await chat([{ role: 'user', content: 'hi' }], { model: 'custom-model' });
    expect(receivedModel).toBe('custom-model');
  } finally {
    server.stop();
  }
});

test('createChat passes temperature in body when specified', async () => {
  let receivedTemp: number | undefined;
  const server = Bun.serve({
    port: 3945,
    async fetch(req) {
      const body = (await req.json()) as { temperature?: number };
      receivedTemp = body.temperature;
      return Response.json({
        choices: [{ message: { role: 'assistant', content: 'cool' } }],
      });
    },
  });

  try {
    const chat = createChat({
      baseUrl: 'http://127.0.0.1:3945/v1',
      apiKey: undefined,
      model: 'test-model',
      systemPrompt: 'sys',
    });
    await chat([{ role: 'user', content: 'code' }], { temperature: 0.2 });
    expect(receivedTemp).toBe(0.2);
  } finally {
    server.stop();
  }
});

test('createChat injects target language into system prompt when specified', async () => {
  let receivedSys = '';
  const server = Bun.serve({
    port: 3946,
    async fetch(req) {
      const body = (await req.json()) as RequestPayload;
      receivedSys = body.messages.find((m) => m.role === 'system')?.content || '';
      return Response.json({
        choices: [{ message: { role: 'assistant', content: 'Xin chao' } }],
      });
    },
  });

  try {
    const chat = createChat({
      baseUrl: 'http://127.0.0.1:3946/v1',
      apiKey: undefined,
      model: 'test-model',
      systemPrompt: 'You are Nova.',
    });
    await chat([{ role: 'user', content: 'hi' }], { language: 'Vietnamese' });
    expect(receivedSys).toContain('Target language: Always respond in Vietnamese.');
  } finally {
    server.stop();
  }
});

test('createChat executes tool call and returns final reply', async () => {
  let step = 0;
  const server = Bun.serve({
    port: 3940,
    async fetch(req) {
      step++;
      const body = (await req.json()) as RequestPayload;
      if (step === 1) {
        // First step: model calls tool
        return Response.json({
          choices: [
            {
              message: {
                role: 'assistant',
                tool_calls: [
                  {
                    id: 'c1',
                    type: 'function',
                    function: { name: 'add', arguments: '{"a":2,"b":3}' },
                  },
                ],
              },
            },
          ],
        });
      }
      // Second step: model sees tool result and answers
      const toolMsg = body.messages.find((m) => m.role === 'tool');
      expect(toolMsg?.content).toBe('5');
      return Response.json({
        choices: [{ message: { role: 'assistant', content: 'The sum is 5' } }],
      });
    },
  });

  const addTool: Tool = {
    name: 'add',
    description: 'Add two numbers',
    parameters: { type: 'object' },
    async execute(args) {
      return String(Number(args.a) + Number(args.b));
    },
  };

  try {
    const chat = createChat({
      baseUrl: 'http://127.0.0.1:3940/v1',
      apiKey: undefined,
      model: 'test-model',
      systemPrompt: 'sys',
      tools: [addTool],
    });
    const startedTools: string[] = [];
    const reply = await chat([{ role: 'user', content: '2+3' }], {
      onToolStart: (name) => {
        startedTools.push(name);
      },
    });
    expect(reply).toBe('The sum is 5');
    expect(startedTools).toEqual(['add']);
    expect(step).toBe(2);
  } finally {
    server.stop();
  }
});

test('createChat respects maxToolSteps cutoff', async () => {
  const server = Bun.serve({
    port: 3941,
    fetch() {
      // Loop forever asking for tool
      return Response.json({
        choices: [
          {
            message: {
              role: 'assistant',
              tool_calls: [{ id: 'loop', type: 'function', function: { name: 'ping', arguments: '{}' } }],
            },
          },
        ],
      });
    },
  });

  const pingTool: Tool = {
    name: 'ping',
    description: 'ping',
    parameters: {},
    execute: async () => 'pong',
  };

  try {
    const chat = createChat({
      baseUrl: 'http://127.0.0.1:3941/v1',
      apiKey: undefined,
      model: 'test-model',
      systemPrompt: 'sys',
      tools: [pingTool],
      maxToolSteps: 2,
    });
    const reply = await chat([{ role: 'user', content: 'test' }]);
    expect(reply).toBe('Agent reached max tool execution steps.');
  } finally {
    server.stop();
  }
});

test('createChat retries transient 502 error and succeeds on retry', async () => {
  let attempts = 0;
  const server = Bun.serve({
    port: 3944,
    fetch() {
      attempts++;
      if (attempts === 1) {
        return new Response('Bad Gateway', { status: 502 });
      }
      return Response.json({
        choices: [{ message: { role: 'assistant', content: 'recovered' } }],
      });
    },
  });

  try {
    const chat = createChat({
      baseUrl: 'http://127.0.0.1:3944/v1',
      apiKey: undefined,
      model: 'test-model',
      systemPrompt: 'sys',
      retries: 1,
      retryDelayMs: 0,
    });
    const reply = await chat([{ role: 'user', content: 'test' }]);
    expect(reply).toBe('recovered');
    expect(attempts).toBe(2);
  } finally {
    server.stop();
  }
});

test('createChat cascades to fallbackModel when primaryModel fails', async () => {
  const modelsRequested: string[] = [];
  const server = Bun.serve({
    port: 3947,
    async fetch(req) {
      const body = (await req.json()) as { model: string };
      modelsRequested.push(body.model);
      if (body.model === 'primary-model') {
        return new Response('Rate limit or model quota exhausted', { status: 429 });
      }
      return Response.json({
        choices: [{ message: { role: 'assistant', content: 'fallback answer' } }],
      });
    },
  });

  try {
    const chat = createChat({
      baseUrl: 'http://127.0.0.1:3947/v1',
      apiKey: undefined,
      model: 'primary-model',
      fallbackModel: 'backup-model',
      systemPrompt: 'sys',
      retries: 0,
    });
    const reply = await chat([{ role: 'user', content: 'hello' }]);
    expect(reply).toBe('fallback answer');
    expect(modelsRequested).toEqual(['primary-model', 'backup-model']);
  } finally {
    server.stop();
  }
});

test('sanitizeOutput preserves normal responses and redacts verbatim system prompt leaks', () => {
  const sys = 'You are Nova, a helpful Discord assistant. Keep answers concise.';

  // Normal conversation
  expect(sanitizeOutput('The capital of France is Paris.', sys)).toBe('The capital of France is Paris.');
  expect(sanitizeOutput('I am Nova, how can I help?', sys)).toBe('I am Nova, how can I help?');

  // Verbatim leak attempt
  const leak = 'My prompt is: You are Nova, a helpful Discord assistant. Keep answers concise.';
  expect(sanitizeOutput(leak, sys)).toBe('I cannot disclose my internal system instructions.');
});

test('formatReasoning formats reasoning_content and think tags into collapsible spoilers', () => {
  // Plain response
  expect(formatReasoning('Hello!')).toBe('Hello!');

  // reasoning_content property
  const r1 = formatReasoning('42', 'Computing universe answer...');
  expect(r1).toContain('||💭 Thought:\nComputing universe answer...||');
  expect(r1).toContain('42');

  // <think> tag inside content
  const r2 = formatReasoning('<think>Reviewing equations...</think>\nThe derivative is 2x.');
  expect(r2).toContain('||💭 Thought:\nReviewing equations...||');
  expect(r2).toContain('The derivative is 2x.');
});
