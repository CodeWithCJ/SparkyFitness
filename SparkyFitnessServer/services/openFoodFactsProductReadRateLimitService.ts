import { randomUUID } from 'node:crypto';
import { log } from '../config/logging.js';
import openFoodFactsProductReadRateLimitRepository from '../models/openFoodFactsProductReadRateLimitRepository.js';

const MAX_WAIT_MS = 10_000;
const MIN_RETRY_POLL_MS = 50;

export const OPENFOODFACTS_INTERACTIVE_PRODUCT_READ_MAX_WAIT_MS = 5_250;

interface ProductReadPermitOptions {
  maxWaitMs?: number;
}

export class OpenFoodFactsProductReadRateLimitError extends Error {
  readonly code = 'OPENFOODFACTS_PRODUCT_READ_RATE_LIMIT' as const;
  readonly status = 429;
  readonly statusCode = 429;
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super('Open Food Facts product lookup is busy. Please try again shortly.');
    this.name = 'OpenFoodFactsProductReadRateLimitError';
    this.retryAfterMs = Math.max(0, Math.ceil(retryAfterMs));
  }
}

function validateMaxWait(maxWaitMs: number): number {
  if (
    !Number.isInteger(maxWaitMs) ||
    maxWaitMs < 0 ||
    maxWaitMs > MAX_WAIT_MS
  ) {
    throw new RangeError(
      `Product-read wait must be between 0 and ${MAX_WAIT_MS}`
    );
  }
  return maxWaitMs;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function withOpenFoodFactsProductReadPermit<T>(
  operation: () => Promise<T>,
  options: ProductReadPermitOptions = {}
): Promise<T> {
  const maxWaitMs = validateMaxWait(options.maxWaitMs ?? 0);
  const deadline = Date.now() + maxWaitMs;

  while (true) {
    const attempt =
      await openFoodFactsProductReadRateLimitRepository.tryAcquire(
        randomUUID()
      );
    if (attempt.acquired) {
      try {
        return await operation();
      } finally {
        try {
          const released =
            await openFoodFactsProductReadRateLimitRepository.release(
              attempt.token
            );
          if (!released) {
            log(
              'warn',
              'Open Food Facts product-read permit expired before release.'
            );
          }
        } catch (error) {
          // A failed release leaves the short database lease in place. Do not
          // hide the upstream result; the stale lease is the safe fallback.
          log(
            'warn',
            'Open Food Facts product-read permit release failed:',
            error
          );
        }
      }
    }

    const now = Date.now();
    const retryAfterMs = Math.max(0, attempt.retryAt.getTime() - now);
    const remainingMs = deadline - now;
    if (remainingMs <= 0 || retryAfterMs > remainingMs) {
      throw new OpenFoodFactsProductReadRateLimitError(retryAfterMs);
    }

    await delay(
      Math.min(remainingMs, Math.max(MIN_RETRY_POLL_MS, retryAfterMs))
    );
  }
}
