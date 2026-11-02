import type { Tool } from './types.ts';

export const testWebhookTool: Tool = {
  name: 'test_webhook',
  description:
    'Test an external HTTP API endpoint or simulate a webhook delivery (GET, POST, PUT, DELETE). Measures latency and returns status code and response payload.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Destination HTTP or HTTPS URL to test' },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'HTTP method (default: GET)',
      },
      payload: { type: 'string', description: 'Optional JSON or raw text body for POST/PUT' },
    },
    required: ['url'],
  },
  async execute(args): Promise<string> {
    const rawUrl = String(args.url || '').trim();
    if (!rawUrl) return 'Error: url is required';

    let targetUrl: URL;
    try {
      targetUrl = new URL(rawUrl);
      if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
        return 'Error: only http and https URLs are allowed';
      }
      const hostname = targetUrl.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.')
      ) {
        return 'Error: local loopback and private network addresses are restricted';
      }
    } catch {
      return 'Error: invalid URL format';
    }

    const method = String(args.method || 'GET').toUpperCase();
    const payload = args.payload ? String(args.payload) : undefined;
    const headers: Record<string, string> = {
      'User-Agent': 'NovaWebhookTester/1.0',
    };
    if (payload && (payload.startsWith('{') || payload.startsWith('['))) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const t0 = Date.now();
      const res = await fetch(targetUrl.toString(), {
        method,
        headers,
        body: method !== 'GET' && method !== 'HEAD' ? payload : undefined,
        signal: AbortSignal.timeout(10_000),
      });
      const duration = Date.now() - t0;
      const text = (await res.text()).slice(0, 1_500);
      return `[Webhook Test Result]\n• **URL:** ${targetUrl.toString()}\n• **Method:** ${method}\n• **Status:** ${res.status} ${res.statusText}\n• **Latency:** ${duration}ms\n\n**Response Body:**\n\`\`\`\n${text || '(empty response)'}\n\`\`\``;
    } catch (err) {
      return `Webhook test failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
