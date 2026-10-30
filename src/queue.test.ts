import { expect, test } from 'bun:test';
import { createQueue } from './queue.ts';

test('serializes tasks on the same key', async () => {
  const queue = createQueue();
  const order: number[] = [];
  const { promise: gate, resolve } = Promise.withResolvers<void>();

  const a = queue('k1', async () => {
    await gate;
    order.push(1);
  });
  const b = queue('k1', async () => {
    order.push(2);
  });

  expect(order).toEqual([]);
  resolve();
  await Promise.all([a, b]);
  expect(order).toEqual([1, 2]);
});

test('runs different keys concurrently', async () => {
  const queue = createQueue();
  const order: string[] = [];
  const { promise: slowStarted, resolve: markStarted } = Promise.withResolvers<void>();
  const { promise: releaseSlow, resolve: release } = Promise.withResolvers<void>();

  const slow = queue('slow', async () => {
    markStarted();
    await releaseSlow;
    order.push('slow');
  });

  await slowStarted;
  const fast = queue('fast', async () => {
    order.push('fast');
  });

  await fast;
  expect(order).toEqual(['fast']);
  release();
  await slow;
  expect(order).toEqual(['fast', 'slow']);
});

test('rejection does not stall subsequent tasks', async () => {
  const queue = createQueue();
  const order: number[] = [];

  const a = queue('k1', async () => {
    throw new Error('boom');
  });
  const b = queue('k1', async () => {
    order.push(2);
    return 'ok';
  });

  await expect(a).rejects.toThrow('boom');
  expect(await b).toBe('ok');
  expect(order).toEqual([2]);
});
