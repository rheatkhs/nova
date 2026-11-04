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
<html lang="en" class="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nova AI • Analytics & Operations</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    :root {
      --background: #09090b;
      --foreground: #fafafa;
      --card: #121215;
      --card-foreground: #fafafa;
      --border: #27272a;
      --muted: #a1a1aa;
      --muted-foreground: #71717a;
      --primary: #6366f1;
      --primary-foreground: #ffffff;
      --success: #22c55e;
      --destructive: #ef4444;
      --radius: 0.75rem;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--background);
      color: var(--foreground);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      display: flex;
      overflow-x: hidden;
    }
    .sidebar {
      width: 260px;
      background: var(--card);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      padding: 1.5rem;
      justify-content: space-between;
      display: none;
    }
    @media(min-width: 768px) {
      .sidebar { display: flex; }
    }
    .logo-area { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 2.5rem; }
    .logo-icon { width: 34px; height: 34px; background: linear-gradient(135deg, #6366f1, #a855f7); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 0 15px rgba(99, 102, 241, 0.4); }
    .logo-text { font-size: 1.125rem; font-weight: 700; letter-spacing: -0.025em; }
    .nav-links { display: flex; flex-direction: column; gap: 0.5rem; }
    .nav-link { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; border-radius: 0.5rem; color: var(--muted); text-decoration: none; font-size: 0.875rem; font-weight: 500; transition: all 0.2s; }
    .nav-link:hover, .nav-link.active { background: rgba(255, 255, 255, 0.05); color: var(--foreground); }
    .nav-link svg { width: 18px; height: 18px; }
    
    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    header {
      height: 70px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 2rem;
      background: rgba(9, 9, 11, 0.8);
      backdrop-filter: blur(8px);
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .header-title { font-size: 1.25rem; font-weight: 600; letter-spacing: -0.025em; display: flex; align-items: center; gap: 0.5rem; }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      background: rgba(34, 197, 94, 0.1);
      color: var(--success);
      border: 1px solid rgba(34, 197, 94, 0.2);
    }
    .status-badge.offline {
      background: rgba(239, 68, 68, 0.1);
      color: var(--destructive);
      border-color: rgba(239, 68, 68, 0.2);
    }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 8px currentColor; }
    
    .dashboard-body {
      padding: 2rem;
      max-width: 1400px;
      width: 100%;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1.25rem;
    }
    .metric-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    .metric-header { display: flex; justify-content: space-between; align-items: center; color: var(--muted); font-size: 0.875rem; font-weight: 500; }
    .metric-header svg { width: 18px; height: 18px; color: var(--primary); }
    .metric-value { font-size: 2rem; font-weight: 700; letter-spacing: -0.025em; font-family: 'JetBrains Mono', monospace; }
    .metric-sub { font-size: 0.75rem; color: var(--muted-foreground); display: flex; align-items: center; gap: 0.35rem; }
    
    .panel-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }
    @media(min-width: 1024px) {
      .panel-grid { grid-template-columns: 2fr 1fr; }
    }
    .panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .panel-title { font-size: 1rem; font-weight: 600; display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
    .panel-title svg { width: 18px; height: 18px; color: var(--muted); }
    
    .terminal {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      background: #050507;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 1rem;
      height: 320px;
      overflow-y: auto;
      line-height: 1.6;
      color: #e4e4e7;
    }
    .terminal-line { margin-bottom: 0.35rem; word-break: break-all; }
    .time { color: var(--muted-foreground); }
    
    .system-info-list { display: flex; flex-direction: column; gap: 0.85rem; }
    .info-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.875rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border); }
    .info-row:last-child { border-bottom: none; padding-bottom: 0; }
    .info-label { color: var(--muted); }
    .info-val { font-weight: 600; font-family: 'JetBrains Mono', monospace; }

    footer {
      border-top: 1px solid var(--border);
      padding: 1.5rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.875rem;
      color: var(--muted);
      flex-wrap: wrap;
      gap: 1rem;
      margin-top: auto;
    }
    .footer-links { display: flex; gap: 1.5rem; }
    .footer-links a { color: var(--muted); text-decoration: none; transition: color 0.2s; display: flex; align-items: center; gap: 0.4rem; }
    .footer-links a:hover { color: var(--foreground); }
    .footer-links svg { width: 16px; height: 16px; }
  </style>
