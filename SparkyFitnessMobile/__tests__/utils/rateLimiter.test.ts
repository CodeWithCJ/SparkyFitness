import { RateLimiter } from '../../src/utils/rateLimiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('allows requests under the limit', () => {
    const limiter = new RateLimiter(3, 60_000);
    expect(limiter.canProceed()).toBe(true);

    limiter.record();
    limiter.record();
    expect(limiter.canProceed()).toBe(true);
  });

  test('blocks requests at the limit', () => {
    const limiter = new RateLimiter(2, 60_000);
    limiter.record();
    limiter.record();

    expect(limiter.canProceed()).toBe(false);
  });

  test('allows requests again after the window elapses', () => {
    const limiter = new RateLimiter(2, 60_000);
    limiter.record();
    limiter.record();

    expect(limiter.canProceed()).toBe(false);

    jest.advanceTimersByTime(60_001);
    expect(limiter.canProceed()).toBe(true);
  });

  test('msUntilNextSlot returns 0 when under limit', () => {
    const limiter = new RateLimiter(3, 60_000);
    limiter.record();
    expect(limiter.msUntilNextSlot()).toBe(0);
  });

  test('msUntilNextSlot returns time until oldest request expires', () => {
    const limiter = new RateLimiter(2, 60_000);
    limiter.record();
    jest.advanceTimersByTime(10_000);
    limiter.record();

    // Oldest request was 10s ago, window is 60s, so ~50s remaining
    const ms = limiter.msUntilNextSlot();
    expect(ms).toBeGreaterThan(49_000);
    expect(ms).toBeLessThanOrEqual(50_000);
  });

  test('acquire resolves immediately when under limit', async () => {
    const limiter = new RateLimiter(3, 60_000);
    await limiter.acquire();
    // Should have recorded the request
    expect(limiter.canProceed()).toBe(true); // 1 of 3 used
  });

  test('acquire waits and resolves when at limit', async () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.record();

    let resolved = false;
    const promise = limiter.acquire().then(() => {
      resolved = true;
    });

    // Should not resolve immediately
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Advance past the window
    jest.advanceTimersByTime(60_001);
    await promise;
    expect(resolved).toBe(true);
  });

  test('acquire rejects when signal is already aborted', async () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.record();

    const controller = new AbortController();
    controller.abort();

    await expect(limiter.acquire(controller.signal)).rejects.toThrow();
  });

  test('acquire rejects when signal is aborted during wait', async () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.record();

    const controller = new AbortController();
    const promise = limiter.acquire(controller.signal);

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  test('concurrent acquire calls serialize through one slot at a time', async () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.record(); // fill the single slot at t=0

    const resolved: number[] = [];
    const p1 = limiter.acquire().then(() => resolved.push(1));
    const p2 = limiter.acquire().then(() => resolved.push(2));
    const p3 = limiter.acquire().then(() => resolved.push(3));

    // Nothing should resolve yet
    await Promise.resolve();
    expect(resolved).toEqual([]);

    // Advance so the original record (t=0) expires — opens 1 slot
    await jest.advanceTimersByTimeAsync(60_001);
    // Only one should have acquired the slot
    expect(resolved).toHaveLength(1);

    // Advance again for the next slot
    await jest.advanceTimersByTimeAsync(60_001);
    expect(resolved).toHaveLength(2);

    // And once more
    await jest.advanceTimersByTimeAsync(60_001);
    await Promise.all([p1, p2, p3]);
    expect(resolved).toHaveLength(3);
  });

  test('reset clears all tracked requests', () => {
    const limiter = new RateLimiter(2, 60_000);
    limiter.record();
    limiter.record();
    expect(limiter.canProceed()).toBe(false);

    limiter.reset();
    expect(limiter.canProceed()).toBe(true);
  });

  test('sliding window only prunes expired timestamps', () => {
    const limiter = new RateLimiter(3, 60_000);
    limiter.record(); // t=0
    jest.advanceTimersByTime(20_000);
    limiter.record(); // t=20s
    jest.advanceTimersByTime(20_000);
    limiter.record(); // t=40s

    expect(limiter.canProceed()).toBe(false); // 3 of 3

    // Advance so first request (t=0) expires but others remain
    jest.advanceTimersByTime(20_001); // now t=60.001s
    expect(limiter.canProceed()).toBe(true); // 2 of 3
  });
});
