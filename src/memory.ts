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
        this.#insertStmt.run(key, m.role, m.content, now);
      }
      this.#pruneStmt.run(key, key, this.#limit);
    });
    insertMany(messages);
  }

  clear(key: string): void {
    this.#clearStmt.run(key);
  }

  close(): void {
    this.#db.close();
  }
}
