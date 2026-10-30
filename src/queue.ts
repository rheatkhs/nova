export type TaskQueue = <T>(key: string, task: () => Promise<T>) => Promise<T>;

/**
 * Runs async tasks sequentially per key. A rejection in one task does not block later ones.
 * ponytail: unbounded keys in memory; fine for normal guild count, add TTL if memory climbs.
 */
export function createQueue(): TaskQueue {
  const chains = new Map<string, Promise<unknown>>();

  return async function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = chains.get(key) ?? Promise.resolve();
    // Chain off prev regardless of whether it fulfilled or rejected.
    const run = prev.then(task, task);
    // Suppress unhandled rejection on the stored chain; callers await `run` directly.
    chains.set(key, run.catch(() => {}));
    try {
      return await run;
    } finally {
      if (chains.get(key) === run) chains.delete(key);
    }
  };
}
