import { expect, test } from 'bun:test';
import { chunk } from './chunk.ts';

test('chunk respects limit and preserves content', () => {
  expect(chunk('')).toEqual([]);
  expect(chunk('short')).toEqual(['short']);
  expect(chunk('aaa bbb ccc', 7)).toEqual(['aaa bbb', 'ccc']);
  expect(chunk('aaa\nbbb ccc', 9)).toEqual(['aaa', 'bbb ccc']);
  expect(chunk('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']); // no break point: hard cut

  const long = Array.from({ length: 500 }, (_, i) => `word${i}`).join(' ');
  const parts = chunk(long);
  expect(parts.length).toBeGreaterThan(1);
  expect(parts.every((p) => p.length <= 2000)).toBe(true);
  expect(parts.join(' ')).toBe(long);
});
