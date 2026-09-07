import { randomUUID } from 'node:crypto';
import { log } from '../config/logging.js';
import {
  findFoodMatchCandidates,
  type FoodMatchCandidateRow,
} from '../models/food.js';
import {
  resolveFoodProviderOrder,
  lookupFoodFromProviders,
  pickBestVariant,
  type ProviderFoodItem,
} from './foodProviderLookupService.js';
import { boundedMap } from '../utils/boundedMap.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  scoreFoodMatch,
  hasUsableMacros,
  scaleVariantToGrams,
  roundedMacros,
  getConversionFactor,
  todayInZone,
  MATCH_MIN_SCORE,
  MATCH_PRESELECT_SCORE,
  type FoodPhotoEstimateItem,
  type FoodPhotoEstimateMatch,
  type FoodPhotoEstimateResponse,
} from '@workspace/shared';

/**
 * Attaches food-database matches to an AI photo estimate.
 *
 * Modelled on how MacroFactor describes its AI: prefer real, stored nutrition
 * over numbers a language model invented. The difference here is that this
 * ATTACHES the match instead of substituting it, for two reasons:
 *
 *  1. A shipped mobile build reads `items[].calories_kcal` and `totals`.
 *     Rewriting those server-side would change what an app that was never
 *     updated displays. Attaching is provably invisible to an old client.
 *  2. "Chicken Thigh" in the user's library is not necessarily the chicken
 *     thigh in this photo. A silent swap is a wrong answer with no signal; a
 *     visible chip is a right answer one tap away.
 */

const MAX_ALTERNATES = 2;
/**
 * How many provider lookups may be in flight at once. Kept low deliberately:
 * this runs after an already-slow vision call, and nothing rate-limits
 * OpenFoodFacts on the server.
 */
const PROVIDER_LOOKUP_CONCURRENCY = 3;

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Whole days between a diary entry's calendar day and the user's today.
 *
 * `food_entries.entry_date` is a DATE — a calendar day, not an instant — so
 * both sides are compared as calendar days. `today` comes from the user's own
 * timezone: someone in UTC+13 logging at 09:00 local is already on tomorrow's
 * UTC date, and deriving "today" from UTC would age that entry by a day and
 * withhold the recency boost.
 *
 * Both days are pinned to midday before subtracting so DST cannot shift the
 * count.
 */
function daysSince(lastUsed: string | null, today: string): number | null {
  if (!lastUsed) return null;
  const day = String(lastUsed).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const then = Date.parse(`${day}T12:00:00Z`);
  const now = Date.parse(`${today}T12:00:00Z`);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.round((now - then) / 86_400_000));
}

function toMatch(
  row: FoodMatchCandidateRow,
  score: number,
  source: FoodPhotoEstimateMatch['match_source'],
  userId: string,
  estimatedGrams: number
): FoodPhotoEstimateMatch {
  const servingSize = toNumber(row.serving_size);
  const scaledPortion = scaleVariantToGrams(
    {
      calories_kcal: toNumber(row.calories),
      protein_g: toNumber(row.protein),
      carbs_g: toNumber(row.carbs),
      fat_g: toNumber(row.fat),
      fiber_g: toNumber(row.dietary_fiber),
      sugar_g: toNumber(row.sugars),
      saturated_fat_g: toNumber(row.saturated_fat),
      polyunsaturated_fat_g: toNumber(row.polyunsaturated_fat),
      monounsaturated_fat_g: toNumber(row.monounsaturated_fat),
      trans_fat_g: toNumber(row.trans_fat),
      cholesterol_mg: toNumber(row.cholesterol),
      sodium_mg: toNumber(row.sodium),
      potassium_mg: toNumber(row.potassium),
      calcium_mg: toNumber(row.calcium),
      iron_mg: toNumber(row.iron),
      vitamin_a_mcg: toNumber(row.vitamin_a),
      vitamin_c_mg: toNumber(row.vitamin_c),
    },
    servingSize,
    row.serving_unit,
    estimatedGrams,
    getConversionFactor
  );

  return {
    food_id: row.food_id,
    variant_id: row.variant_id,
    food_name: row.food_name,
    brand: row.brand,
    serving_size: servingSize,
    serving_unit: row.serving_unit,
    match_score: Math.round(score * 1000) / 1000,
    match_source: source,
    is_own_food: row.user_id === userId,
    // A variant measured in cups or slices cannot be gram-scaled, so the
    // client hides the swap rather than inventing a number.
    gram_convertible: scaledPortion !== null,
    scaled: scaledPortion ? roundedMacros(scaledPortion) : null,
  };
}

