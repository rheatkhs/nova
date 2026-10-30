import { expect, test } from 'bun:test';
import { createRateLimiter } from './rate-limit.ts';

test('disabled when cooldown is 0', () => {
  const limiter = createRateLimiter(0);
  expect(limiter.check('u1', 100)).toBe(true);
  expect(limiter.check('u1', 100)).toBe(true);
});

test('blocks calls within cooldown, allows after', () => {
  const limiter = createRateLimiter(3_000);
  expect(limiter.check('u1', 1_000)).toBe(true);
  expect(limiter.check('u1', 2_000)).toBe(false); // only 1s passed
  expect(limiter.check('u1', 3_999)).toBe(false); // 2.999s passed
  expect(limiter.check('u1', 4_000)).toBe(true);  // exactly 3s passed
  expect(limiter.check('u1', 4_500)).toBe(false); // cooldown reset at 4_000
});

test('tracks users independently', () => {
  const limiter = createRateLimiter(3_000);
  expect(limiter.check('u1', 1_000)).toBe(true);
  expect(limiter.check('u2', 1_000)).toBe(true);
  expect(limiter.check('u1', 1_500)).toBe(false);
  expect(limiter.check('u2', 4_500)).toBe(true);
});
