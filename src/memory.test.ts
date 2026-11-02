import { expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { ConversationMemory, trimToBudget } from './memory.ts';

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

test('getPrompt and setPrompt persist custom channel persona', () => {
  const mem = new ConversationMemory(10, ':memory:');
  expect(mem.getPrompt('c1')).toBeNull();

  mem.setPrompt('c1', 'You are a pirate.');
  expect(mem.getPrompt('c1')).toBe('You are a pirate.');
  expect(mem.getPrompt('c2')).toBeNull();

  // Overwrite
  mem.setPrompt('c1', 'You are a chef.');
  expect(mem.getPrompt('c1')).toBe('You are a chef.');

  // Clear
  mem.clearPrompt('c1');
  expect(mem.getPrompt('c1')).toBeNull();
  mem.close();
});

test('getModel and setModel persist custom channel model', () => {
  const mem = new ConversationMemory(10, ':memory:');
  expect(mem.getModel('c1')).toBeNull();

  mem.setModel('c1', 'ag/claude-sonnet-5-5');
  expect(mem.getModel('c1')).toBe('ag/claude-sonnet-5-5');
  expect(mem.getModel('c2')).toBeNull();

  // Overwrite
  mem.setModel('c1', 'ag/gemini-3.8-flash');
  expect(mem.getModel('c1')).toBe('ag/gemini-3.8-flash');

  // Clear
  mem.clearModel('c1');
  expect(mem.getModel('c1')).toBeNull();
  mem.close();
});

test('getTemperature and setTemperature persist custom channel temperature', () => {
  const mem = new ConversationMemory(10, ':memory:');
  expect(mem.getTemperature('c1')).toBeNull();

  mem.setTemperature('c1', 0.2);
  expect(mem.getTemperature('c1')).toBe(0.2);
  expect(mem.getTemperature('c2')).toBeNull();

  // Overwrite
  mem.setTemperature('c1', 0.85);
  expect(mem.getTemperature('c1')).toBe(0.85);

  // Clear
  mem.clearTemperature('c1');
  expect(mem.getTemperature('c1')).toBeNull();
  mem.close();
});

test('getLanguage and setLanguage persist custom channel language', () => {
  const mem = new ConversationMemory(10, ':memory:');
  expect(mem.getLanguage('c1')).toBeNull();

  mem.setLanguage('c1', 'Vietnamese');
  expect(mem.getLanguage('c1')).toBe('Vietnamese');
  expect(mem.getLanguage('c2')).toBeNull();

  // Overwrite
  mem.setLanguage('c1', 'Japanese');
  expect(mem.getLanguage('c1')).toBe('Japanese');

  // Clear
  mem.clearLanguage('c1');
  expect(mem.getLanguage('c1')).toBeNull();
  mem.close();
});

test('trimToBudget preserves newest messages within character limit', () => {
  const msgs = [
    { role: 'user' as const, content: 'aaaa' }, // 4 chars
    { role: 'assistant' as const, content: 'bbbb' }, // 4 chars
    { role: 'user' as const, content: 'cccc' }, // 4 chars
  ];

  // Limit 9 allows 'bbbb' and 'cccc' (8 chars), prunes 'aaaa'
  expect(trimToBudget(msgs, 9).map((m) => m.content)).toEqual(['bbbb', 'cccc']);

  // Limit 4 allows only 'cccc'
  expect(trimToBudget(msgs, 4).map((m) => m.content)).toEqual(['cccc']);

  // Limit 100 allows all
  expect(trimToBudget(msgs, 100).map((m) => m.content)).toEqual(['aaaa', 'bbbb', 'cccc']);
});

test('ConversationMemory.get trims with maxCharacters argument', () => {
  const mem = new ConversationMemory(10, ':memory:');
  mem.append('c1', { role: 'user', content: '12345' });
  mem.append('c1', { role: 'assistant', content: '67890' });

  expect(mem.get('c1', 7).map((m) => m.content)).toEqual(['67890']);
  expect(mem.get('c1', 20).map((m) => m.content)).toEqual(['12345', '67890']);
  mem.close();
});

test('optimize and vacuum execute without errors', () => {
  const mem = new ConversationMemory(10, ':memory:');
  mem.append('c1', { role: 'user', content: 'test optimize' });
  expect(mem.optimize()).toBe(true);
  expect(mem.vacuum()).toBe(true);
  mem.close();
});
