export interface DashboardData {
  ready: boolean;
  model: string;
  uptimeSec: number;
  guilds: number;
  pingMs: number;
  answered: number;
  failed: number;
  toolCalls: number;
  lastResponseMs: number;
  totalMessages: number;
  channels: number;
}

export function renderDashboard(data: DashboardData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nova AI Assistant • Status</title>
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
    .container { width: 100%; max-width: 900px; }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border);
    }
    .brand { display: flex; align-items: center; gap: 0.75rem; }
    .brand h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      background: rgba(35, 165, 90, 0.15);
      color: var(--green);
      border: 1px solid rgba(35, 165, 90, 0.3);
    }
    .badge.offline {
      background: rgba(242, 63, 67, 0.15);
      color: var(--red);
      border-color: rgba(242, 63, 67, 0.3);
    }
    .pulse {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem;
      backdrop-filter: blur(12px);
    }
    .card .label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 0.35rem; }
    .card .value { font-size: 1.5rem; font-weight: 700; }
    .card .sub { font-size: 0.75rem; color: var(--muted); margin-top: 0.25rem; }
    footer {
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      color: var(--muted);
      border-top: 1px solid var(--border);
      padding-top: 1.5rem;
      flex-wrap: wrap;
      gap: 1rem;
    }
    footer a { color: var(--accent); text-decoration: none; }
    footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <h1>Nova AI</h1>
        <span class="badge ${data.ready ? '' : 'offline'}">
          <span class="pulse"></span> ${data.ready ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>
      <div>
        <span style="font-size:0.85rem;color:var(--muted)">Model: <strong>${data.model}</strong></span>
      </div>
    </header>

    <div class="grid">
      <div class="card">
        <div class="label">Questions Answered</div>
        <div class="value" id="answered">${data.answered}</div>
        <div class="sub">Failed: <span id="failed">${data.failed}</span></div>
      </div>
      <div class="card">
        <div class="label">Tool Executions</div>
        <div class="value" id="toolCalls">${data.toolCalls}</div>
        <div class="sub">Multi-step Agent</div>
      </div>
      <div class="card">
        <div class="label">Last Response</div>
        <div class="value" id="latency">${data.lastResponseMs}ms</div>
        <div class="sub">Round-trip latency</div>
      </div>
      <div class="card">
        <div class="label">Discord Gateway</div>
        <div class="value" id="ping">${data.pingMs}ms</div>
        <div class="sub">${data.guilds} server(s) connected</div>
      </div>
      <div class="card">
        <div class="label">Uptime</div>
        <div class="value" id="uptime">${data.uptimeSec}s</div>
        <div class="sub">Persistent daemon</div>
      </div>
      <div class="card">
        <div class="label">SQLite Memory</div>
        <div class="value" id="messages">${data.totalMessages}</div>
        <div class="sub">${data.channels} active channel(s)</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:2rem;padding:1rem;">
      <div class="label" style="display:flex;justify-content:space-between;align-items:center;">
        <span>Live Event Stream (SSE)</span>
        <span style="color:var(--green);font-size:0.7rem;">● LIVE</span>
      </div>
      <div id="terminal" style="font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:0.8rem;background:rgba(0,0,0,0.5);border:1px solid var(--border);border-radius:6px;padding:0.75rem;height:160px;overflow-y:auto;line-height:1.45;color:#e6edf3;">
        <div style="color:var(--muted)">Connecting to /events stream...</div>
      </div>
    </div>

    <footer>
      <div>Nova AI Assistant • Realtime Dashboard</div>
      <div style="display:flex;gap:1.25rem;">
        <a href="/tester">API Tester</a>
        <a href="/events">/events</a>
        <a href="/stats">/stats</a>
        <a href="/metrics">/metrics</a>
        <a href="/health">/health</a>
        <a href="https://github.com/rheatkhs/nova" target="_blank" rel="noopener">GitHub</a>
      </div>
    </footer>
  </div>
  <script>
    setInterval(async () => {
      try {
        const res = await fetch('/stats');
        const d = await res.json();
        document.getElementById('answered').innerText = d.answered;
        document.getElementById('failed').innerText = d.failed;
        document.getElementById('toolCalls').innerText = d.toolCalls;
        document.getElementById('latency').innerText = d.lastResponseMs + 'ms';
        document.getElementById('ping').innerText = d.pingMs + 'ms';
        document.getElementById('uptime').innerText = d.uptimeSec + 's';
        document.getElementById('messages').innerText = d.memory.totalMessages;
      } catch {}
    }, 5000);

    // SSE Live Stream Connection
    const term = document.getElementById('terminal');
    const es = new EventSource('/events');
    es.onopen = () => { term.innerHTML = ''; };
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        const color = ev.type === 'error' ? 'var(--red)' : ev.type === 'tool' ? 'var(--accent)' : 'var(--text)';
        const line = document.createElement('div');
        line.innerHTML = '<span style="color:var(--muted)">[' + ev.time + ']</span> <span style="color:' + color + '">[' + ev.type.toUpperCase() + ']</span> ' + ev.message;
        term.appendChild(line);
        term.scrollTop = term.scrollHeight;
      } catch {}
    };
  </script>
</body>
</html>`;
}
