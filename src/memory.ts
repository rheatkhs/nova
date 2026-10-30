import type { ChatMessage } from './ai.ts';

/**
 * Rolling per-channel chat history.
 * ponytail: in-memory, lost on restart; back with SQLite when persistence matters.
 */
export class ConversationMemory {
  readonly #limit: number;
  readonly #history = new Map<string, ChatMessage[]>();

  constructor(limit: number) {
    this.#limit = limit;
  }

  get(key: string): readonly ChatMessage[] {
    return this.#history.get(key) ?? [];
  }

  append(key: string, ...messages: ChatMessage[]): void {
    const history = [...this.get(key), ...messages];
    this.#history.set(key, this.#limit > 0 ? history.slice(-this.#limit) : []);
  }
}
