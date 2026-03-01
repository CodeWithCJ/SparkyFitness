/**
 * Sliding window rate limiter.
 *
 * Tracks request timestamps within a rolling window and gates new requests
 * when the limit is reached. `acquire()` either resolves immediately (under
 * limit) or waits until the oldest request falls out of the window.
 */
export class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  private prune(): void {
    const cutoff = Date.now() - this.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);
  }

  canProceed(): boolean {
    this.prune();
    return this.timestamps.length < this.maxRequests;
  }

  record(): void {
    this.timestamps.push(Date.now());
  }

  msUntilNextSlot(): number {
    this.prune();
    if (this.timestamps.length < this.maxRequests) return 0;
    return Math.max(0, this.timestamps[0] + this.windowMs - Date.now());
  }

  /**
   * Wait for a rate limit slot, then record the request.
   * Supports an AbortSignal so React Query can cancel the wait when
   * the query key changes (e.g. user keeps typing).
   *
   * When multiple callers are waiting, each re-verifies slot availability
   * when its timer fires — only one caller proceeds per opening.
   */
  async acquire(signal?: AbortSignal): Promise<void> {
    if (this.canProceed()) {
      this.record();
      return;
    }

    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        return;
      }

      const onAbort = () => {
        reject(signal!.reason ?? new DOMException('Aborted', 'AbortError'));
      };

      signal?.addEventListener('abort', onAbort, { once: true });

      const tryAcquire = () => {
        if (signal?.aborted) return;

        if (this.canProceed()) {
          signal?.removeEventListener('abort', onAbort);
          this.record();
          resolve();
          return;
        }

        setTimeout(tryAcquire, this.msUntilNextSlot());
      };

      setTimeout(tryAcquire, this.msUntilNextSlot());
    });
  }

  reset(): void {
    this.timestamps = [];
  }
}
