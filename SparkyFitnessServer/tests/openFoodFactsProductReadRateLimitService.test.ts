import { beforeEach, describe, expect, it, vi } from 'vitest';
import openFoodFactsProductReadRateLimitRepository from '../models/openFoodFactsProductReadRateLimitRepository.js';
import {
  OpenFoodFactsProductReadRateLimitError,
  withOpenFoodFactsProductReadPermit,
} from '../services/openFoodFactsProductReadRateLimitService.js';

vi.mock('../models/openFoodFactsProductReadRateLimitRepository.js');
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-04T12:00:00.000Z'));
});

describe('withOpenFoodFactsProductReadPermit', () => {
  it('holds the permit until the actual product request settles', async () => {
    vi.mocked(
      openFoodFactsProductReadRateLimitRepository.tryAcquire
    ).mockResolvedValue({
      acquired: true,
      token: '00000000-0000-4000-8000-000000000001',
      leaseExpiresAt: new Date('2026-09-04T12:01:00.000Z'),
    });
    vi.mocked(
      openFoodFactsProductReadRateLimitRepository.release
    ).mockResolvedValue(true);
    let finishRequest: (() => void) | undefined;
    const request = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finishRequest = () => resolve('ok');
        })
    );

    const result = withOpenFoodFactsProductReadPermit(request, {
      maxWaitMs: 0,
    });
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(
      openFoodFactsProductReadRateLimitRepository.release
    ).not.toHaveBeenCalled();

    finishRequest?.();
    await expect(result).resolves.toBe('ok');
    expect(
      openFoodFactsProductReadRateLimitRepository.release
    ).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
  });

  it('waits only within the caller budget before retrying the database permit', async () => {
    vi.mocked(openFoodFactsProductReadRateLimitRepository.tryAcquire)
      .mockResolvedValueOnce({
        acquired: false,
        retryAt: new Date('2026-09-04T12:00:05.000Z'),
      })
      .mockResolvedValueOnce({
        acquired: true,
        token: '00000000-0000-4000-8000-000000000002',
        leaseExpiresAt: new Date('2026-09-04T12:01:05.000Z'),
      });
    vi.mocked(
      openFoodFactsProductReadRateLimitRepository.release
    ).mockResolvedValue(true);
    const request = vi.fn().mockResolvedValue('ok');

    const result = withOpenFoodFactsProductReadPermit(request, {
      maxWaitMs: 5_250,
    });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toBe('ok');
    expect(request).toHaveBeenCalledOnce();
  });

  it('surfaces a typed 429 instead of waiting beyond the interactive budget', async () => {
    vi.mocked(
      openFoodFactsProductReadRateLimitRepository.tryAcquire
    ).mockResolvedValue({
      acquired: false,
      retryAt: new Date('2026-09-04T12:01:00.000Z'),
    });

    const result = withOpenFoodFactsProductReadPermit(
      () => Promise.resolve('unreachable'),
      { maxWaitMs: 5_250 }
    );

    await expect(result).rejects.toBeInstanceOf(
      OpenFoodFactsProductReadRateLimitError
    );
    await expect(result).rejects.toMatchObject({
      status: 429,
      statusCode: 429,
      retryAfterMs: 60_000,
    });
  });
});
