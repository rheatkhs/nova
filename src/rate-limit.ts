export interface RateLimiter {
  /** Returns true if the action is allowed, false if the user must wait. */
  check(userId: string, now?: number): boolean;
}

/**
 * Enforces a minimum cooldown between actions per user.
 * ponytail: in-memory, resets on process restart; fine for single-instance bot.
 */
export function createRateLimiter(cooldownMs: number): RateLimiter {
  if (cooldownMs <= 0) return { check: () => true };

  const lastSeen = new Map<string, number>();

  return {
    check(userId: string, now = Date.now()): boolean {
      const prev = lastSeen.get(userId);
      if (prev !== undefined && now - prev < cooldownMs) {
        return false;
      }
      lastSeen.set(userId, now);
      // Prune occasionally when map grows.
      if (lastSeen.size > 1_000) {
        for (const [id, time] of lastSeen) {
          if (now - time >= cooldownMs) lastSeen.delete(id);
        }
      }
      return true;
    },
  };
}
