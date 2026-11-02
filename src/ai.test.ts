import { expect, test } from 'bun:test';
import { createChat } from './ai.ts';
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
