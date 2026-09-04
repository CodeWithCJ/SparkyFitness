import { getSystemClient } from '../db/poolManager.js';

const MAX_CLAIM_BATCH_SIZE = 1;
const MAX_BACKFILL_BATCH_SIZE = 100;
const MAX_FAILURE_LIST_SIZE = 100;
const MAX_LEASE_SECONDS = 3600;
const MAX_ERROR_LENGTH = 2000;

export interface ClaimedOpenFoodFactsSync {
  foodId: string;
  userId: string;
  revision: number;
  attemptCount: number;
}

export interface OpenFoodFactsBackfillBatch {
  userId: string;
  enqueued: number;
  hasMore: boolean;
}

export interface OpenFoodFactsSyncStatusCounts {
  pending: number;
  processing: number;
  failed: number;
  succeeded: number;
}

export interface OpenFoodFactsSyncFailure {
  foodId: string;
  foodName: string | null;
  attemptCount: number;
  error: string | null;
  updatedAt: string;
}

export interface OpenFoodFactsAdminSyncFailure extends OpenFoodFactsSyncFailure {
  userId: string;
}

export interface OpenFoodFactsSyncStatus {
  status: OpenFoodFactsSyncStatusCounts;
  recentFailures: OpenFoodFactsSyncFailure[];
}

export interface OpenFoodFactsAdminSyncStatus {
  status: OpenFoodFactsSyncStatusCounts;
  recentFailures: OpenFoodFactsAdminSyncFailure[];
}

export type OpenFoodFactsRetryOutcome = 'pending' | 'failed' | null;

interface ClaimedOpenFoodFactsSyncRow {
  foodId: string;
  userId: string;
  revision: string | number;
  attemptCount: string | number;
}

interface BackfillBatchRow {
  userId: string;
  enqueued: string | number;
  hasMore: boolean;
}

interface StatusCountsRow {
  pending: string | number;
  processing: string | number;
  failed: string | number;
  succeeded: string | number;
}

interface RecentFailureRow {
  foodId: string;
  foodName: string | null;
  userId: string;
  attemptCount: string | number;
  error: string | null;
  updatedAt: Date | string;
}

