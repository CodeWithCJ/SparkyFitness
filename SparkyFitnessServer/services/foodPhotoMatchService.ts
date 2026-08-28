import { randomUUID } from 'node:crypto';
import { log } from '../config/logging.js';
import {
  findFoodMatchCandidates,
  type FoodMatchCandidateRow,
} from '../models/food.js';
import {
  scoreFoodMatch,
  scaleVariantToGrams,
  unbrandMacros,
  roundMacros,
  getConversionFactor,
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

function toNumber(value: number | string | null): number {
  if (value === null) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Whole days between a diary entry's calendar day and today.
 *
 * `food_entries.entry_date` is a DATE — a calendar day, not an instant. Parsing
 * it as a UTC timestamp and dividing elapsed milliseconds makes the answer flip
 * by one either side of midnight UTC, which would hand out or withhold the
 * recency bonus depending on the hour the estimate ran. Both sides are pinned
 * to midday UTC so the subtraction is a day count and DST cannot shift it.
 */
function daysSince(lastUsed: string | null): number | null {
  if (!lastUsed) return null;
  const day = String(lastUsed).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const then = Date.parse(`${day}T12:00:00Z`);
  if (!Number.isFinite(then)) return null;
  const today = new Date();
  const todayNoon = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
    12
  );
  return Math.max(0, Math.round((todayNoon - then) / 86_400_000));
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
    scaled: scaledPortion ? unbrandMacros(roundMacros(scaledPortion)) : null,
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
          daysSinceLastUsed: daysSince(row.last_used),
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
        bestMatch?.gram_convertible
      ),
    });
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