/**
 * Builds a match from an external provider hit.
 *
 * There is no `food_id`: the food does not exist locally, so applying this
 * match means creating it from the provider's nutrition rather than the AI's
 * guess. `provider_type` / `provider_external_id` ride along as provenance.
 */
function toProviderMatch(
  food: ProviderFoodItem,
  providerSource: string,
  estimatedGrams: number
): FoodPhotoEstimateMatch | null {
  const variant = pickBestVariant(food);
  if (!variant) return null;

  const servingSize = toNumber(variant.serving_size);
  const scaledPortion = scaleVariantToGrams(
    {
      calories_kcal: toNumber(variant.calories),
      protein_g: toNumber(variant.protein),
      carbs_g: toNumber(variant.carbs),
      fat_g: toNumber(variant.fat),
      fiber_g: toNumber(variant.dietary_fiber ?? variant.fiber),
      sugar_g: toNumber(variant.sugars ?? variant.sugar),
      saturated_fat_g: toNumber(variant.saturated_fat),
      polyunsaturated_fat_g: toNumber(variant.polyunsaturated_fat),
      monounsaturated_fat_g: toNumber(variant.monounsaturated_fat),
      trans_fat_g: toNumber(variant.trans_fat),
      cholesterol_mg: toNumber(variant.cholesterol),
      sodium_mg: toNumber(variant.sodium),
      potassium_mg: toNumber(variant.potassium),
      calcium_mg: toNumber(variant.calcium),
      iron_mg: toNumber(variant.iron),
      vitamin_a_mcg: toNumber(variant.vitamin_a),
      vitamin_c_mg: toNumber(variant.vitamin_c),
    },
    servingSize,
    String(variant.serving_unit ?? ''),
    estimatedGrams,
    getConversionFactor
  );
  // A provider serving measured in cups or pieces cannot be gram-scaled, and
  // an unscalable number is worse than the AI estimate it would replace.
  if (!scaledPortion) return null;

  return {
    provider_type: providerSource,
    provider_external_id: food?.provider_external_id
      ? String(food.provider_external_id)
      : undefined,
    food_name: String(food?.name ?? ''),
    brand: food?.brand ? String(food.brand) : null,
    serving_size: servingSize,
    serving_unit: String(variant.serving_unit ?? ''),
    // Provider data is verified, so it outranks any name-similarity score.
    match_score: 1,
    match_source: 'provider',
    is_own_food: false,
    gram_convertible: true,
    scaled: roundedMacros(scaledPortion),
  };
}

export interface MatchableItem {
  item_id?: string;
  name: string;
  canonical_name?: string;
  estimated_grams: number;
}

export interface ItemMatchResult {
  item_id: string;
  match: FoodPhotoEstimateMatch | null;
  alternates: FoodPhotoEstimateMatch[];
  preselect_match: boolean;
}

/**
 * Scores every item's candidates and returns the best plus up to two
 * runner-ups. Items keep the `item_id` they arrive with, or get a fresh one.
 */
