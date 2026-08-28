import { log } from '../config/logging.js';
import preferenceService from './preferenceService.js';
import externalProviderRepository from '../models/externalProviderRepository.js';
import {
  searchProviderFoods,
  type ProviderType,
} from './externalFoodSearchService.js';
import { VALID_PROVIDER_TYPES } from '../constants/foodProviders.js';

/**
 * The external half of the food-lookup cascade: the user's configured food
 * providers in their preferred order, then free OpenFoodFacts.
 *
 * Extracted so the chatbot and the food-photo matcher share one implementation.
 * `prompts/chatbot-full-food.md` makes it policy that verified provider data
 * beats an AI guess, and the photo flow was inverting that — inventing
 * nutrition for ingredients that OpenFoodFacts already knows.
 *
 * The internal-database step is deliberately NOT here. The chatbot searches one
 * name at a time, while the photo matcher resolves every detected ingredient in
 * a single batched query (`findFoodMatchCandidates`); forcing those into one
 * shape would make the batched path worse. Both call this only once their own
 * internal lookup has come up empty.
 */

// Exercise/health providers are excluded; food only.
const FOOD_PROVIDER_TYPES = [...VALID_PROVIDER_TYPES];

export interface ProviderLookupTarget {
  id?: string;
  provider_type: string;
  provider_name: string;
}

/**
 * Providers to try, in order: the user's active food providers (their chosen
 * default first), with OpenFoodFacts appended as the free fallback.
 *
 * Resolved once per request rather than per ingredient — a photo with six
 * ingredients would otherwise re-read preferences six times.
 */
export async function resolveFoodProviderOrder(
  userId: string,
  providerType?: string
): Promise<ProviderLookupTarget[]> {
  if (providerType) {
    if (providerType === 'openfoodfacts') {
      return [
        { provider_type: 'openfoodfacts', provider_name: 'OpenFoodFacts' },
      ];
    }
    const rows = await externalProviderRepository.getActiveProvidersByTypes(
      userId,
      [providerType]
    );
    if (rows.length > 0) return [rows[0]];
    // Explicitly requested but unconfigured: the per-provider search below
    // fails (no credentials) and the caller falls through to its own fallback.
    return [{ provider_type: providerType, provider_name: providerType }];
  }

  const targets: ProviderLookupTarget[] =
    await externalProviderRepository.getActiveProvidersByTypes(
      userId,
      FOOD_PROVIDER_TYPES
    );
  if (!targets.some((p) => p.provider_type === 'openfoodfacts')) {
    targets.push({
      provider_type: 'openfoodfacts',
      provider_name: 'OpenFoodFacts',
    });
  }

  // Honour the user's chosen default food provider. Without this the order
  // comes from sort_order, which is NULL for most installs and falls back to
  // created_at DESC — so the most recently added provider silently won every
  // lookup and the setting picked in the UI did nothing.
  const defaultProviderId = (
    await preferenceService.getUserPreferences(userId, userId)
  )?.default_food_data_provider_id;
  if (defaultProviderId) {
    const defaultIndex = targets.findIndex((p) => p.id === defaultProviderId);
    if (defaultIndex > 0) {
      const [preferred] = targets.splice(defaultIndex, 1);
      targets.unshift(preferred);
    }
  }
  return targets;
}

/**
 * Ranks provider results so plain whole foods beat branded products.
 *
 * Providers return branded items ("EGG (SNICKERS)", "BANANA (BETTER'N PEANUT
 * BUTTER)") ahead of the plain whole food a user almost always means, and small
 * models just take the first result. Stable within each tier, so the provider's
 * own relevance order is otherwise preserved.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rankProviderMatches(foods: any[], query: string): any[] {
  const q = query.trim().toLowerCase();
  const qStem = q.replace(/s$/, '');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const score = (f: any): number => {
    const name = String(f?.name ?? '').toLowerCase();
    const branded = Boolean(f?.brand && String(f.brand).trim());
    const firstSegment = name.split(',')[0].trim();
    let s = branded ? 0 : 100; // whole foods first
    if (firstSegment === q || firstSegment === qStem) s += 20;
    else if (firstSegment.startsWith(qStem)) s += 10;
    else if (name.includes(q)) s += 5;
    return s;
  };
  return foods
    .map((f, i) => ({ f, i, s: score(f) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.f);
}

/**
 * Sub-gram units a provider sometimes reports as the serving. Quoting a food
 * "per 1 mg" is useless and scales absurdly, so these are kept out of the
 * plausible pool. Exported because the chat tool filters on the same set.
 */
export const IMPLAUSIBLE_SERVING_UNITS = new Set(['mg', 'mcg', 'µg', 'ug']);

/**
 * Picks the variant to quote for a provider food: a sane serving unit and a
 * positive size, keeping the provider's own default only as a tiebreak within
 * that set. Shared with the chatbot so both quote the same serving.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pickBestVariant(food: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variants: any[] = (
    food?.variants?.length ? food.variants : [food?.default_variant]
  ).filter(Boolean);
  if (variants.length === 0) return food?.default_variant ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isPlausible = (v: any) =>
    Number(v.serving_size) > 0 &&
    !IMPLAUSIBLE_SERVING_UNITS.has(String(v.serving_unit || '').toLowerCase());
  const pool = variants.filter(isPlausible);
  const chosen = pool.length > 0 ? pool : variants;
  return chosen.find((v) => v.is_default) ?? chosen[0];
}

export interface ProviderLookupResult {
  source: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  food: any | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  alternatives?: any[];
}

/**
 * Searches the given providers in order and returns the first hit, ranked.
 * A provider that throws is logged and skipped — one misconfigured or
 * rate-limited provider must never fail the whole lookup.
 */
export async function lookupFoodFromProviders(
  userId: string,
  foodName: string,
  targets: ProviderLookupTarget[]
): Promise<ProviderLookupResult> {
  for (const provider of targets) {
    try {
      log(
        'debug',
        `[foodProviderLookup] querying ${provider.provider_name} (${provider.provider_type}) for "${foodName}"`
      );
      const result = await searchProviderFoods(
        userId,
        provider.provider_type as ProviderType,
        foodName,
        { providerId: provider.id }
      );
      if (result.foods.length > 0) {
        const ranked = rankProviderMatches(result.foods, foodName);
        return {
          source: provider.provider_type,
          food: ranked[0],
          alternatives: ranked.slice(1),
        };
      }
    } catch (error) {
      log(
        'warn',
        `[foodProviderLookup] provider ${provider.provider_name} failed:`,
        error
      );
    }
  }
  return { source: 'ai_estimate', food: null };
}

export default {
  resolveFoodProviderOrder,
  pickBestVariant,
  rankProviderMatches,
  lookupFoodFromProviders,
};
