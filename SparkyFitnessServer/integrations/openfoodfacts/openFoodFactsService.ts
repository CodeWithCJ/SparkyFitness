import {
  getOpenFoodFactsSessionCookie,
  invalidateOpenFoodFactsSession,
} from './openFoodFactsAuth.js';
import { log } from '../../config/logging.js';
import package$0 from '../../package.json' with { type: 'json' };
import { normalizeBarcode } from '../../utils/foodUtils.js';
const { name, version } = package$0;
const USER_AGENT = `${name}/${version} (https://github.com/CodeWithCJ/SparkyFitness)`;
const OFF_HEADERS = {
  'User-Agent': USER_AGENT,
};
const OFF_FIELDS = [
  'product_name',
  'product_name_en',
  'brands',
  'code',
  'serving_size',
  'serving_quantity',
  'nutriments',
  'allergens_tags',
  'traces_tags',
];

interface OffProduct {
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  code?: string;
  serving_size?: string;
  serving_quantity?: number;
  nutriments?: Record<string, unknown>;
  allergens_tags?: string[];
  traces_tags?: string[];
  [key: string]: unknown;
}

interface OffSearchResponse {
  products?: OffProduct[];
  page?: number;
  page_size?: number;
  count?: number;
}

// Wraps fetch with optional session-cookie authentication for OFF endpoints.
// On 429/5xx with an attached cookie, invalidates the session and retries once
// without the cookie. OFF returns 200 on stale cookies (no 401 signal), so we
// don't try to distinguish that case — we only retry on the observable
// failure mode (rate limiting).
async function fetchOpenFoodFacts(
  url: string,
  {
    authenticatedUserId,
    providerId,
  }: { authenticatedUserId?: string; providerId?: string } = {}
) {
  const baseHeaders = { ...OFF_HEADERS };
  let sessionCookie = null;

  if (authenticatedUserId && providerId) {
    try {
      sessionCookie = await getOpenFoodFactsSessionCookie(
        authenticatedUserId,
        providerId
      );
    } catch (error) {
      log('debug', 'OpenFoodFacts: session cookie lookup failed:', error);
    }
  }

  const headers = sessionCookie
    ? { ...baseHeaders, Cookie: `session=${sessionCookie}` }
    : baseHeaders;

  const response = await fetch(url, { method: 'GET', headers });

  if (sessionCookie && (response.status === 429 || response.status >= 500)) {
    log(
      'warn',
      `OpenFoodFacts: ${response.status} with session cookie — invalidating and retrying unauthenticated`
    );
    if (authenticatedUserId && providerId) {
      invalidateOpenFoodFactsSession(authenticatedUserId, providerId);
    }
    return fetch(url, { method: 'GET', headers: baseHeaders });
  }

  return response;
}

async function searchOpenFoodFacts(
  query: string,
  page = 1,
  language = 'en',
  authenticatedUserId?: string,
  providerId?: string
): Promise<{
  products: OffProduct[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    hasMore: boolean;
  };
}> {
  try {
    const fieldSet = new Set(OFF_FIELDS);
    if (language !== 'en') {
      fieldSet.add(`product_name_${language}`);
    }
    const fields = [...fieldSet];
    const searchUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&page=${page}&fields=${fields.join(',')}&lc=${language}`;
    const response = await fetchOpenFoodFacts(searchUrl, {
      authenticatedUserId,
      providerId,
    });
    if (!response.ok) {
      const errorText = await response.text();
      log('error', 'OpenFoodFacts Search API error:', errorText);
      throw new Error(`OpenFoodFacts API error: ${errorText}`);
    }
    const data = (await response.json()) as OffSearchResponse;
    return {
      products: data.products || [],
      pagination: {
        page: data.page || page,
        pageSize: data.page_size || 20,
        totalCount: data.count || 0,
        hasMore:
          (data.page || page) * (data.page_size || 20) < (data.count || 0),
      },
    };
  } catch (error) {
    log(
      'error',
      `Error searching OpenFoodFacts with query "${query}" in foodService:`,
      error
    );
    throw error;
  }
}
async function searchOpenFoodFactsByBarcodeFields(
  barcode: string,
  fields = OFF_FIELDS,
  language = 'en',
  authenticatedUserId?: string,
  providerId?: string
): Promise<{
  status: number;
  status_verbose: string;
  product?: OffProduct;
  [key: string]: unknown;
}> {
  try {
    const fieldSet = new Set(fields);
    if (language !== 'en') {
      fieldSet.add(`product_name_${language}`);
    }
    const finalFields = [...fieldSet];
    const fieldsParam = finalFields.join(',');
    const searchUrl = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${fieldsParam}&lc=${language}`;
    const response = await fetchOpenFoodFacts(searchUrl, {
      authenticatedUserId,
      providerId,
    });
    if (!response.ok) {
      if (response.status === 404) {
        log(
          'debug',
          `OpenFoodFacts product not found for barcode "${barcode}"`
        );
        return { status: 0, status_verbose: 'product not found' };
      }
      const errorText = await response.text();
      log('error', 'OpenFoodFacts Barcode Fields Search API error:', errorText);
      throw new Error(`OpenFoodFacts API error: ${errorText}`);
    }
    const data = (await response.json()) as {
      status: number;
      status_verbose: string;
      product?: OffProduct;
      [key: string]: unknown;
    };
    return data;
  } catch (error) {
    log(
      'error',
      `Error searching OpenFoodFacts with barcode "${barcode}" and fields "${fields.join(',')}" in foodService:`,
      error
    );
    throw error;
  }
}
function normalizeAllergenTags(tags: string[] | undefined): string[] | null {
  if (!tags || tags.length === 0) return null;
  return tags.map((t) => t.replace(/^[a-z]{2}:/, ''));
}