function validatePositiveInteger(
  value: number,
  name: string,
  maximum: number
): number {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} must be between 1 and ${maximum}`);
  }
  return value;
}

function sanitizeError(message: string): string {
  return message.slice(0, MAX_ERROR_LENGTH);
}

async function enqueueNextBackfillBatch(
  limit = MAX_BACKFILL_BATCH_SIZE
): Promise<OpenFoodFactsBackfillBatch | null> {
  const boundedLimit = validatePositiveInteger(
    limit,
    'Backfill limit',
    MAX_BACKFILL_BATCH_SIZE
  );
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `WITH selected_user AS MATERIALIZED (
         SELECT preferences.user_id
           FROM user_preferences preferences
           JOIN global_settings settings
             ON settings.id = 1
            AND settings.allow_openfoodfacts_contributions = TRUE
          WHERE preferences.auto_contribute_openfoodfacts = TRUE
            AND preferences.openfoodfacts_backfill_pending = TRUE
          ORDER BY preferences.updated_at ASC, preferences.user_id ASC
          FOR UPDATE OF preferences SKIP LOCKED
          LIMIT 1
       ), eligible AS MATERIALIZED (
         SELECT eligible_food.food_id, eligible_food.user_id
           FROM selected_user
           CROSS JOIN LATERAL public.eligible_openfoodfacts_foods(
             NULL,
             selected_user.user_id
           ) eligible_food
          WHERE NOT EXISTS (
            SELECT 1
              FROM openfoodfacts_sync_queue existing
             WHERE existing.food_id = eligible_food.food_id
          )
          ORDER BY eligible_food.food_id
          LIMIT $1
       ), inserted AS (
         INSERT INTO openfoodfacts_sync_queue (food_id, user_id)
         SELECT food_id, user_id
           FROM eligible
         ON CONFLICT (food_id) DO NOTHING
         RETURNING 1
       )
       UPDATE user_preferences preferences
          SET openfoodfacts_backfill_pending =
                (SELECT COUNT(*) FROM eligible) >= $1,
              updated_at = NOW()
         FROM selected_user
        WHERE preferences.user_id = selected_user.user_id
       RETURNING preferences.user_id AS "userId",
                 (SELECT COUNT(*) FROM inserted) AS enqueued,
                 preferences.openfoodfacts_backfill_pending AS "hasMore"`,
      [boundedLimit]
    );
    const row = (result.rows as BackfillBatchRow[])[0];
    return row
      ? {
          userId: row.userId,
          enqueued: Number(row.enqueued),
          hasMore: row.hasMore,
        }
      : null;
  } finally {
    client.release();
  }
}

async function claimDue(
  limit: number,
  leaseSeconds: number,
  maxAttempts = 8
): Promise<ClaimedOpenFoodFactsSync[]> {
  const boundedLimit = validatePositiveInteger(
    limit,
    'Claim limit',
    MAX_CLAIM_BATCH_SIZE
  );
  const boundedLease = validatePositiveInteger(
    leaseSeconds,
    'Lease duration',
    MAX_LEASE_SECONDS
  );
  const boundedAttempts = validatePositiveInteger(
    maxAttempts,
    'Attempt limit',
    100
  );
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `WITH exhausted_candidates AS MATERIALIZED (
         SELECT queue.food_id
           FROM openfoodfacts_sync_queue queue
          WHERE queue.status = 'processing'
            AND queue.lease_expires_at <= NOW()
            AND queue.attempt_count >= $3
          FOR UPDATE OF queue SKIP LOCKED
       ), exhausted AS (
         UPDATE openfoodfacts_sync_queue queue
            SET status = 'failed',
                lease_expires_at = NULL,
                last_error = 'Automatic sync worker lease expired at the attempt limit.',
                updated_at = NOW()
           FROM exhausted_candidates candidate
          WHERE queue.food_id = candidate.food_id
       ), due AS MATERIALIZED (
         SELECT queue.food_id
           FROM openfoodfacts_sync_queue queue
           JOIN user_preferences preferences
             ON preferences.user_id = queue.user_id
            AND preferences.auto_contribute_openfoodfacts = TRUE
           JOIN global_settings settings
             ON settings.id = 1
            AND settings.allow_openfoodfacts_contributions = TRUE
          WHERE queue.next_attempt_at <= NOW()
            AND (
              queue.status = 'pending' OR
              (queue.status = 'processing' AND queue.lease_expires_at <= NOW())
            )
            AND queue.attempt_count < $3
          ORDER BY queue.next_attempt_at ASC, queue.created_at ASC
           FOR UPDATE OF queue SKIP LOCKED
           LIMIT $1
       )
       UPDATE openfoodfacts_sync_queue queue
          SET status = 'processing',
              revision = nextval('public.openfoodfacts_sync_revision_seq'),
              attempt_count = queue.attempt_count + 1,
              lease_expires_at = NOW() + make_interval(secs => $2),
              updated_at = NOW()
          FROM due
         WHERE queue.food_id = due.food_id
       RETURNING queue.food_id AS "foodId",
                 queue.user_id AS "userId",
                 queue.revision,
                 queue.attempt_count AS "attemptCount"`,
      [boundedLimit, boundedLease, boundedAttempts]
    );
    return (result.rows as ClaimedOpenFoodFactsSyncRow[]).map((row) => ({
      foodId: row.foodId,
      userId: row.userId,
      revision: Number(row.revision),
      attemptCount: Number(row.attemptCount),
    }));
  } finally {
    client.release();
  }
}

async function deferWithoutAttempt(
  foodId: string,
  revision: number,
  delaySeconds: number
): Promise<boolean> {
  const boundedDelay = validatePositiveInteger(
    delaySeconds,
    'Deferral delay',
    3600
  );
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `UPDATE openfoodfacts_sync_queue
          SET status = 'pending',
              attempt_count = GREATEST(attempt_count - 1, 0),
              next_attempt_at = NOW() + make_interval(secs => $3),
              lease_expires_at = NULL,
              updated_at = NOW()
        WHERE food_id = $1
          AND revision = $2
          AND status = 'processing'`,
      [foodId, revision, boundedDelay]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

async function isClaimCurrent(
  foodId: string,
  userId: string,
  revision: number
): Promise<boolean> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT EXISTS (
         SELECT 1
           FROM openfoodfacts_sync_queue
          WHERE food_id = $1
          AND user_id = $2
          AND revision = $3
          AND status = 'processing'
          AND lease_expires_at > NOW()
      ) AS current`,
      [foodId, userId, revision]
    );
    return (result.rows as Array<{ current: boolean }>)[0]?.current === true;
  } finally {
    client.release();
  }
}

