# Nova

High-performance AI agent Discord bot built with [Bun](https://bun.sh), TypeScript, discord.js, and Elysia.

Answers when mentioned, replied to, DMed, in configured channels, or in active threads. Supports multimodal vision analysis, text and code attachments, tool execution, interactive message action buttons, and live slash commands.

---

## Highlights

- **Multi-Step Agent Loop:** Concurrent tool calling with automatic fallback cascade (`AI_FALLBACK_MODEL`), prompt leak protection, and reasoning process expanders (`||💭 Thought: ...||`).
- **Interactive Discord UI:**
  - **Action Buttons:** `🧵 Thread` (inline discussion), `📥 Code` (snippet extraction to file), `🔄 Regenerate` (in-place turn re-execution), `📩 Save` (instant DM jump-link), `🗑️ Delete` (author or moderator dismissal).
  - **Slash Commands & Autocomplete:** Real-time search for models and languages (`/model`, `/language`), modal GUI persona editor (`/prompt`), conversation recaps (`/reset recap:true`), and history exports (`/export`).
  - **Right-Click Context Menus:** `Apps > Explain with Nova` and `Apps > Summarize with Nova`.
  - **Rich Reply Footers:** Native Discord subtext displaying active model, round-trip latency (`ms`), and deduplicated tool badges (`🔎 web_search • 📊 render_chart`).
- **Persistent SQLite Storage:** Backed by `bun:sqlite` with WAL mode, automated startup optimization (`PRAGMA optimize; VACUUM;`), and dynamic token-budget history trimming.
- **Observability:** Glassmorphism dark-mode web status dashboard on `GET /`, health checks with DB probes on `GET /health`, JSON stats on `GET /stats`, and Prometheus metrics on `GET /metrics`.

---

## Setup

1. Create a Discord application at https://discord.com/developers/applications. In the **Bot** tab, copy the token and enable **Message Content Intent**.
2. Invite the bot: **OAuth2 > URL Generator**
   - **Scopes:** `bot`, `applications.commands`
   - **Permissions:** `Send Messages`, `Read Message History`, `Create Public Threads`, `Send Messages in Threads`, `Add Reactions`, `Attach Files`
3. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```
   Fill in `DISCORD_TOKEN`, `AI_API_KEY`, and `AI_MODEL`. Any OpenAI-compatible API works (e.g. OpenAI, OpenRouter, Groq, 9router, or local Ollama with `AI_BASE_URL=http://localhost:11434/v1`).
4. Install and run:
   ```bash
   bun install
   bun start
   ```

---

## Commands & Interaction

### Slash Commands
| Command | Options | Description |
|---|---|---|
| `/help` | — | Display in-Discord user guide, active tools, and command reference |
| `/stats` | — | View live operational metrics, latency, model, and SQLite counts (Ephemeral) |
| `/ask-thread` | `question` | Ask a question and automatically spawn a dedicated discussion thread for the answer |
| `/reset` | `recap` *(bool)* | Clear channel conversation history, with optional 2–3 sentence summary recap |
| `/export` | `format` *(md/json)* | Download channel conversation history as a formatted Markdown or JSON file |
| `/prompt` | `text` *(optional)* | View, set, or open Modal GUI editor for custom channel system prompts (Admins) |
| `/model` | `name` *(optional)* | View, pick from select menu, or autocomplete switch active model per channel (Admins) |
| `/temperature` | `value` *(0.0–2.0)* | View or adjust AI temperature and creativity level per channel (Admins) |
| `/language` | `name` *(optional)* | View or autocomplete enforce fixed response language per channel (Admins) |

### Context Menus & Buttons
- **Right-Click Apps:** Right-click any message $\to$ `Apps` $\to$ `Explain with Nova` or `Summarize with Nova`.
- **Reply Action Row:**
  - `🧵 Thread`: Spawns an inline public discussion thread under the answer.
  - `📥 Code`: Extracts the primary code fence and uploads it as a downloadable source file.
  - `🔄 Regenerate`: Re-runs the question turn with the model and updates the reply in-place.
  - `📩 Save`: Sends a copy of the response with message jump-link directly to your private DMs.
  - `🗑️ Delete`: Deletes the response message (restricted to question author or moderators).

---

## Built-in Agent Tools

Nova executes tools concurrently during the agent loop (`maxToolSteps = 5`):

| Tool | Icon | Purpose |
|---|:---:|---|
| `web_search` | 🔎 | Real-time web search via Brave Search API or SearXNG (falls back to Wikipedia if unconfigured) |
| `wikipedia_search` | 🔍 | Official Wikipedia REST API search for facts, history, people, and concepts |
| `fetch_page` | 🌐 | Fetches any HTTP/HTTPS URL, strips HTML/scripts, returns sanitized readable text |
| `render_chart` | 📊 | Generates dark-themed charts (bar, line, pie, doughnut) rendered inline via QuickChart |
| `render_diagram` | 📐 | Renders architecture, sequence, and flowcharts visually using Mermaid syntax |
| `render_html` | 💻 | Serves live interactive HTML/CSS/JS sandbox applications via `/view/:id` |
| `generate_image` | 🎨 | Generates AI artwork and realistic photos with custom aspect ratios |
| `create_poll` | 🗳️ | Generates formatted numbered polls with reaction emojis for voting |
| `create_quiz` | 🧠 | Generates interactive multiple-choice quizzes with clickable answer buttons |
| `eval_math` | 🔢 | Safe recursive-descent math evaluator (+, -, *, /, %, ^, sqrt, trig, logs, constants) |
| `get_current_time` | ⏱️ | Real-time UTC timestamp, date, and day of week |
| `create_reminder` | ⏰ | Schedules automated reminder timer pings back to the channel (contextual tool) |
| `test_webhook` | 📡 | Tests external HTTP endpoints and simulates webhook deliveries with latency stats |
| `read_channel_history` | 📜 | Reads recent chat messages in the active channel (contextual tool) |

---

## Status API & Observability

Elysia HTTP server runs on `HOST:PORT` (default `127.0.0.1:3000`):

| Route | Format | Purpose |
|---|---|---|
| `GET /` | HTML | Sleek glassmorphism dark-mode status web dashboard with live auto-refreshing metrics |
| `GET /health` | JSON | `200 {"ok":true}` when Discord gateway is connected and SQLite is accessible, else `503` |
| `GET /stats` | JSON | Uptime, server count, gateway ping, active model, latency, and message metrics |
| `GET /metrics` | Plaintext | Prometheus exposition format metrics for scraping (Prometheus / Grafana / Datadog) |
| `GET /events` | SSE Stream | Live Server-Sent Events stream of real-time bot operations, tools, and logs |

---

## Docker Deployment

```bash
docker build -t nova .

# If connecting to host APIs (like 9router on localhost:20128) on Linux:
docker run -d \
  --name nova \
  --env-file .env \
  --network host \
  -v $(pwd)/data:/app/data \
  nova
```

---

## Development & Workflow

Every change lands on `main` through a pull request that passes CI (`bun typecheck`, `bun test`). Direct pushes to `main` are restricted.

```bash
bun start       # Run the bot
bun dev         # Run with auto-restart on file change
bun typecheck   # Strict type check (tsc)
bun test        # Unit tests
```

### Layout

| File | Role |
|---|---|
| `src/index.ts` | Wires configuration, AI client, SQLite memory, bot client, and Elysia API |
| `src/config.ts` | Loads and validates environment variables |
| `src/ai.ts` | OpenAI-compatible multi-step agent loop, tool calling, and fallback cascade |
| `src/tools.ts` | Built-in zero-dependency tools suite |
| `src/memory.ts` | Rolling per-channel history, persona, and model storage backed by SQLite |
| `src/bot.ts` | Discord client, message handling, components, modals, and slash commands |
| `src/chunk.ts` | Splits long replies, preserves code fences, and auto-detects code languages |
| `src/server.ts` | Elysia status, health probe, and metrics endpoints |
| `src/dashboard.ts`| Dark-mode glassmorphism web dashboard HTML renderer |
