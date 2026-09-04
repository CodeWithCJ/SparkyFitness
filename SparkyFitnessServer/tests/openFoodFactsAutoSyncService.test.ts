import { beforeEach, describe, expect, it, vi } from 'vitest';
import openFoodFactsSyncQueueRepository from '../models/openFoodFactsSyncQueueRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { contributeFoodToOpenFoodFacts } from '../services/openFoodFactsContributionService.js';
import { processOpenFoodFactsAutoSyncBatch } from '../services/openFoodFactsAutoSyncService.js';
import { OpenFoodFactsProductReadRateLimitError } from '../services/openFoodFactsProductReadRateLimitService.js';

vi.mock('../models/openFoodFactsSyncQueueRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../services/openFoodFactsContributionService.js');
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const job = {
  foodId: 'food-1',
  userId: 'user-1',
  revision: 4,
  attemptCount: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(
    openFoodFactsSyncQueueRepository.enqueueNextBackfillBatch
  ).mockResolvedValue(null);
  vi.mocked(openFoodFactsSyncQueueRepository.claimDue)
    .mockResolvedValueOnce([job])
    .mockResolvedValue([]);
  vi.mocked(
    preferenceRepository.getOpenFoodFactsContributionPreferences
  ).mockResolvedValue({
    enabled: true,
    productLanguage: 'de',
    backfillPending: false,
  });
  vi.mocked(contributeFoodToOpenFoodFacts).mockResolvedValue({
    status: 'success',
    statusVerbose: 'fields saved',
    productUrl: 'https://world.openfoodfacts.org/product/0180411000803',
    providerScope: 'personal',
  });
  vi.mocked(openFoodFactsSyncQueueRepository.markSucceeded).mockResolvedValue(
    true
  );
  vi.mocked(openFoodFactsSyncQueueRepository.markFailed).mockResolvedValue(
    true
  );
  vi.mocked(openFoodFactsSyncQueueRepository.retry).mockResolvedValue(
    'pending'
  );
  vi.mocked(
    openFoodFactsSyncQueueRepository.deferWithoutAttempt
  ).mockResolvedValue(true);
});

