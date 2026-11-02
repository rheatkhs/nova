export function renderTesterPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nova AI Assistant • Webhook & API Tester</title>
  <style>
    :root {
      --bg: #090a0f;
      --card-bg: rgba(22, 27, 34, 0.7);
      --border: rgba(255, 255, 255, 0.08);
      --accent: #5865F2;
      --green: #23a55a;
      --red: #f23f43;
      --text: #f0f6fc;
      --muted: #8b949e;
      --input-bg: #0d1117;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2.5rem 1rem;
    }
    .container { width: 100%; max-width: 800px; }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border);
    }
    .brand h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      backdrop-filter: blur(12px);
      margin-bottom: 1.5rem;
    }
    .form-group { margin-bottom: 1rem; }
    label { display: block; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 0.4rem; }
    input, select, textarea {
      width: 100%;
      background: var(--input-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.65rem 0.75rem;
      color: var(--text);
      font-size: 0.9rem;
      font-family: inherit;
    }
    input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); }
    button {
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 6px;
      padding: 0.75rem 1.25rem;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    pre {
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 0.8rem;
      background: rgba(0,0,0,0.6);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 1rem;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
      color: #e6edf3;
      margin-top: 0.5rem;
      max-height: 300px;
      overflow-y: auto;
    }
    .row { display: flex; gap: 1rem; }
    .row .form-group { flex: 1; }
    footer {
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      color: var(--muted);
      border-top: 1px solid var(--border);
      padding-top: 1.5rem;
    }
    footer a { color: var(--accent); text-decoration: none; }
    footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <h1>📡 Webhook & API Tester</h1>
      </div>
      <div>
        <a href="/" style="color:var(--accent);text-decoration:none;font-size:0.85rem;">← Back to Dashboard</a>
      </div>
    </header>

    <div class="card">
      <form id="test-form">
        <div class="row">
          <div class="form-group" style="flex: 0 0 140px;">
            <label for="method">Method</label>
            <select id="method">
              <option value="POST">POST</option>
              <option value="GET">GET</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div class="form-group">
            <label for="url">Target URL</label>
            <input type="url" id="url" placeholder="https://httpbin.org/post" required>
          </div>
        </div>
        <div class="form-group">
          <label for="payload">JSON / Text Payload (for POST/PUT)</label>
          <textarea id="payload" rows="5" placeholder='{"content": "Hello via Nova Webhook Tester", "username": "Nova Bot"}'></textarea>
        </div>
        <button type="submit" id="submit-btn">Send Test Request</button>
      </form>
    </div>

    <div class="card" id="result-card" style="display:none;">
      <div class="label" style="margin-bottom:0.5rem;display:flex;justify-content:space-between;">
        <span>Response Results</span>
        <span id="status-badge" style="font-weight:700;"></span>
      </div>
      <div style="font-size:0.85rem;color:var(--muted);margin-bottom:0.5rem;" id="meta-info"></div>
      <pre><code id="response-body"></code></pre>
    </div>

    <footer>
      <div>Nova AI Assistant • Sandbox API Tester</div>
      <div><a href="/">Dashboard</a></div>
    </footer>
  </div>

  <script>
    const form = document.getElementById('test-form');
    const btn = document.getElementById('submit-btn');
    const resultCard = document.getElementById('result-card');
    const statusBadge = document.getElementById('status-badge');
    const metaInfo = document.getElementById('meta-info');
    const responseBody = document.getElementById('response-body');

    form.onsubmit = async (e) => {
      e.preventDefault();
      const method = document.getElementById('method').value;
      const url = document.getElementById('url').value;
      const payload = document.getElementById('payload').value;

      btn.disabled = true;
      btn.innerText = 'Sending Request...';
      resultCard.style.display = 'none';

      try {
        const res = await fetch('/api/test-webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, method, payload: payload || undefined }),
        });
        const data = await res.json();

        resultCard.style.display = 'block';
        statusBadge.innerText = data.status + ' ' + (data.statusText || '');
        statusBadge.style.color = data.ok ? 'var(--green)' : 'var(--red)';
        metaInfo.innerText = \`Latency: \${data.duration}ms • Method: \${method}\`;
        responseBody.innerText = data.body;
      } catch (err) {
        resultCard.style.display = 'block';
        statusBadge.innerText = 'Network Error';
        statusBadge.style.color = 'var(--red)';
        metaInfo.innerText = '';
        responseBody.innerText = err.message;
      } finally {
        btn.disabled = false;
        btn.innerText = 'Send Test Request';
      }
    };
  </script>
</body>
</html>`;
}
