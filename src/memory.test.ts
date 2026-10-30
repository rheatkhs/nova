import { expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { ConversationMemory } from './memory.ts';

test('appends messages up to limit in ephemeral mode', () => {
  const mem = new ConversationMemory(2, ':memory:');
  mem.append('c1', { role: 'user', content: '1' });
  mem.append('c1', { role: 'assistant', content: '2' });
  mem.append('c1', { role: 'user', content: '3' });

  expect(mem.get('c1').map((m) => m.content)).toEqual(['2', '3']);
  mem.close();
});

test('clear empties specified key only', () => {
  const mem = new ConversationMemory(5, ':memory:');
  mem.append('c1', { role: 'user', content: 'c1-msg' });
  mem.append('c2', { role: 'user', content: 'c2-msg' });

  mem.clear('c1');
  expect(mem.get('c1')).toEqual([]);
  expect(mem.get('c2').map((m) => m.content)).toEqual(['c2-msg']);
  mem.close();
});

test('persists history across instance restarts when backed by file', () => {
  const testDb = 'data/test-restart.db';
  try {
    const first = new ConversationMemory(10, testDb);
    first.append('c1', { role: 'user', content: 'remember me' });
    first.close();

    // Reopen same database file with fresh instance (simulates process restart)
    const second = new ConversationMemory(10, testDb);
    expect(second.get('c1').map((m) => m.content)).toEqual(['remember me']);
    second.close();
  } finally {
    try {
      rmSync(testDb);
      rmSync(`${testDb}-wal`);
      rmSync(`${testDb}-shm`);
    } catch {}
  }
});

test('limit 0 stores nothing', () => {
  const mem = new ConversationMemory(0, ':memory:');
  mem.append('c1', { role: 'user', content: 'discarded' });
  expect(mem.get('c1')).toEqual([]);
  mem.close();
});

test('stats reports accurate message counts and channel counts', () => {
  const mem = new ConversationMemory(10, ':memory:');
  expect(mem.stats()).toEqual({ totalMessages: 0, channels: 0 });

  mem.append('c1', { role: 'user', content: '1' }, { role: 'assistant', content: '2' });
  mem.append('c2', { role: 'user', content: '3' });
  expect(mem.stats()).toEqual({ totalMessages: 3, channels: 2 });

  mem.clear('c1');
  expect(mem.stats()).toEqual({ totalMessages: 1, channels: 1 });
  mem.close();
});
