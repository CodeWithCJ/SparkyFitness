import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSystemClient } from '../db/poolManager.js';
import openFoodFactsProductReadRateLimitRepository from '../models/openFoodFactsProductReadRateLimitRepository.js';

vi.mock('../db/poolManager.js', () => ({
  getSystemClient: vi.fn(),
}));

interface FakeClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

const fakeClient: FakeClient = {
  query: vi.fn(),
  release: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSystemClient).mockResolvedValue(fakeClient as never);
});

describe('openFoodFactsProductReadRateLimitRepository', () => {
  it('atomically acquires the shared product-read permit with a stale lease ceiling', async () => {
    const token = randomUUID();
    const expiresAt = new Date('2026-09-04T12:01:00.000Z');
    fakeClient.query.mockResolvedValue({
      rows: [{ acquired: true, token, leaseExpiresAt: expiresAt }],
      rowCount: 1,
    });

    await expect(
      openFoodFactsProductReadRateLimitRepository.tryAcquire(token)
    ).resolves.toEqual({ acquired: true, token, leaseExpiresAt: expiresAt });

    const [query, params] = fakeClient.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(query).toContain('openfoodfacts_product_read_rate_limit');
    expect(query).toContain('FOR UPDATE OF limiter SKIP LOCKED');
    expect(query).toContain('reservation_expires_at <= clock_timestamp()');
    expect(query).toContain("INTERVAL '60 seconds'");
    expect(params).toEqual([token]);
    expect(fakeClient.release).toHaveBeenCalledOnce();
  });

  it('returns a retry hint immediately when another request owns the singleton', async () => {
    const retryAt = new Date('2026-09-04T12:00:05.000Z');
    fakeClient.query.mockResolvedValue({
      rows: [{ acquired: false, token: null, leaseExpiresAt: null, retryAt }],
      rowCount: 1,
    });

    await expect(
      openFoodFactsProductReadRateLimitRepository.tryAcquire(randomUUID())
    ).resolves.toEqual({ acquired: false, retryAt });
  });

  it('releases only its own token and starts the five-second cooldown', async () => {
    const token = randomUUID();
    fakeClient.query.mockResolvedValue({ rows: [], rowCount: 1 });

    await expect(
      openFoodFactsProductReadRateLimitRepository.release(token)
    ).resolves.toBe(true);

    const [query, params] = fakeClient.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(query).toContain('reservation_token = $1::uuid');
    expect(query).toContain("clock_timestamp() + INTERVAL '5 seconds'");
    expect(query).toContain('reservation_token = NULL');
    expect(params).toEqual([token]);
  });

  it('cannot release a newer owner after its own stale lease was replaced', async () => {
    fakeClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(
      openFoodFactsProductReadRateLimitRepository.release(randomUUID())
    ).resolves.toBe(false);
  });
});
