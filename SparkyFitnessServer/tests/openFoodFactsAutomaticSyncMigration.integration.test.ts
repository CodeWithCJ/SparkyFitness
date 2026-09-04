import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadSecrets } from '../utils/secretLoader.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });
loadSecrets();
const { endPool, getSystemClient } = await import('../db/poolManager.js');
const { default: queueRepository } =
  await import('../models/openFoodFactsSyncQueueRepository.js');
const { default: productReadRateLimitRepository } =
  await import('../models/openFoodFactsProductReadRateLimitRepository.js');
const { withOpenFoodFactsProductReadPermit } =
  await import('../services/openFoodFactsProductReadRateLimitService.js');

async function dbReachable(): Promise<boolean> {
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (
    !process.env.SPARKY_FITNESS_DB_HOST ||
    !process.env.SPARKY_FITNESS_DB_NAME ||
    !process.env.SPARKY_FITNESS_DB_USER
  ) {
    return false;
  }

  const probe = new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_DB_USER,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
  try {
    await probe.connect();
    const result = await probe.query(
      "SELECT to_regclass('public.foods') IS NOT NULL AS available"
    );
    return result.rows[0]?.available === true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const RUN = await dbReachable();
const USER_ID = '00000000-0000-4000-a231-000000000001';
const FOOD_IDS = [
  '00000000-0000-4000-a231-000000000011',
  '00000000-0000-4000-a231-000000000012',
  '00000000-0000-4000-a231-000000000013',
  '00000000-0000-4000-a231-000000000014',
  '00000000-0000-4000-a231-000000000015',
  '00000000-0000-4000-a231-000000000016',
  '00000000-0000-4000-a231-000000000017',
  '00000000-0000-4000-a231-000000000018',
  '00000000-0000-4000-a231-000000000019',
  '00000000-0000-4000-a231-000000000020',
  '00000000-0000-4000-a231-000000000021',
] as const;
const VALID_EAN_13 = '4006381333931';
const VALID_UPC_A = '036000291452';
const VALID_LEADING_ZERO_GTIN_14 = `0${VALID_EAN_13}`;
const INTERNAL_LEADING_ZERO_GTIN_14 = '02001234567893';
const VALID_NONZERO_GTIN_14 = '10012345678902';
const VALID_OFF_SHORT_CODES = [
  '123456784',
  '1234567895',
  '12345678905',
] as const;

interface OriginalGlobalSetting {
  allow_openfoodfacts_contributions: boolean;
}

async function clearFixtures(): Promise<void> {
  const client = await getSystemClient();
  try {
    await client.query(
      'DELETE FROM public.openfoodfacts_sync_queue WHERE user_id = $1',
      [USER_ID]
    );
    await client.query('DELETE FROM public.foods WHERE id = ANY($1::uuid[])', [
      FOOD_IDS,
    ]);
  } finally {
    client.release();
  }
}

async function setServerConsent(enabled: boolean): Promise<void> {
  const client = await getSystemClient();
  try {
    await client.query(
      `UPDATE public.global_settings
          SET allow_openfoodfacts_contributions = $1
        WHERE id = 1`,
      [enabled]
    );
  } finally {
    client.release();
  }
}

async function setUserConsent(
  enabled: boolean,
  language = 'en'
): Promise<void> {
  const client = await getSystemClient();
  try {
    await client.query(
      `INSERT INTO public.user_preferences (
         user_id,
         auto_contribute_openfoodfacts,
         openfoodfacts_product_language
       ) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         auto_contribute_openfoodfacts = EXCLUDED.auto_contribute_openfoodfacts,
         openfoodfacts_product_language = EXCLUDED.openfoodfacts_product_language`,
      [USER_ID, enabled, language]
    );
  } finally {
    client.release();
  }
}

async function insertFood(input: {
  id: string;
  name?: string;
  barcode?: string;
  providerType?: string | null;
  isCustom?: boolean;
  servingUnit?: string;
  isDefault?: boolean;
}): Promise<string> {
  const client = await getSystemClient();
  try {
    await client.query(
      `INSERT INTO public.foods
         (id, user_id, name, barcode, is_custom, provider_type, shared_with_public)
       VALUES ($1, $2, $3, $4, $5, $6, false)`,
      [
        input.id,
        USER_ID,
        input.name ?? 'Automatic sync test food',
        input.barcode ?? VALID_EAN_13,
        input.isCustom ?? true,
        input.providerType ?? null,
      ]
    );
    const variant = await client.query(
      `INSERT INTO public.food_variants
         (food_id, serving_size, serving_unit, calories, is_default)
       VALUES ($1, 100, $2, 250, $3)
       RETURNING id`,
      [input.id, input.servingUnit ?? 'g', input.isDefault ?? true]
    );
    return (variant.rows as Array<{ id: string }>)[0]!.id;
  } finally {
    client.release();
  }
}

async function queuedRows(): Promise<
  Array<{ food_id: string; revision: string; status: string }>
> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT food_id, revision, status
         FROM public.openfoodfacts_sync_queue
        WHERE user_id = $1
        ORDER BY food_id`,
      [USER_ID]
    );
    return result.rows as Array<{
      food_id: string;
      revision: string;
      status: string;
    }>;
  } finally {
    client.release();
  }
}

async function resetProductReadRateLimitIfPresent(): Promise<boolean> {
  const client = await getSystemClient();
  try {
    const relation = await client.query(
      `SELECT to_regclass(
         'public.openfoodfacts_product_read_rate_limit'
       ) IS NOT NULL AS available`
    );
    const available = relation.rows[0]?.available === true;
    if (available) {
      await client.query(
        `UPDATE public.openfoodfacts_product_read_rate_limit
            SET next_product_read_at = '2000-01-01T00:00:00Z'::timestamptz,
                reservation_token = NULL,
                reservation_expires_at = NULL,
                updated_at = NOW()
          WHERE id = 1`
      );
    }
    return available;
  } finally {
    client.release();
  }
}

async function expireLease(foodId: string): Promise<void> {
  const client = await getSystemClient();
  try {
    await client.query(
      `UPDATE public.openfoodfacts_sync_queue
          SET lease_expires_at = NOW() - INTERVAL '1 second'
        WHERE food_id = $1`,
      [foodId]
    );
  } finally {
    client.release();
  }
}

describe.runIf(RUN)('Open Food Facts automatic sync database behavior', () => {
  let originalGlobalSetting: OriginalGlobalSetting | undefined;

  beforeAll(async () => {
    const client = await getSystemClient();
    try {
      const originalSettingResult = await client.query(
        `SELECT allow_openfoodfacts_contributions
           FROM public.global_settings
          WHERE id = 1`
      );
      originalGlobalSetting = (
        originalSettingResult.rows as OriginalGlobalSetting[]
      )[0];
      await client.query('DELETE FROM public."user" WHERE id = $1', [USER_ID]);
      await client.query(
        `INSERT INTO public."user" (id, email, email_verified)
         VALUES ($1, $2, true)`,
        [USER_ID, 'off-automatic-sync-owner@example.test']
      );
      await client.query(
        `INSERT INTO public.user_preferences (user_id)
         VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [USER_ID]
      );
    } finally {
      client.release();
    }
  });

  beforeEach(async () => {
    await clearFixtures();
    await setServerConsent(false);
    await setUserConsent(false);
    await resetProductReadRateLimitIfPresent();
  });

  afterAll(async () => {
    await clearFixtures();
    const client = await getSystemClient();
    try {
      if (originalGlobalSetting) {
        await client.query(
          `UPDATE public.global_settings
              SET allow_openfoodfacts_contributions = $1
            WHERE id = 1`,
          [originalGlobalSetting.allow_openfoodfacts_contributions]
        );
      }
      await client.query('DELETE FROM public."user" WHERE id = $1', [USER_ID]);
    } finally {
      client.release();
    }
    await endPool();
  });

  it('requires independent server and food-owner consent before a trigger queues work', async () => {
    await setServerConsent(true);
    await insertFood({ id: FOOD_IDS[0] });
    expect(await queuedRows()).toEqual([]);

    await clearFixtures();
    await setServerConsent(false);
    await setUserConsent(true);
    await insertFood({ id: FOOD_IDS[1] });
    expect(await queuedRows()).toEqual([]);

    await clearFixtures();
    await setServerConsent(true);
    await insertFood({ id: FOOD_IDS[2] });
    expect((await queuedRows()).map((row) => row.food_id)).toEqual([
      FOOD_IDS[2],
    ]);
  });

  it('queues only locally created products and rejects imported provenance even if ownership says custom', async () => {
    await setServerConsent(true);
    await setUserConsent(true);

    await insertFood({ id: FOOD_IDS[0], providerType: null });
    await insertFood({ id: FOOD_IDS[1], providerType: 'custom' });
    await insertFood({ id: FOOD_IDS[2], providerType: 'fatsecret' });
    await insertFood({ id: FOOD_IDS[3], providerType: 'openfoodfacts' });

    expect((await queuedRows()).map((row) => row.food_id)).toEqual([
      FOOD_IDS[0],
      FOOD_IDS[1],
    ]);
  });

  it('requires a checksum-valid public GTIN and a metric-convertible default serving', async () => {
    await setServerConsent(true);
    await setUserConsent(true);

    await insertFood({ id: FOOD_IDS[0], barcode: '4006381333932' });
    await insertFood({ id: FOOD_IDS[1], barcode: '2001234567893' });
    await insertFood({ id: FOOD_IDS[2], servingUnit: 'scoop' });
    await insertFood({ id: FOOD_IDS[4], barcode: '00000000' });
    await insertFood({ id: FOOD_IDS[5], barcode: VALID_OFF_SHORT_CODES[0] });
    await insertFood({ id: FOOD_IDS[6], barcode: VALID_OFF_SHORT_CODES[1] });
    await insertFood({ id: FOOD_IDS[7], barcode: VALID_OFF_SHORT_CODES[2] });
    await insertFood({ id: FOOD_IDS[8], barcode: VALID_LEADING_ZERO_GTIN_14 });
    await insertFood({
      id: FOOD_IDS[9],
      barcode: INTERNAL_LEADING_ZERO_GTIN_14,
    });
    await insertFood({ id: FOOD_IDS[10], barcode: VALID_NONZERO_GTIN_14 });
    await insertFood({
      id: FOOD_IDS[3],
      barcode: VALID_UPC_A,
      servingUnit: 'kg',
    });

    expect((await queuedRows()).map((row) => row.food_id)).toEqual([
      FOOD_IDS[3],
      FOOD_IDS[5],
      FOOD_IDS[6],
      FOOD_IDS[7],
      FOOD_IDS[8],
      FOOD_IDS[10],
    ]);

    const client = await getSystemClient();
    try {
      await expect(
        client.query(
          'SELECT public.normalize_openfoodfacts_gtin($1) AS normalized',
          [VALID_UPC_A]
        )
      ).resolves.toMatchObject({
        rows: [{ normalized: `0${VALID_UPC_A}` }],
      });
      for (const code of VALID_OFF_SHORT_CODES) {
        await expect(
          client.query(
            'SELECT public.normalize_openfoodfacts_gtin($1) AS normalized',
            [code]
          )
        ).resolves.toMatchObject({
          rows: [{ normalized: code.padStart(13, '0') }],
        });
      }
      await expect(
        client.query(
          'SELECT public.normalize_openfoodfacts_gtin($1) AS normalized',
          [VALID_LEADING_ZERO_GTIN_14]
        )
      ).resolves.toMatchObject({ rows: [{ normalized: VALID_EAN_13 }] });
      await expect(
        client.query(
          'SELECT public.normalize_openfoodfacts_gtin($1) AS normalized',
          [INTERNAL_LEADING_ZERO_GTIN_14]
        )
      ).resolves.toMatchObject({ rows: [{ normalized: null }] });
      await expect(
        client.query(
          'SELECT public.normalize_openfoodfacts_gtin($1) AS normalized',
          [VALID_NONZERO_GTIN_14]
        )
      ).resolves.toMatchObject({
        rows: [{ normalized: VALID_NONZERO_GTIN_14 }],
      });
    } finally {
      client.release();
    }
  });

  it('ignores secondary variants and increments the revision only for default-variant edits', async () => {
    await setServerConsent(true);
    await setUserConsent(true);

    const secondaryVariantId = await insertFood({
      id: FOOD_IDS[0],
      isDefault: false,
    });
    expect(await queuedRows()).toEqual([]);

    const client = await getSystemClient();
    let defaultVariantId: string;
    try {
      await client.query(
        'UPDATE public.food_variants SET calories = 100 WHERE id = $1',
        [secondaryVariantId]
      );
      expect(await queuedRows()).toEqual([]);

      const defaultVariantResult = await client.query(
        `INSERT INTO public.food_variants
           (food_id, serving_size, serving_unit, calories, is_default)
         VALUES ($1, 100, 'g', 250, true)
         RETURNING id`,
        [FOOD_IDS[0]]
      );
      defaultVariantId = (
        defaultVariantResult.rows as Array<{ id: string }>
      )[0]!.id;
      const initialQueuedRow = (await queuedRows())[0];
      expect(initialQueuedRow).toMatchObject({
        food_id: FOOD_IDS[0],
        status: 'pending',
      });
      const initialRevision = Number(initialQueuedRow?.revision);

      await client.query(
        'UPDATE public.food_variants SET calories = 101 WHERE id = $1',
        [secondaryVariantId]
      );
      expect(Number((await queuedRows())[0]?.revision)).toBe(initialRevision);

      await client.query(
        'UPDATE public.food_variants SET calories = 251 WHERE id = $1',
        [defaultVariantId]
      );
      expect(Number((await queuedRows())[0]?.revision)).toBeGreaterThan(
        initialRevision
      );

      await client.query(
        'UPDATE public.food_variants SET is_default = false WHERE id = $1',
        [defaultVariantId]
      );
      expect(await queuedRows()).toEqual([]);
    } finally {
      client.release();
    }
  });

  it('deletes retained state on opt-out and marks backfill only on consent transitions', async () => {
    await setServerConsent(true);
    await setUserConsent(true);
    await insertFood({ id: FOOD_IDS[0] });
    expect(await queuedRows()).toHaveLength(1);

    await setUserConsent(false);
    expect(await queuedRows()).toEqual([]);

    const client = await getSystemClient();
    try {
      const optedOutResult = await client.query(
        `SELECT openfoodfacts_backfill_pending AS pending
           FROM public.user_preferences
          WHERE user_id = $1`,
        [USER_ID]
      );
      expect(
        (optedOutResult.rows as Array<{ pending: boolean }>)[0]?.pending
      ).toBe(false);

      await setUserConsent(true);
      const optedInResult = await client.query(
        `SELECT openfoodfacts_backfill_pending AS pending
           FROM public.user_preferences
          WHERE user_id = $1`,
        [USER_ID]
      );
      expect(
        (optedInResult.rows as Array<{ pending: boolean }>)[0]?.pending
      ).toBe(true);
    } finally {
      client.release();
    }
  });

  it('durably marks opted-in users on a direct server-gate transition only', async () => {
    await setUserConsent(true);
    const client = await getSystemClient();
    try {
      await client.query(
        `UPDATE public.user_preferences
            SET openfoodfacts_backfill_pending = FALSE
          WHERE user_id = $1`,
        [USER_ID]
      );

      await setServerConsent(true);
      await expect(
        client.query(
          `SELECT openfoodfacts_backfill_pending AS pending
             FROM public.user_preferences
            WHERE user_id = $1`,
          [USER_ID]
        )
      ).resolves.toMatchObject({ rows: [{ pending: true }] });

      await client.query(
        `UPDATE public.user_preferences
            SET openfoodfacts_backfill_pending = FALSE
          WHERE user_id = $1`,
        [USER_ID]
      );
      await setServerConsent(true);
      await expect(
        client.query(
          `SELECT openfoodfacts_backfill_pending AS pending
             FROM public.user_preferences
            WHERE user_id = $1`,
          [USER_ID]
        )
      ).resolves.toMatchObject({ rows: [{ pending: false }] });
    } finally {
      client.release();
    }
  });

  it('never reuses a revision token after opt-out deletes and recreates a queue row', async () => {
    await setServerConsent(true);
    await setUserConsent(true);
    await insertFood({ id: FOOD_IDS[0] });
    const originalRevision = Number((await queuedRows())[0]?.revision);

    await setUserConsent(false);
    expect(await queuedRows()).toEqual([]);
    await setUserConsent(true);
    await queueRepository.enqueueNextBackfillBatch(100);

    const recreatedRevision = Number((await queuedRows())[0]?.revision);
    expect(recreatedRevision).toBeGreaterThan(originalRevision);
  });

  it('invalidates an expired worker revision when a new lease claims the same food', async () => {
    await setServerConsent(true);
    await setUserConsent(true);
    await insertFood({ id: FOOD_IDS[0] });

    const [firstClaim] = await queueRepository.claimDue(1, 120, 8);
    expect(firstClaim).toBeDefined();
    await expireLease(FOOD_IDS[0]);
    await expect(
      queueRepository.isClaimCurrent(FOOD_IDS[0], USER_ID, firstClaim!.revision)
    ).resolves.toBe(false);

    const [replacementClaim] = await queueRepository.claimDue(1, 120, 8);
    expect(replacementClaim).toBeDefined();
    expect(replacementClaim!.revision).toBeGreaterThan(firstClaim!.revision);
    await expect(
      queueRepository.markSucceeded(FOOD_IDS[0], firstClaim!.revision)
    ).resolves.toBe(false);
    await expect(
      queueRepository.markSucceeded(FOOD_IDS[0], replacementClaim!.revision)
    ).resolves.toBe(true);
  });

  it('does not reserve a product-read permit while merely claiming queue work', async () => {
    await setServerConsent(true);
    await setUserConsent(true);
    await insertFood({ id: FOOD_IDS[0] });
    await insertFood({ id: FOOD_IDS[1], barcode: VALID_UPC_A });

    const concurrentClaims = await Promise.all([
      queueRepository.claimDue(1, 300, 8),
      queueRepository.claimDue(1, 300, 8),
    ]);
    expect(concurrentClaims.flat()).toHaveLength(2);

    const client = await getSystemClient();
    try {
      const states = await client.query(
        `SELECT status, COUNT(*)::integer AS count
           FROM public.openfoodfacts_sync_queue
          WHERE user_id = $1
          GROUP BY status
          ORDER BY status`,
        [USER_ID]
      );
      expect(states.rows).toEqual([{ status: 'processing', count: 2 }]);
    } finally {
      client.release();
    }
  });

  it('keeps delayed automatic and interactive product reads at least five seconds apart', async () => {
    expect(await resetProductReadRateLimitIfPresent()).toBe(true);
    const requestStartedAt: number[] = [];
    let signalFirstStart: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      signalFirstStart = resolve;
    });

    const automaticRead = withOpenFoodFactsProductReadPermit(
      async () => {
        requestStartedAt.push(Date.now());
        signalFirstStart?.();
        await new Promise((resolve) => setTimeout(resolve, 250));
      },
      { maxWaitMs: 0 }
    );
    await firstStarted;
    const interactiveRead = withOpenFoodFactsProductReadPermit(
      async () => {
        requestStartedAt.push(Date.now());
      },
      { maxWaitMs: 7_000 }
    );

    await Promise.all([automaticRead, interactiveRead]);
    expect(requestStartedAt).toHaveLength(2);
    expect(requestStartedAt[1]! - requestStartedAt[0]!).toBeGreaterThanOrEqual(
      5_000
    );
  }, 12_000);

  it('prevents a stale permit release from overwriting a newer owner', async () => {
    expect(await resetProductReadRateLimitIfPresent()).toBe(true);
    const staleToken = randomUUID();
    const currentToken = randomUUID();
    await expect(
      productReadRateLimitRepository.tryAcquire(staleToken)
    ).resolves.toMatchObject({ acquired: true, token: staleToken });

    const client = await getSystemClient();
    try {
      await client.query(
        `UPDATE public.openfoodfacts_product_read_rate_limit
            SET reservation_expires_at = clock_timestamp() - INTERVAL '1 second'
          WHERE id = 1`
      );
    } finally {
      client.release();
    }

    await expect(
      productReadRateLimitRepository.tryAcquire(currentToken)
    ).resolves.toMatchObject({ acquired: true, token: currentToken });
    await expect(
      productReadRateLimitRepository.release(staleToken)
    ).resolves.toBe(false);

    const verificationClient = await getSystemClient();
    try {
      await expect(
        verificationClient.query(
          `SELECT reservation_token::text AS token
             FROM public.openfoodfacts_product_read_rate_limit
            WHERE id = 1`
        )
      ).resolves.toMatchObject({ rows: [{ token: currentToken }] });
    } finally {
      verificationClient.release();
    }
    await expect(
      productReadRateLimitRepository.release(currentToken)
    ).resolves.toBe(true);
  });

  it('counts crash reclaims once per lease and terminates after the attempt ceiling', async () => {
    await setServerConsent(true);
    await setUserConsent(true);
    await insertFood({ id: FOOD_IDS[0] });
    const [firstClaim] = await queueRepository.claimDue(1, 300, 2);
    expect(firstClaim?.attemptCount).toBe(1);
    await expireLease(FOOD_IDS[0]);

    const [secondClaim] = await queueRepository.claimDue(1, 300, 2);
    expect(secondClaim?.attemptCount).toBe(2);
    await expireLease(FOOD_IDS[0]);

    await expect(queueRepository.claimDue(1, 300, 2)).resolves.toEqual([]);
    const client = await getSystemClient();
    try {
      await expect(
        client.query(
          `SELECT status, attempt_count
             FROM public.openfoodfacts_sync_queue
            WHERE food_id = $1`,
          [FOOD_IDS[0]]
        )
      ).resolves.toMatchObject({
        rows: [{ status: 'failed', attempt_count: 2 }],
      });
    } finally {
      client.release();
    }
  });

  it('feeds the historical catalog in bounded batches', async () => {
    await insertFood({ id: FOOD_IDS[0] });
    await insertFood({ id: FOOD_IDS[1], barcode: VALID_UPC_A });
    await setServerConsent(true);
    await setUserConsent(true);

    await expect(queueRepository.enqueueNextBackfillBatch(1)).resolves.toEqual({
      userId: USER_ID,
      enqueued: 1,
      hasMore: true,
    });
    expect(await queuedRows()).toHaveLength(1);

    await expect(queueRepository.enqueueNextBackfillBatch(1)).resolves.toEqual({
      userId: USER_ID,
      enqueued: 1,
      hasMore: true,
    });
    expect(await queuedRows()).toHaveLength(2);

    await expect(queueRepository.enqueueNextBackfillBatch(1)).resolves.toEqual({
      userId: USER_ID,
      enqueued: 0,
      hasMore: false,
    });
  });

  it('upgrades the earlier automatic-only limiter name without leaving old database objects', async () => {
    const migrationPath = path.resolve(
      here,
      '../db/migrations/20260901103000_add_openfoodfacts_automatic_sync.sql'
    );
    const migrationSql = await readFile(migrationPath, 'utf8');
    const client = await getSystemClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `DO $test$
         BEGIN
           IF EXISTS (
             SELECT 1
               FROM pg_constraint
              WHERE conrelid = 'public.openfoodfacts_product_read_rate_limit'::regclass
                AND conname = 'openfoodfacts_product_read_rate_limit_pkey'
           ) THEN
             ALTER TABLE public.openfoodfacts_product_read_rate_limit
               RENAME CONSTRAINT openfoodfacts_product_read_rate_limit_pkey
               TO openfoodfacts_automatic_sync_rate_limit_pkey;
           END IF;
         END;
         $test$`
      );
      await client.query(
        `ALTER TABLE public.openfoodfacts_product_read_rate_limit
         RENAME COLUMN next_product_read_at TO next_claim_at`
      );
      await client.query(
        `ALTER TABLE public.openfoodfacts_product_read_rate_limit
         RENAME TO openfoodfacts_automatic_sync_rate_limit`
      );
      await client.query(migrationSql);

      await expect(
        client.query(
          `SELECT
             to_regclass('public.openfoodfacts_automatic_sync_rate_limit') AS old_table,
             to_regclass('public.openfoodfacts_product_read_rate_limit')::text AS new_table`
        )
      ).resolves.toMatchObject({
        rows: [
          {
            old_table: null,
            new_table: 'openfoodfacts_product_read_rate_limit',
          },
        ],
      });
      await expect(
        client.query(
          `SELECT next_product_read_at, reservation_token, reservation_expires_at
             FROM public.openfoodfacts_product_read_rate_limit
            WHERE id = 1`
        )
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        client.query(
          `SELECT conname
             FROM pg_constraint
            WHERE conrelid = 'public.openfoodfacts_product_read_rate_limit'::regclass
              AND contype = 'p'`
        )
      ).resolves.toMatchObject({
        rows: [{ conname: 'openfoodfacts_product_read_rate_limit_pkey' }],
      });
      await expect(
        client.query(
          `SELECT COUNT(*)::integer AS count
             FROM pg_constraint
            WHERE conname LIKE 'openfoodfacts_automatic_sync_rate_limit%'`
        )
      ).resolves.toMatchObject({ rows: [{ count: 0 }] });
      await expect(
        client.query(
          `SELECT COUNT(*)::integer AS count
             FROM pg_class
            WHERE relnamespace = 'public'::regnamespace
              AND relname LIKE 'openfoodfacts_automatic_sync_rate_limit%'`
        )
      ).resolves.toMatchObject({ rows: [{ count: 0 }] });
      await expect(
        client.query(
          `SELECT COUNT(*)::integer AS count
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'openfoodfacts_product_read_rate_limit'
              AND column_name IN ('next_claim_at', 'next_allowed_at', 'next_available_at')`
        )
      ).resolves.toMatchObject({ rows: [{ count: 0 }] });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
