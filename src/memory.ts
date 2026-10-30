import { Database, type Statement } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ChatMessage } from './ai.ts';

/**
 * Rolling per-channel chat history backed by SQLite via bun:sqlite.
 * Persists across restarts when given a file path; pass ':memory:' for ephemeral.
 */
export class ConversationMemory {
  readonly #limit: number;
  readonly #db: Database;
  readonly #getStmt: Statement<ChatMessage, [string, number]>;
  readonly #insertStmt: Statement<void, [string, string, string, number]>;
  readonly #pruneStmt: Statement<void, [string, string, number]>;
  readonly #clearStmt: Statement<void, [string]>;
  readonly #getPromptStmt: Statement<{ prompt: string }, [string]>;
  readonly #setPromptStmt: Statement<void, [string, string, number]>;
  readonly #clearPromptStmt: Statement<void, [string]>;
  readonly #getModelStmt: Statement<{ model: string }, [string]>;
  readonly #setModelStmt: Statement<void, [string, string, number]>;
  readonly #clearModelStmt: Statement<void, [string]>;

  constructor(limit: number, path = 'data/nova.db') {
    this.#limit = limit;
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.#db = new Database(path);
    if (path !== ':memory:') {
      this.#db.run('PRAGMA journal_mode = WAL;');
    }
    this.#db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_channel_id ON messages (channel_id, id);
      CREATE TABLE IF NOT EXISTS channel_prompts (
        channel_id TEXT PRIMARY KEY,
        prompt TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS channel_models (
        channel_id TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    this.#getStmt = this.#db.prepare(`
      SELECT role, content FROM (
        SELECT id, role, content FROM messages WHERE channel_id = ? ORDER BY id DESC LIMIT ?
      ) ORDER BY id ASC
    `);
    this.#insertStmt = this.#db.prepare(`
      INSERT INTO messages (channel_id, role, content, created_at) VALUES (?, ?, ?, ?)
    `);
    this.#pruneStmt = this.#db.prepare(`
      DELETE FROM messages WHERE channel_id = ? AND id NOT IN (
        SELECT id FROM messages WHERE channel_id = ? ORDER BY id DESC LIMIT ?
      )
    `);
    this.#clearStmt = this.#db.prepare('DELETE FROM messages WHERE channel_id = ?');
    this.#getPromptStmt = this.#db.prepare('SELECT prompt FROM channel_prompts WHERE channel_id = ?');
    this.#setPromptStmt = this.#db.prepare(`
      INSERT INTO channel_prompts (channel_id, prompt, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(channel_id) DO UPDATE SET prompt = excluded.prompt, updated_at = excluded.updated_at
    `);
    this.#clearPromptStmt = this.#db.prepare('DELETE FROM channel_prompts WHERE channel_id = ?');
    this.#getModelStmt = this.#db.prepare('SELECT model FROM channel_models WHERE channel_id = ?');
    this.#setModelStmt = this.#db.prepare(`
      INSERT INTO channel_models (channel_id, model, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(channel_id) DO UPDATE SET model = excluded.model, updated_at = excluded.updated_at
    `);
    this.#clearModelStmt = this.#db.prepare('DELETE FROM channel_models WHERE channel_id = ?');
  }

  get(key: string): readonly ChatMessage[] {
    if (this.#limit <= 0) return [];
    return this.#getStmt.all(key, this.#limit);
  }

  append(key: string, ...messages: ChatMessage[]): void {
    if (this.#limit <= 0 || messages.length === 0) return;
    const now = Date.now();
    const insertMany = this.#db.transaction((msgs: ChatMessage[]) => {
      for (const m of msgs) {
        const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        this.#insertStmt.run(key, m.role, text, now);
      }
      this.#pruneStmt.run(key, key, this.#limit);
    });
    insertMany(messages);
  }
  clear(key: string): void {
    this.#clearStmt.run(key);
  }

  getPrompt(channelId: string): string | null {
    const row = this.#getPromptStmt.get(channelId);
    return row?.prompt ?? null;
  }

  setPrompt(channelId: string, prompt: string): void {
    this.#setPromptStmt.run(channelId, prompt, Date.now());
  }

  clearPrompt(channelId: string): void {
    this.#clearPromptStmt.run(channelId);
  }

  getModel(channelId: string): string | null {
    const row = this.#getModelStmt.get(channelId);
    return row?.model ?? null;
  }

  setModel(channelId: string, model: string): void {
    this.#setModelStmt.run(channelId, model, Date.now());
  }

  clearModel(channelId: string): void {
    this.#clearModelStmt.run(channelId);
  }

  stats(): { totalMessages: number; channels: number } {
    const row = this.#db
      .query('SELECT count(*) AS total, count(DISTINCT channel_id) AS channels FROM messages')
      .get() as { total: number; channels: number } | null;
    return {
      totalMessages: row?.total ?? 0,
      channels: row?.channels ?? 0,
    };
  }

  close(): void {
    this.#db.close();
  }
}