async function matchItems(
  userId: string,
  items: MatchableItem[]
): Promise<Map<string, ItemMatchResult>> {
  const results = new Map<string, ItemMatchResult>();
  if (items.length === 0) return results;

  const withIds = items.map((item) => ({
    ...item,
    resolvedId: item.item_id ?? randomUUID(),
    // The model's canonical_name is the searchable form; fall back to the
    // display name when a provider omitted it.
    term: (item.canonical_name || item.name || '').trim(),
  }));

  // Resolved once for the whole plate: recency is measured against the user's
  // calendar day, not the server's UTC date.
  const today = todayInZone(await loadUserTimezone(userId));

  let candidates: Map<string, FoodMatchCandidateRow[]>;
  try {
    candidates = await findFoodMatchCandidates(
      userId,
      withIds.map((item) => ({ key: item.resolvedId, term: item.term }))
    );
  } catch (error) {
    // Matching is an enhancement. A failure here must never cost the user
    // their estimate, so degrade to "no matches" and carry on.
    log(
      'warn',
      `[foodPhotoMatchService] candidate lookup failed; returning unmatched items: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return results;
  }

  for (const item of withIds) {
    const rows = candidates.get(item.resolvedId) ?? [];
    const scored = rows
      .map((row) => {
        const { score, source } = scoreFoodMatch({
          candidateName: row.food_name,
          candidateBrand: row.brand,
          queryName: item.term,
          isOwnFood: row.user_id === userId,
          daysSinceLastUsed: daysSince(row.last_used, today),
        });
        return { row, score, source };
      })
      .filter((entry) => entry.score >= MATCH_MIN_SCORE)
      .sort((a, b) => b.score - a.score);

    const [best, ...rest] = scored;
    const bestMatch = best
      ? toMatch(best.row, best.score, best.source, userId, item.estimated_grams)
      : null;
    results.set(item.resolvedId, {
      item_id: item.resolvedId,
      match: bestMatch,
      alternates: rest
        .slice(0, MAX_ALTERNATES)
        .map((entry) =>
          toMatch(
            entry.row,
            entry.score,
            entry.source,
            userId,
            item.estimated_grams
          )
        ),
      // Only preselect a confident match that actually has scaled nutrition;
      // anything weaker stays an explicit tap.
      preselect_match: Boolean(
        best &&
        best.score >= MATCH_PRESELECT_SCORE &&
        best.source === 'exact_name' &&
        // A variant measured in cups or slices has no gram-scaled nutrition,
        // so preselecting it would apply a match the client cannot render.
        bestMatch?.gram_convertible &&
        // Scaled-but-empty is worse than no match: applying it replaces the
        // model's estimate with zeros, and a food saved from that row then
        // matches the next photo, spreading the zeros.
        hasUsableMacros(bestMatch.scaled)
      ),
    });
  }

  // Anything the user's own foods did not cover falls through to the provider
  // cascade — the same order and ranking the chatbot uses. This is the policy
  // in prompts/chatbot-full-food.md: verified data beats an AI guess.
  const unmatched = withIds.filter(
    (item) => !results.get(item.resolvedId)?.match && item.term.length > 0
  );
  if (unmatched.length > 0) {
    try {
      const providers = await resolveFoodProviderOrder(userId);
      await boundedMap(unmatched, PROVIDER_LOOKUP_CONCURRENCY, async (item) => {
        try {
          const hit = await lookupFoodFromProviders(
            userId,
            item.term,
            providers
          );
          if (!hit.food) return;
          const match = toProviderMatch(
            hit.food,
            hit.source,
            item.estimated_grams
          );
          if (!match) return;
          const existing = results.get(item.resolvedId);
          if (existing) {
            existing.match = match;
            // Verified provider nutrition is applied on open — but only when it
            // is actually about this food and actually carries numbers.
            //
            // `match_score` stays 1 because provider data outranks an AI guess
            // for ORDERING (prompts/chatbot-full-food.md). Preselecting is a
            // different question: it overwrites what the user is reviewing, so
            // it needs the same name-similarity bar a local match must clear.
            // Without it a search for "idiyappam (string hoppers)" auto-applies
            // a product called "Rock Hopper" and zeroes a correct estimate.
            const { score: nameScore } = scoreFoodMatch({
              candidateName: match.food_name,
              candidateBrand: match.brand,
              queryName: item.term,
              isOwnFood: false,
            });
            existing.preselect_match =
              nameScore >= MATCH_PRESELECT_SCORE &&
              hasUsableMacros(match.scaled);
          }
        } catch (error) {
          // One bad provider must not cost the user the whole estimate.
          log(
            'warn',
            `[foodPhotoMatchService] provider lookup failed for "${item.term}": ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      });
    } catch (error) {
      log(
        'warn',
        `[foodPhotoMatchService] could not resolve provider order; keeping AI estimates: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return results;
}

/**
 * Enriches a parsed estimate in place-of-copy, leaving every existing field —
 * including `items[].calories_kcal` and `totals` — exactly as the model
 * produced it.
 */
async function attachFoodMatches(
  userId: string,
  estimate: FoodPhotoEstimateResponse
): Promise<FoodPhotoEstimateResponse> {
  const items = estimate.items ?? [];
  if (items.length === 0) return estimate;

  const withIds: (FoodPhotoEstimateItem & { item_id: string })[] = items.map(
    (item) => ({ ...item, item_id: item.item_id ?? randomUUID() })
  );

  const matches = await matchItems(
    userId,
    withIds.map((item) => ({
      item_id: item.item_id,
      name: item.name,
      canonical_name: item.canonical_name,
      estimated_grams: item.estimated_grams,
    }))
  );

  let matchedCount = 0;
  let ownFoodCount = 0;
  const enriched = withIds.map((item) => {
    const result = matches.get(item.item_id);
    if (!result?.match) return item;
    matchedCount += 1;
    if (result.match.is_own_food) ownFoodCount += 1;
    return {
      ...item,
      match: result.match,
      alternates: result.alternates,
      preselect_match: result.preselect_match,
    };
  });

  return {
    ...estimate,
    items: enriched,
    match_summary: {
      item_count: enriched.length,
      matched_count: matchedCount,
      own_food_count: ownFoodCount,
    },
  };
}

export { attachFoodMatches, matchItems };
export default { attachFoodMatches, matchItems };
