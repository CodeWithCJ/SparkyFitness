import { log } from '../config/logging.js';
import openFoodFactsSyncQueueRepository from '../models/openFoodFactsSyncQueueRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { contributeFoodToOpenFoodFacts } from './openFoodFactsContributionService.js';
import { OpenFoodFactsProductReadRateLimitError } from './openFoodFactsProductReadRateLimitService.js';

const BATCH_SIZE = 10;
const BACKFILL_BATCH_SIZE = 100;
const LEASE_SECONDS = 300;
const MAX_ATTEMPTS = 8;
const MAX_RETRY_SECONDS = 86400;
const MAX_ERROR_LENGTH = 500;

interface OpenFoodFactsAutoSyncBatchResult {
  claimed: number;
  contributed: number;
  failed: number;
  retried: number;
}

interface StatusError extends Error {
  statusCode?: number;
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown sync error';
  return message.slice(0, MAX_ERROR_LENGTH);
}

function retryDelaySeconds(attemptCount: number): number {
  return Math.min(
    MAX_RETRY_SECONDS,
    60 * 2 ** Math.min(Math.max(attemptCount - 1, 0), 10)
  );
}

function isPermanentProductError(error: unknown): boolean {
  const statusCode = (error as StatusError | null)?.statusCode;
  return statusCode === 400 || statusCode === 404;
}

export async function processOpenFoodFactsAutoSyncBatch(): Promise<OpenFoodFactsAutoSyncBatchResult> {
  await openFoodFactsSyncQueueRepository.enqueueNextBackfillBatch(
    BACKFILL_BATCH_SIZE
  );

  const result: OpenFoodFactsAutoSyncBatchResult = {
    claimed: 0,
    contributed: 0,
    failed: 0,
    retried: 0,
  };

  for (let index = 0; index < BATCH_SIZE; index += 1) {
    // Lease only the item that is about to be uploaded. A batch-wide lease can
    // expire while earlier network calls are still running, allowing another
    // worker to upload later items concurrently.
    const [job] = await openFoodFactsSyncQueueRepository.claimDue(
      1,
      LEASE_SECONDS,
      MAX_ATTEMPTS
    );
    if (!job) break;
    result.claimed += 1;

    try {
      const preferences =
        await preferenceRepository.getOpenFoodFactsContributionPreferences(
          job.userId
        );
      await contributeFoodToOpenFoodFacts(job.userId, job.userId, job.foodId, {
        productLanguage: preferences.productLanguage,
        queueRevision: job.revision,
      });
      const marked = await openFoodFactsSyncQueueRepository.markSucceeded(
        job.foodId,
        job.revision
      );
      if (!marked) {
        log(
          'info',
          `Open Food Facts sync completed for an older revision of food ${job.foodId}; the newer revision remains queued.`
        );
      }
      result.contributed += 1;
    } catch (error) {
      const message = errorMessage(error);
      if (error instanceof OpenFoodFactsProductReadRateLimitError) {
        const delaySeconds = Math.max(
          1,
          Math.min(3600, Math.ceil(error.retryAfterMs / 1000))
        );
        const deferred =
          await openFoodFactsSyncQueueRepository.deferWithoutAttempt(
            job.foodId,
            job.revision,
            delaySeconds
          );
        if (deferred) {
          log(
            'info',
            `Automatic Open Food Facts sync deferred food ${job.foodId} because another local product read owns the shared permit.`
          );
        } else {
          log(
            'info',
            `Open Food Facts sync state for food ${job.foodId} changed before its local rate-limit deferral.`
          );
        }
        break;
      }
      if (isPermanentProductError(error)) {
        const marked = await openFoodFactsSyncQueueRepository.markFailed(
          job.foodId,
          job.revision,
          message
        );
        if (!marked) {
          log(
            'info',
            `Open Food Facts rejected an older revision of food ${job.foodId}; the newer revision remains queued.`
          );
        }
        result.failed += 1;
        log(
          'info',
          `Automatic Open Food Facts sync permanently rejected food ${job.foodId}: ${message}`
        );
        continue;
      }

      const outcome = await openFoodFactsSyncQueueRepository.retry(
        job.foodId,
        job.revision,
        retryDelaySeconds(job.attemptCount),
        message,
        MAX_ATTEMPTS
      );
      if (outcome === 'failed') {
        result.failed += 1;
        log(
          'warn',
          `Automatic Open Food Facts sync reached its retry limit for food ${job.foodId}:`,
          error
        );
      } else if (outcome === 'pending') {
        result.retried += 1;
        log(
          'warn',
          `Automatic Open Food Facts sync failed for food ${job.foodId}; it remains queued for retry:`,
          error
        );
      } else {
        log(
          'info',
          `Open Food Facts sync state for food ${job.foodId} changed while the upload was in progress; no retry was scheduled.`
        );
      }
    }
  }

  return result;
}
