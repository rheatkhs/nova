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
    const reply = await chat([{ role: 'user', content: '2+3' }]);
    expect(reply).toBe('The sum is 5');
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
