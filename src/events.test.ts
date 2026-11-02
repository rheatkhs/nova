import { expect, test } from 'bun:test';
import { events } from './events.ts';

test('events bus records events in ring buffer and emits to listeners', () => {
  const captured: string[] = [];
  function handleEvent(ev: { message: string }): void {
    captured.push(ev.message);
  }

  events.on('event', handleEvent);
  events.broadcast('info', 'Boot sequence initiated');
  events.broadcast('tool', 'Search executed');
  events.off('event', handleEvent);

  expect(captured).toEqual(['Boot sequence initiated', 'Search executed']);

  const recent = events.recent();
  expect(recent.length).toBeGreaterThanOrEqual(2);
  expect(recent.some((e) => e.message === 'Boot sequence initiated')).toBe(true);
});
