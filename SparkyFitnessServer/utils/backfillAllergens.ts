import { getSystemClient } from '../db/poolManager.js';
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

export async function backfillOffAllergens(): Promise<void> {
  const client = await getSystemClient();
  try {
    // allergens IS NULL means not yet checked — empty array means checked but no data
    const { rows } = await client.query(`
      SELECT fv.id AS variant_id, f.provider_external_id AS barcode
      FROM food_variants fv
      JOIN foods f ON fv.food_id = f.id
      WHERE f.provider_type = 'openfoodfacts'
        AND f.provider_external_id IS NOT NULL
        AND fv.allergens IS NULL
    `);

    if (rows.length === 0) {
      log('info', 'backfillOffAllergens: nothing to backfill');
      return;
    }

    log(
      'info',
      `backfillOffAllergens: backfilling allergens for ${rows.length} variant(s)`
    );

    let updated = 0;
    for (const row of rows) {
      try {
        const result = await fetchWithRetry(row.barcode);

        // Always write — empty arrays mark the variant as checked so it won't
        // be retried on the next server start. NULL stays reserved for "not yet checked".
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

      // Respect OFF rate limit between every request
      await sleep(RATE_LIMIT_DELAY_MS);
    }

    log('info', `backfillOffAllergens: updated ${updated} variant(s)`);
  } finally {
    client.release();
  }
}