describe('processOpenFoodFactsAutoSyncBatch', () => {
  it('feeds only one bounded backfill page and leases each product just before upload', async () => {
    await expect(processOpenFoodFactsAutoSyncBatch()).resolves.toEqual({
      claimed: 1,
      contributed: 1,
      failed: 0,
      retried: 0,
    });

    expect(
      openFoodFactsSyncQueueRepository.enqueueNextBackfillBatch
    ).toHaveBeenCalledWith(100);
    expect(openFoodFactsSyncQueueRepository.claimDue).toHaveBeenNthCalledWith(
      1,
      1,
      300,
      8
    );
    expect(openFoodFactsSyncQueueRepository.claimDue).toHaveBeenNthCalledWith(
      2,
      1,
      300,
      8
    );
    expect(contributeFoodToOpenFoodFacts).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      'food-1',
      { productLanguage: 'de', queueRevision: 4 }
    );
    expect(openFoodFactsSyncQueueRepository.markSucceeded).toHaveBeenCalledWith(
      'food-1',
      4
    );
  });

  it('does not lease the next product until the current upload is settled', async () => {
    const secondJob = { ...job, foodId: 'food-2', revision: 1 };
    vi.mocked(openFoodFactsSyncQueueRepository.claimDue)
      .mockReset()
      .mockResolvedValueOnce([job])
      .mockResolvedValueOnce([secondJob])
      .mockResolvedValue([]);

    await processOpenFoodFactsAutoSyncBatch();

    const firstCompleteOrder = vi.mocked(
      openFoodFactsSyncQueueRepository.markSucceeded
    ).mock.invocationCallOrder[0];
    const secondClaimOrder = vi.mocked(
      openFoodFactsSyncQueueRepository.claimDue
    ).mock.invocationCallOrder[1];
    expect(firstCompleteOrder).toBeLessThan(secondClaimOrder);
  });

  it('marks a permanently invalid product as failed for user visibility', async () => {
    vi.mocked(contributeFoodToOpenFoodFacts).mockRejectedValue(
      Object.assign(new Error('A checksum-valid GTIN is required.'), {
        statusCode: 400,
      })
    );

    await expect(processOpenFoodFactsAutoSyncBatch()).resolves.toEqual({
      claimed: 1,
      contributed: 0,
      failed: 1,
      retried: 0,
    });

    expect(openFoodFactsSyncQueueRepository.markFailed).toHaveBeenCalledWith(
      'food-1',
      4,
      'A checksum-valid GTIN is required.'
    );
    expect(
      openFoodFactsSyncQueueRepository.markSucceeded
    ).not.toHaveBeenCalled();
  });

  it('marks an idempotent not-modified contribution as succeeded', async () => {
    vi.mocked(contributeFoodToOpenFoodFacts).mockResolvedValue({
      status: 'success',
      statusVerbose: 'not modified',
      productUrl: 'https://world.openfoodfacts.org/product/0180411000803',
      providerScope: 'personal',
    });

    await expect(processOpenFoodFactsAutoSyncBatch()).resolves.toEqual({
      claimed: 1,
      contributed: 1,
      failed: 0,
      retried: 0,
    });

    expect(openFoodFactsSyncQueueRepository.markSucceeded).toHaveBeenCalledWith(
      'food-1',
      4
    );
    expect(openFoodFactsSyncQueueRepository.retry).not.toHaveBeenCalled();
  });

  it('treats a queue row removed during the before-write guard as stale', async () => {
    vi.mocked(contributeFoodToOpenFoodFacts).mockRejectedValue(
      Object.assign(
        new Error('Automatic Open Food Facts contribution changed.'),
        { statusCode: 409 }
      )
    );
    vi.mocked(openFoodFactsSyncQueueRepository.retry).mockResolvedValue(null);

    await expect(processOpenFoodFactsAutoSyncBatch()).resolves.toEqual({
      claimed: 1,
      contributed: 0,
      failed: 0,
      retried: 0,
    });

    expect(openFoodFactsSyncQueueRepository.markFailed).not.toHaveBeenCalled();
  });

  it('reports a transient failure as terminal when the attempt ceiling is reached', async () => {
    vi.mocked(contributeFoodToOpenFoodFacts).mockRejectedValue(
      Object.assign(new Error('Open Food Facts unavailable'), {
        statusCode: 503,
      })
    );
    vi.mocked(openFoodFactsSyncQueueRepository.retry).mockResolvedValue(
      'failed'
    );

    await expect(processOpenFoodFactsAutoSyncBatch()).resolves.toEqual({
      claimed: 1,
      contributed: 0,
      failed: 1,
      retried: 0,
    });

    expect(openFoodFactsSyncQueueRepository.retry).toHaveBeenCalledWith(
      'food-1',
      4,
      60,
      'Open Food Facts unavailable',
      8
    );
  });

  it('retains a transient failure with exponential backoff below the ceiling', async () => {
    vi.mocked(openFoodFactsSyncQueueRepository.claimDue)
      .mockReset()
      .mockResolvedValueOnce([{ ...job, attemptCount: 3 }])
      .mockResolvedValue([]);
    vi.mocked(contributeFoodToOpenFoodFacts).mockRejectedValue(
      Object.assign(new Error('Open Food Facts unavailable'), {
        statusCode: 503,
      })
    );

    await expect(processOpenFoodFactsAutoSyncBatch()).resolves.toEqual({
      claimed: 1,
      contributed: 0,
      failed: 0,
      retried: 1,
    });

    expect(openFoodFactsSyncQueueRepository.retry).toHaveBeenCalledWith(
      'food-1',
      4,
      240,
      'Open Food Facts unavailable',
      8
    );
  });

  it('defers local product-read contention without spending an attempt or claiming more work', async () => {
    vi.mocked(contributeFoodToOpenFoodFacts).mockRejectedValue(
      new OpenFoodFactsProductReadRateLimitError(4_750)
    );

    await expect(processOpenFoodFactsAutoSyncBatch()).resolves.toEqual({
      claimed: 1,
      contributed: 0,
      failed: 0,
      retried: 0,
    });

    expect(
      openFoodFactsSyncQueueRepository.deferWithoutAttempt
    ).toHaveBeenCalledWith('food-1', 4, 5);
    expect(openFoodFactsSyncQueueRepository.retry).not.toHaveBeenCalled();
    expect(openFoodFactsSyncQueueRepository.markFailed).not.toHaveBeenCalled();
    expect(openFoodFactsSyncQueueRepository.claimDue).toHaveBeenCalledOnce();
  });
});
