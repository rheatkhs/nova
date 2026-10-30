import { expect, test } from 'bun:test';
import { ConversationMemory } from './memory.ts';

test('appends messages up to limit', () => {
  const mem = new ConversationMemory(2);
  mem.append('c1', { role: 'user', content: '1' });
  mem.append('c1', { role: 'assistant', content: '2' });
  mem.append('c1', { role: 'user', content: '3' });

  expect(mem.get('c1').map((m) => m.content)).toEqual(['2', '3']);
});

test('clear empties specified key only', () => {
  const mem = new ConversationMemory(5);
  mem.append('c1', { role: 'user', content: 'c1-msg' });
  mem.append('c2', { role: 'user', content: 'c2-msg' });

  mem.clear('c1');
  expect(mem.get('c1')).toEqual([]);
  expect(mem.get('c2').map((m) => m.content)).toEqual(['c2-msg']);
});
