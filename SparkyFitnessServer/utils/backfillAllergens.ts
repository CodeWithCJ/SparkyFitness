import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import { searchOpenFoodFactsByBarcodeFields } from '../integrations/openfoodfacts/openFoodFactsService.js';

const RATE_LIMIT_DELAY_MS = 1000;
const MAX_RETRIES = 3;

function normalizeAllergenTags(tags: string[] | undefined): string[] {
  if (!tags || tags.length === 0) return [];
  return tags.map((t) => t.replace(/^[a-z]{2}:/, ''));
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  barcode: string,
  attempt = 1
): Promise<{ allergens: string[]; traces: string[] } | null> {
  try {
    const data = await searchOpenFoodFactsByBarcodeFields(
      barcode,
      ['allergens_tags', 'traces_tags'],
      'en',
      null,
      null
    );

    if (!data?.product) return null;

    return {
      allergens: normalizeAllergenTags(data.product.allergens_tags),
      traces: normalizeAllergenTags(data.product.traces_tags),
    };
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const backoff = RATE_LIMIT_DELAY_MS * 2 ** (attempt - 1);
      log(
        'warn',
        `backfillOffAllergens: attempt ${attempt} failed for barcode ${barcode}, retrying in ${backoff}ms`
      );
      await sleep(backoff);
      return fetchWithRetry(barcode, attempt + 1);
    }
    throw err;
  }
}

export async function backfillOffAllergens(
  userId: string
): Promise<{ updated: number; total: number }> {
  // Use RLS-scoped client so only the requesting user's foods are processed
  const client = await getClient(userId);
  try {
    // allergens IS NULL means not yet checked — empty array means checked but no data found
    const { rows } = await client.query(`
      SELECT fv.id AS variant_id, f.provider_external_id AS barcode
      FROM food_variants fv
      JOIN foods f ON fv.food_id = f.id
      WHERE f.provider_type = 'openfoodfacts'
        AND f.provider_external_id IS NOT NULL
        AND fv.allergens IS NULL
    `);

    const total = rows.length;

    if (total === 0) {
      return { updated: 0, total: 0 };
    }

    log(
      'info',
      `backfillOffAllergens: syncing allergens for ${total} variant(s)`
    );

    let updated = 0;
    for (const row of rows) {
      try {
        const result = await fetchWithRetry(row.barcode);

        // Always write — empty arrays mark the variant as checked so it won't
        // be retried on the next sync. NULL stays reserved for "not yet checked".
        const allergens = result?.allergens ?? [];
        const traces = result?.traces ?? [];

        await client.query(
          'UPDATE food_variants SET allergens = $1, traces = $2 WHERE id = $3',
          [allergens, traces, row.variant_id]
        );
        updated++;
      } catch (err) {
        log(
          'warn',
          `backfillOffAllergens: failed for barcode ${row.barcode}: ${(err as Error).message}`
        );
      }

      // Respect OFF rate limit (unauthenticated: ~15 req/min)
      await sleep(RATE_LIMIT_DELAY_MS);
    }

    log('info', `backfillOffAllergens: updated ${updated}/${total} variant(s)`);
    return { updated, total };
  } finally {
    client.release();
  }
}