</head>
<body>
  <div class="sidebar">
    <div>
      <div class="logo-area">
        <div class="logo-icon">
          <i data-lucide="bot"></i>
        </div>
        <div class="logo-text">Nova AI</div>
      </div>
      <div class="nav-links">
        <a href="/" class="nav-link active"><i data-lucide="layout-dashboard"></i> AI Analytics</a>
        <a href="/tester" class="nav-link"><i data-lucide="zap"></i> API Tester</a>
        <a href="/events" class="nav-link"><i data-lucide="radio"></i> SSE Stream</a>
        <a href="/stats" class="nav-link"><i data-lucide="bar-chart-3"></i> Raw Stats</a>
        <a href="/health" class="nav-link"><i data-lucide="heart-pulse"></i> Health Check</a>
      </div>
    </div>
    <div style="font-size: 0.75rem; color: var(--muted-foreground); padding-top: 1rem; border-top: 1px solid var(--border); display: flex; align-items: center; gap: 0.5rem;">
      <i data-lucide="shield-check" style="width: 14px; height: 14px; color: var(--success);"></i> Secure Auth Enabled
    </div>
  </div>

  <div class="main-content">
    <header>
      <div class="header-title">
        <i data-lucide="activity" style="color: var(--primary);"></i> Nova AI Analytics
      </div>
      <div class="status-badge ${data.ready ? '' : 'offline'}">
        <span class="dot"></span>
        <span>${data.ready ? 'ONLINE' : 'OFFLINE'}</span>
      </div>
    </header>

    <div class="dashboard-body">
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-header">
            <span>Questions Answered</span>
            <i data-lucide="message-square"></i>
          </div>
          <div class="metric-value" id="answered">${data.answered}</div>
          <div class="metric-sub"><span>Failed requests:</span> <strong id="failed" style="color:var(--destructive);">${data.failed}</strong></div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span>Tool Executions</span>
            <i data-lucide="cpu"></i>
          </div>
          <div class="metric-value" id="toolCalls">${data.toolCalls}</div>
          <div class="metric-sub"><span>Multi-step AI agent loops</span></div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span>Round-Trip Latency</span>
            <i data-lucide="timer"></i>
          </div>
          <div class="metric-value" id="latency">${data.lastResponseMs}ms</div>
          <div class="metric-sub"><span>LLM inference & response</span></div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span>Discord Gateway</span>
            <i data-lucide="radio"></i>
          </div>
          <div class="metric-value" id="ping">${data.pingMs}ms</div>
          <div class="metric-sub"><span>Connected to <strong>${data.guilds}</strong> guild(s)</span></div>
        </div>
      </div>

      <div class="panel-grid">
        <div class="panel">
          <div class="panel-title">
            <span style="display:flex;align-items:center;gap:0.5rem;"><i data-lucide="terminal"></i> Real-Time Event Stream (SSE)</span>
            <span style="font-size: 0.75rem; color: var(--success); font-weight: 500;">● STREAM ACTIVE</span>
          </div>
          <div class="terminal" id="terminal">
            <div style="color: var(--muted);">Connecting to event stream...</div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-title">
            <i data-lucide="server"></i> System Information
          </div>
          <div class="system-info-list">
            <div class="info-row">
              <span class="info-label">Active Model</span>
              <span class="info-val" id="model">${data.model}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Daemon Uptime</span>
              <span class="info-val" id="uptime">${data.uptimeSec}s</span>
            </div>
            <div class="info-row">
              <span class="info-label">SQLite Messages</span>
              <span class="info-val" id="messages">${data.totalMessages}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Active Channels</span>
              <span class="info-val" id="channels">${data.channels}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Runtime Engine</span>
              <span class="info-val">Bun v1.4</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer>
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <i data-lucide="shield" style="width:16px;height:16px;color:var(--primary);"></i> Nova AI Analytics Dashboard • Powered by Elysia & Bun
      </div>
      <div class="footer-links">
        <a href="/tester"><i data-lucide="zap"></i> API Tester</a>
        <a href="/events"><i data-lucide="radio"></i> SSE Stream</a>
        <a href="/stats"><i data-lucide="database"></i> JSON Stats</a>
        <a href="https://github.com/rheatkhs/nova" target="_blank" rel="noopener"><i data-lucide="github"></i> GitHub</a>
      </div>
    </footer>
  </div>

  <script>
    lucide.createIcons();

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
        document.getElementById('channels').innerText = d.memory.channels;
      } catch {}
    }, 4000);

    const term = document.getElementById('terminal');
    const es = new EventSource('/events');
    es.onopen = () => { term.innerHTML = '<div style="color:var(--muted)">Connected to live stream...</div>'; };
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        const color = ev.type === 'error' ? 'var(--destructive)' : ev.type === 'tool' ? 'var(--primary)' : 'var(--success)';
        const line = document.createElement('div');
        line.className = 'terminal-line';
        line.innerHTML = '<span class="time">[' + ev.time + ']</span> <span style="color:' + color + ';font-weight:600;">[' + ev.type.toUpperCase() + ']</span> ' + ev.message;
        term.appendChild(line);
        term.scrollTop = term.scrollHeight;
        if (term.childElementCount > 100) term.firstChild.remove();
      } catch {}
    };
  </script>
</body>
</html>`;
}
