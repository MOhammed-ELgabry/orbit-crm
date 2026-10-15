/**
 * Tiny in-memory sliding-window counter (per key). Used to slow down
 * handshake abuse before any database work happens. Bounded: stale keys are
 * pruned on access and the map is capped.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  tryAcquire(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter(
      (t) => now - t < this.windowMs,
    );

    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }

    recent.push(now);
    this.hits.set(key, recent);

    if (this.hits.size > this.maxKeys) this.prune(now);

    return true;
  }

  private prune(now: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(key);
    }

    // Still too large (attack with many distinct keys): drop the oldest.
    while (this.hits.size > this.maxKeys) {
      const first = this.hits.keys().next();
      if (first.done) break;
      this.hits.delete(first.value);
    }
  }
}
