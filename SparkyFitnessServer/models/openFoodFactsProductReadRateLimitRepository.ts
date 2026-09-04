import { getSystemClient } from '../db/poolManager.js';

interface ProductReadPermitRow {
  acquired: boolean;
  token: string | null;
  leaseExpiresAt: Date | null;
  retryAt: Date | null;
}

export type OpenFoodFactsProductReadPermitAttempt =
  | {
      acquired: true;
      token: string;
      leaseExpiresAt: Date;
    }
  | {
      acquired: false;
      retryAt: Date;
    };

async function tryAcquire(
  token: string
): Promise<OpenFoodFactsProductReadPermitAttempt> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `WITH available AS MATERIALIZED (
         SELECT limiter.id
           FROM openfoodfacts_product_read_rate_limit limiter
          WHERE limiter.id = 1
            AND limiter.next_product_read_at <= clock_timestamp()
            AND (
              limiter.reservation_token IS NULL OR
              limiter.reservation_expires_at <= clock_timestamp()
            )
          FOR UPDATE OF limiter SKIP LOCKED
       ), acquired AS (
         UPDATE openfoodfacts_product_read_rate_limit limiter
            SET reservation_token = $1::uuid,
                reservation_expires_at =
                  clock_timestamp() + INTERVAL '60 seconds',
                updated_at = clock_timestamp()
           FROM available
          WHERE limiter.id = available.id
          RETURNING TRUE AS acquired,
                    limiter.reservation_token::text AS token,
                    limiter.reservation_expires_at AS "leaseExpiresAt",
                    NULL::timestamptz AS "retryAt"
       )
       SELECT acquired, token, "leaseExpiresAt", "retryAt"
         FROM acquired
       UNION ALL
       SELECT FALSE AS acquired,
              NULL::text AS token,
              NULL::timestamptz AS "leaseExpiresAt",
              CASE
                WHEN limiter.reservation_token IS NOT NULL
                 AND limiter.reservation_expires_at > clock_timestamp()
                  THEN clock_timestamp() + INTERVAL '100 milliseconds'
                ELSE GREATEST(
                  limiter.next_product_read_at,
                  clock_timestamp()
                )
              END AS "retryAt"
         FROM openfoodfacts_product_read_rate_limit limiter
        WHERE limiter.id = 1
          AND NOT EXISTS (SELECT 1 FROM acquired)
        LIMIT 1`,
      [token]
    );
    const row = (result.rows as ProductReadPermitRow[])[0];
    if (!row) {
      throw new Error(
        'Open Food Facts product-read rate-limit singleton is missing.'
      );
    }
    if (row.acquired) {
      if (!row.token || !row.leaseExpiresAt) {
        throw new Error(
          'Open Food Facts product-read permit returned an invalid lease.'
        );
      }
      return {
        acquired: true,
        token: row.token,
        leaseExpiresAt: row.leaseExpiresAt,
      };
    }
    return {
      acquired: false,
      retryAt: row.retryAt ?? new Date(),
    };
  } finally {
    client.release();
  }
}

async function release(token: string): Promise<boolean> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `UPDATE openfoodfacts_product_read_rate_limit
          SET next_product_read_at = GREATEST(
                next_product_read_at,
                clock_timestamp() + INTERVAL '5 seconds'
              ),
              reservation_token = NULL,
              reservation_expires_at = NULL,
              updated_at = clock_timestamp()
        WHERE id = 1
          AND reservation_token = $1::uuid`,
      [token]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export { release, tryAcquire };

export default { release, tryAcquire };
