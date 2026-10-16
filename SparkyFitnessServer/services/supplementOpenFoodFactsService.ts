import { log } from '../config/logging.js';
import { searchOpenFoodFactsByBarcodeFields } from '../integrations/openfoodfacts/openFoodFactsService.js';
import {
  totalIngredients,
  type IngredientLine,
} from './supplementLookupService.js';
import type { SupplementLookupProduct } from '@workspace/shared';

// The product fields a supplement needs. `nutriments` carries the per-serving
// amounts when the contributor entered them.
const OFF_FIELDS = [
  'code',
  'product_name',
  'brands',
  'serving_size',
  'nutriments',
];

type OffNutriments = Record<string, unknown>;

export interface OffSupplementProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_size?: string;
  nutriments?: OffNutriments;
}

// Open Food Facts stores a nutrient under its tag ("vitamin-d") and keeps energy
// as "energy-kcal". Names the nutrient catalog does not know are matched through
// these.
const OFF_NAME_ALIASES: Record<string, string> = {
  proteins: 'protein',
  'energy-kcal': 'calories',
};

// Not nutrients a supplement form takes, even though OFF reports them per serving.
const OFF_IGNORED = new Set([
  'energy',
  'energy-kj',
  'energy-from-fat',
  'salt',
  'alcohol',
  'nutrition-score-fr',
  'nutrition-score-uk',
  'nova-group',
  'carbon-footprint',
  'fruits-vegetables-nuts-estimate-from-ingredients',
  'fruits-vegetables-legumes-estimate-from-ingredients',
]);

const FORM_WORDS: [RegExp, NonNullable<SupplementLookupProduct['form']>][] = [
  [/softgel/i, 'softgel'],
  [/gummy|gummies/i, 'gummy'],
  [/powder/i, 'powder'],
  [/liquid|drops|syrup/i, 'liquid'],
  [/tablet|tabs\b/i, 'tablet'],
  [/capsule|caps\b/i, 'capsule'],
];

/**
 * Turns an Open Food Facts product into the same lookup product the database
 * returns. Only per-serving values are used: OFF's per-100 g figures are not a
 * supplement's dose. A product with no per-serving nutrients still comes back,
 * with its name and brand, so the form is not left empty.
 */
export function mapOpenFoodFactsSupplement(
  product: OffSupplementProduct
): SupplementLookupProduct {
  const nutriments = product.nutriments ?? {};
  const lines: IngredientLine[] = [];
  for (const [key, value] of Object.entries(nutriments)) {
    if (!key.endsWith('_serving')) continue;
    const tag = key.slice(0, -'_serving'.length);
    if (OFF_IGNORED.has(tag)) continue;
    const amount = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const name = OFF_NAME_ALIASES[tag] ?? tag.replace(/-/g, ' ');
    lines.push({
      name,
      amount,
      // OFF stores amounts in grams, except energy which is kcal.
      unit: tag === 'energy-kcal' ? 'kcal' : 'g',
      hint: name,
    });
  }

  const name = product.product_name?.trim() ?? '';
  const brand = product.brands?.split(',')[0]?.trim() || null;
  return {
    source: 'off',
    sourceId: product.code ?? '',
    name:
      brand && name && !name.toLowerCase().startsWith(brand.toLowerCase())
        ? `${brand} ${name}`
        : name || brand || '',
    brand,
    form: FORM_WORDS.find(([pattern]) => pattern.test(name))?.[1] ?? null,
    serving: product.serving_size?.trim() || null,
    ...totalIngredients(lines, false),
  };
}

/**
 * Looks a barcode up in Open Food Facts, for the products the supplement label
 * database does not have (mostly outside the US). Null when OFF has no such
 * product or cannot be reached: a failure here is a miss, not an error, since
 * the primary lookup already answered.
 */
export async function lookupSupplementInOpenFoodFacts(
  barcode: string,
  context: { userId: string; providerId?: string }
): Promise<SupplementLookupProduct | null> {
  try {
    const result = await searchOpenFoodFactsByBarcodeFields(
      barcode,
      OFF_FIELDS,
      'en',
      context.userId,
      context.providerId
    );
    if (result.status !== 1 || !result.product) return null;
    const product = mapOpenFoodFactsSupplement(
      result.product as unknown as OffSupplementProduct
    );
    return product.name ? product : null;
  } catch (error) {
    log(
      'warn',
      `Supplement Open Food Facts fallback failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}
