/**
 * Sliding-window limiter keyed by an arbitrary string (user, user+command,
 * guild). In-memory by design: limits protect the bot process and Discord
 * rate limits; durable abuse throttling lives in the KUSH API.
 */
export class SlidingWindowLimiter {
  readonly #hits = new Map<string, number[]>();
  readonly #warned = new Map<string, number>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit and reports whether it is allowed. */
  take(key: string): { allowed: boolean; retryAfterMs: number } {
    const now = this.now();
    const recent = (this.#hits.get(key) ?? []).filter(
      (time) => time > now - this.windowMs,
    );
    if (recent.length >= this.limit) {
      this.#hits.set(key, recent);
      return { allowed: false, retryAfterMs: recent[0]! + this.windowMs - now };
    }
    recent.push(now);
    this.#hits.set(key, recent);
    return { allowed: true, retryAfterMs: 0 };
  }

  /** True once per window, so a throttled user gets one notice, not many. */
  shouldWarn(key: string): boolean {
    const now = this.now();
    const last = this.#warned.get(key);
    if (last !== undefined && last > now - this.windowMs) return false;
    this.#warned.set(key, now);
    return true;
  }

  /** Hits still inside the window for a key, without recording a new one. */
  countFor(key: string): number {
    const cutoff = this.now() - this.windowMs;
    return (this.#hits.get(key) ?? []).filter((time) => time > cutoff).length;
  }

  /** Drops expired keys; call periodically to bound memory. */
  sweep(): void {
    const cutoff = this.now() - this.windowMs;
    for (const [key, times] of this.#hits)
      if (!times.some((time) => time > cutoff)) this.#hits.delete(key);
    for (const [key, time] of this.#warned)
      if (time <= cutoff) this.#warned.delete(key);
  }

  get size(): number {
    return this.#hits.size;
  }
}