async function markSucceeded(
  foodId: string,
  revision: number
): Promise<boolean> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `UPDATE openfoodfacts_sync_queue
          SET status = 'succeeded',
              lease_expires_at = NULL,
              last_error = NULL,
              last_succeeded_at = NOW(),
              updated_at = NOW()
        WHERE food_id = $1
          AND revision = $2
          AND status = 'processing'`,
      [foodId, revision]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

async function markFailed(
  foodId: string,
  revision: number,
  message: string
): Promise<boolean> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `UPDATE openfoodfacts_sync_queue
          SET status = 'failed',
              lease_expires_at = NULL,
              last_error = $3,
              updated_at = NOW()
        WHERE food_id = $1
          AND revision = $2
          AND status = 'processing'`,
      [foodId, revision, sanitizeError(message)]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

async function retry(
  foodId: string,
  revision: number,
  delaySeconds: number,
  message: string,
  maxAttempts = 8
): Promise<OpenFoodFactsRetryOutcome> {
  const boundedDelay = validatePositiveInteger(
    delaySeconds,
    'Retry delay',
    86400
  );
  const boundedAttempts = validatePositiveInteger(
    maxAttempts,
    'Attempt limit',
    100
  );
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `UPDATE openfoodfacts_sync_queue
          SET status = CASE
                WHEN attempt_count >= $5 THEN 'failed'
                ELSE 'pending'
              END,
              next_attempt_at = CASE
                WHEN attempt_count >= $5 THEN NOW()
                ELSE NOW() + make_interval(secs => $3)
              END,
              lease_expires_at = NULL,
              last_error = $4,
              updated_at = NOW()
        WHERE food_id = $1
          AND revision = $2
          AND status = 'processing'
       RETURNING status`,
      [foodId, revision, boundedDelay, sanitizeError(message), boundedAttempts]
    );
    return (
      (result.rows as Array<{ status: 'pending' | 'failed' }>)[0]?.status ??
      null
    );
  } finally {
    client.release();
  }
}

