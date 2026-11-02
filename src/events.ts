import { EventEmitter } from 'node:events';

export interface BotEvent {
  time: string;
  type: 'info' | 'message' | 'tool' | 'error' | 'answer';
  message: string;
}

class EventBus extends EventEmitter {
  readonly #history: BotEvent[] = [];
  readonly #max = 100;

  broadcast(type: BotEvent['type'], message: string): void {
    const event: BotEvent = {
      time: new Date().toISOString().slice(11, 19),
      type,
      message,
    };
    this.#history.push(event);
    if (this.#history.length > this.#max) {
      this.#history.shift();
    }
    this.emit('event', event);
  }

  recent(): readonly BotEvent[] {
    return this.#history;
  }
}

export const events = new EventBus();