// OpenFoodFacts stores every nutrient's `*_100g` value in grams but exposes the
// label's display unit on `*_unit`. Convert grams to that unit (e.g. magnesium
// 0.018 g -> 18 mg) so matched custom nutrients carry sensible values, then
// scale to the variant's serving. Keyed by normalized nutrient name.
const GRAMS_TO_UNIT: Record<string, number> = {
  g: 1,
  mg: 1000,
  µg: 1000000,
  mcg: 1000000,
  ug: 1000000,
};

// OFF ships several `*_100g` fields that are scores/estimates, not nutrients.
// They clutter the "add as alias" list and should never be offered, so skip them.
const OFF_NON_NUTRIENT_KEYS = new Set([
  'nova-group',
  'nutrition-score-fr',
  'nutrition-score-uk',
  'fruits-vegetables-nuts',
  'fruits-vegetables-nuts-estimate',
  'fruits-vegetables-nuts-estimate-from-ingredients',
  'fruits-vegetables-legumes-estimate-from-ingredients',
  'carbon-footprint',
  'carbon-footprint-from-known-ingredients',
]);

function extractOffProviderNutrients(
  nutriments: Record<string, unknown>,
  scale: number
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(nutriments)) {
    if (!key.endsWith('_100g')) continue;
    const value = nutriments[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const base = key.slice(0, -'_100g'.length);
    if (OFF_NON_NUTRIENT_KEYS.has(base)) continue;
    const unit = String(nutriments[`${base}_unit`] || '').toLowerCase();
    const factor = GRAMS_TO_UNIT[unit] ?? 1;
    // OFF keys are lowercase hyphenated (e.g. "vitamin-a"); use the readable
    // spaced label as the provider field name.
    const name = base.replace(/-/g, ' ').trim();
    if (!name) continue;
    out[name] = Math.round(value * factor * scale * 1000) / 1000;
  }
  return out;
}

function mapOpenFoodFactsProduct(
  product: OffProduct,
  { autoScale = true, language = 'en' } = {}
) {
  const nutriments = product.nutriments || {};
  const getNutrient = (key: string): number => {
    const val = nutriments[key];
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return parseFloat(val) || 0;
    return 0;
  };
  const servingSize = autoScale
    ? product.serving_quantity && product.serving_quantity > 0
      ? product.serving_quantity
      : 100
    : 100;
  const scale = servingSize / 100;
  const defaultVariant = {
    serving_size: servingSize,
    serving_unit: 'g',
    calories: Math.round(getNutrient('energy-kcal_100g') * scale),
    protein: Math.round(getNutrient('proteins_100g') * scale * 10) / 10,
    carbs: Math.round(getNutrient('carbohydrates_100g') * scale * 10) / 10,
    fat: Math.round(getNutrient('fat_100g') * scale * 10) / 10,
    saturated_fat:
      Math.round(getNutrient('saturated-fat_100g') * scale * 10) / 10,
    sodium: nutriments['sodium_100g']
      ? Math.round(getNutrient('sodium_100g') * 1000 * scale)
      : 0,
    dietary_fiber: Math.round(getNutrient('fiber_100g') * scale * 10) / 10,
    sugars: Math.round(getNutrient('sugars_100g') * scale * 10) / 10,
    polyunsaturated_fat:
      Math.round(getNutrient('polyunsaturated-fat_100g') * scale * 10) / 10,
    monounsaturated_fat:
      Math.round(getNutrient('monounsaturated-fat_100g') * scale * 10) / 10,
    trans_fat: Math.round(getNutrient('trans-fat_100g') * scale * 10) / 10,
    cholesterol: nutriments['cholesterol_100g']
      ? Math.round(getNutrient('cholesterol_100g') * 1000 * scale)
      : 0,
    potassium: nutriments['potassium_100g']
      ? Math.round(getNutrient('potassium_100g') * 1000 * scale)
      : 0,
    vitamin_a: nutriments['vitamin-a_100g']
      ? Math.round(getNutrient('vitamin-a_100g') * 1000000 * scale)
      : 0,
    vitamin_c: nutriments['vitamin-c_100g']
      ? Math.round(getNutrient('vitamin-c_100g') * 1000 * scale * 10) / 10
      : 0,
    calcium: nutriments['calcium_100g']
      ? Math.round(getNutrient('calcium_100g') * 1000 * scale)
      : 0,
    iron: nutriments['iron_100g']
      ? Math.round(getNutrient('iron_100g') * 1000 * scale * 10) / 10
      : 0,
    provider_nutrients: extractOffProviderNutrients(nutriments, scale),
    is_default: true,
  };
  // Language fallback priority:
  // 1. product_name_${language}
  // 2. product_name_en
  // 3. product_name (default/original)
  const name =
    product[`product_name_${language}`] ||
    product.product_name_en ||
    product.product_name;
  return {
    name,
    brand: product.brands?.split(',')[0]?.trim() || '',
    barcode: normalizeBarcode(product.code),
    provider_external_id: product.code,
    provider_type: 'openfoodfacts',
    is_custom: false,
    default_variant: {
      ...defaultVariant,
      allergens: normalizeAllergenTags(product.allergens_tags),
      traces: normalizeAllergenTags(product.traces_tags),
    },
  };
}
export { searchOpenFoodFacts };
export { searchOpenFoodFactsByBarcodeFields };
export { mapOpenFoodFactsProduct };
export default {
  searchOpenFoodFacts,
  searchOpenFoodFactsByBarcodeFields,
  mapOpenFoodFactsProduct,
};