async function getStatusCounts(
  userId: string | null
): Promise<OpenFoodFactsSyncStatusCounts> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending,
              COUNT(*) FILTER (WHERE status = 'processing') AS processing,
              COUNT(*) FILTER (WHERE status = 'failed') AS failed,
              COUNT(*) FILTER (WHERE status = 'succeeded') AS succeeded
         FROM openfoodfacts_sync_queue
        WHERE ($1::uuid IS NULL OR user_id = $1)`,
      [userId]
    );
    const row = (result.rows as StatusCountsRow[])[0];
    return {
      pending: Number(row?.pending ?? 0),
      processing: Number(row?.processing ?? 0),
      failed: Number(row?.failed ?? 0),
      succeeded: Number(row?.succeeded ?? 0),
    };
  } finally {
    client.release();
  }
}

async function getRecentFailures(
  userId: string | null,
  limit = 10
): Promise<OpenFoodFactsSyncFailure[]> {
  const boundedLimit = validatePositiveInteger(
    limit,
    'Failure list limit',
    MAX_FAILURE_LIST_SIZE
  );
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT queue.food_id AS "foodId",
              food.name AS "foodName",
              queue.user_id AS "userId",
              queue.attempt_count AS "attemptCount",
              queue.last_error AS error,
              queue.updated_at AS "updatedAt"
         FROM openfoodfacts_sync_queue queue
         JOIN foods food ON food.id = queue.food_id
        WHERE queue.status = 'failed'
          AND ($1::uuid IS NULL OR queue.user_id = $1)
        ORDER BY queue.updated_at DESC, queue.food_id ASC
        LIMIT $2`,
      [userId, boundedLimit]
    );
    return (result.rows as RecentFailureRow[]).map((row) => ({
      foodId: row.foodId,
      foodName: row.foodName,
      attemptCount: Number(row.attemptCount),
      error: row.error,
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : new Date(row.updatedAt).toISOString(),
    }));
  } finally {
    client.release();
  }
}

async function getStatusForUser(
  userId: string
): Promise<OpenFoodFactsSyncStatus> {
  const [status, recentFailures] = await Promise.all([
    getStatusCounts(userId),
    getRecentFailures(userId),
  ]);
  return { status, recentFailures };
}

async function getStatusForAll(): Promise<OpenFoodFactsAdminSyncStatus> {
  const [status, recentFailures] = await Promise.all([
    getStatusCounts(null),
    getRecentFailuresForAll(),
  ]);
  return { status, recentFailures };
}

async function getRecentFailuresForAll(
  limit = 10
): Promise<OpenFoodFactsAdminSyncFailure[]> {
  const boundedLimit = validatePositiveInteger(
    limit,
    'Failure list limit',
    MAX_FAILURE_LIST_SIZE
  );
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT queue.food_id AS "foodId",
              food.name AS "foodName",
              queue.user_id AS "userId",
              queue.attempt_count AS "attemptCount",
              queue.last_error AS error,
              queue.updated_at AS "updatedAt"
         FROM openfoodfacts_sync_queue queue
         JOIN foods food ON food.id = queue.food_id
        WHERE queue.status = 'failed'
        ORDER BY queue.updated_at DESC, queue.food_id ASC
        LIMIT $1`,
      [boundedLimit]
    );
    return (result.rows as RecentFailureRow[]).map((row) => ({
      foodId: row.foodId,
      foodName: row.foodName,
      userId: row.userId,
      attemptCount: Number(row.attemptCount),
      error: row.error,
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : new Date(row.updatedAt).toISOString(),
    }));
  } finally {
    client.release();
  }
}

async function isFeatureActive(): Promise<boolean> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT EXISTS (
         SELECT 1
           FROM global_settings settings
           JOIN user_preferences preferences
             ON preferences.auto_contribute_openfoodfacts = TRUE
          WHERE settings.id = 1
            AND settings.allow_openfoodfacts_contributions = TRUE
       ) AS active`
    );
    return (result.rows as Array<{ active: boolean }>)[0]?.active === true;
  } finally {
    client.release();
  }
}

export {
  claimDue,
  deferWithoutAttempt,
  enqueueNextBackfillBatch,
  getRecentFailures,
  getRecentFailuresForAll,
  getStatusCounts,
  getStatusForAll,
  getStatusForUser,
  isFeatureActive,
  isClaimCurrent,
  markFailed,
  markSucceeded,
  retry,
};

export default {
  claimDue,
  deferWithoutAttempt,
  enqueueNextBackfillBatch,
  getRecentFailures,
  getRecentFailuresForAll,
  getStatusCounts,
  getStatusForAll,
  getStatusForUser,
  isFeatureActive,
  isClaimCurrent,
  markFailed,
  markSucceeded,
  retry,
};
