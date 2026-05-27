import { getSystemClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import { searchOpenFoodFactsByBarcodeFields } from '../integrations/openfoodfacts/openFoodFactsService.js';

function normalizeAllergenTags(tags: string[] | undefined): string[] | null {
  if (!tags || tags.length === 0) return null;
  return tags.map((t) => t.replace(/^[a-z]{2}:/, ''));
}

export async function backfillOffAllergens(): Promise<void> {
  const client = await getSystemClient();
  try {
    // Find all food variants sourced from OpenFoodFacts that still have NULL allergens
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
        const data = await searchOpenFoodFactsByBarcodeFields(
          row.barcode,
          ['allergens_tags', 'traces_tags'],
          'en',
          null,
          null
        );

        if (!data?.product) continue;

        const allergens = normalizeAllergenTags(data.product.allergens_tags);
        const traces = normalizeAllergenTags(data.product.traces_tags);

        // Only write if there is actual allergen data (keep NULL for products with no data)
        if (allergens === null && traces === null) continue;

        await client.query(
          'UPDATE food_variants SET allergens = $1, traces = $2 WHERE id = $3',
          [allergens, traces, row.variant_id]
        );
        updated++;
      } catch (err) {
        // Don't abort the whole backfill if one barcode fails
        log(
          'warn',
          `backfillOffAllergens: failed for barcode ${row.barcode}: ${(err as Error).message}`
        );
      }
    }

    log('info', `backfillOffAllergens: updated ${updated} variant(s)`);
  } finally {
    client.release();
  }
}
