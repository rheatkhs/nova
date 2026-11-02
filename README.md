# Nova

AI agent Discord bot. Answers when mentioned, replied to, DMed, in configured channels, or in active threads. Supports image vision, text/code file attachments, and tools. Use `/help` for commands guide, `/stats` for live metrics, `/ask-thread` to spawn dedicated discussion threads, `/reset` to clear memory, `/export` to download chat history, `/prompt` to set per-channel personas, `/model` to switch models, and `/temperature` to adjust creativity per channel.

## Setup

1. Create an app at https://discord.com/developers/applications. In **Bot**, copy the token and enable **Message Content Intent**.
2. Invite the bot: **OAuth2 > URL Generator**, scopes `bot` and `applications.commands` (for `/help`, `/stats`, `/ask-thread`, `/reset`, `/export`, `/prompt`, `/model`, `/temperature`), permissions `Send Messages`, `Read Message History`, `Create Public Threads`, `Send Messages in Threads`.
3. `cp .env.example .env` and fill in `DISCORD_TOKEN`, `AI_API_KEY`, and `AI_MODEL`. Any OpenAI-compatible API works, including local Ollama with `AI_BASE_URL=http://localhost:11434/v1`.
4. `bun install && bun start`

Requires [Bun](https://bun.sh) 1.2+ (runs TypeScript and loads `.env` natively).

### Docker

```bash
docker build -t nova .
# Reaching host APIs (like 9router on localhost:20128) needs --network host on Linux:
docker run -d --name nova --env-file .env --network host nova
```

## Tools

Nova runs an agent loop (`maxToolSteps = 5`) with built-in tools:

| Tool | Purpose |
| --- | --- |
| `get_current_time` | Returns real-time UTC timestamp, date, and day of week |
| `eval_math` | Evaluates arithmetic, trigonometry, powers, and roots safely |
| `wikipedia_search` | Official Wikipedia search API for facts, people, and concepts |
| `web_search` | Real-time web search via Brave Search API or self-hosted SearXNG |
| `fetch_page` | Fetches any HTTP/HTTPS URL, strips HTML/scripts, returns text |
| `read_channel_history` | Reads recent chat messages in the current Discord channel (contextual tool) |


## Status API

Elysia server on `HOST:PORT` (default `127.0.0.1:3000`):

| Route | Response |
| --- | --- |
| `GET /health` | `200 {"ok":true}` when connected to Discord, else `503` |
| `GET /stats` | Ready state, uptime, guild count, gateway ping, model name, answered/failed/toolCalls counts, and SQLite memory metrics |

## Scripts

| Command | Purpose |
| --- | --- |
| `bun start` | Run the bot |
| `bun dev` | Run with auto-restart on file change |
| `bun typecheck` | Strict type check (`tsc`) |
| `bun test` | Unit tests |

## Workflow

Every change lands on `main` through a pull request that passes CI (`bun typecheck`, `bun test`). No direct pushes to `main`.

1. Branch from `main`: `git switch main && git pull && git switch -c <type>/<short-name>`.
2. Commit with [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `ci:`, `docs:`, `refactor:`, `test:`, `chore:`.
3. Push and open a PR: `git push -u origin HEAD && gh pr create --fill`.
4. Merge once CI is green: `gh pr merge --squash`. The PR title becomes the commit on `main`; the branch is deleted automatically.
5. Clean up locally: `git switch main && git pull --prune && git branch -d <branch>`.

## Layout

| File | Role |
| --- | --- |
| `src/index.ts` | Wires config, AI client, memory, bot, and status API |
| `src/config.ts` | Loads and validates env vars |
| `src/ai.ts` | Multi-step agent loop with tool-calling support |
| `src/tools.ts` | Built-in tools: `get_current_time`, `wikipedia_search`, `fetch_page` |
| `src/memory.ts` | Rolling per-channel history backed by SQLite (`bun:sqlite`) |
| `src/bot.ts` | Discord client and message handling |
| `src/chunk.ts` | Splits replies to Discord's 2000-char limit |
| `src/server.ts` | Elysia status API |
