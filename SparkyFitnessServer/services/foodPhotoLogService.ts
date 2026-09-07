import type { PoolClient } from 'pg';
import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import { createFoodWithClient } from '../models/food.js';
import {
  createFoodEntryMealWithClient,
  resolveMealTypeIdWithClient,
} from '../models/foodEntryMealRepository.js';
import { bulkCreateFoodEntriesWithClient } from '../models/foodEntry.js';
import { buildFoodEntrySnapshot } from '../utils/foodEntrySnapshot.js';
import type {
  FoodPhotoLogErrorCode,
  FoodPhotoLogRequest,
  FoodPhotoLogResponse,
} from '@workspace/shared';
import type { FoodEntryInput } from '../types/nutrition.js';

/**
 * Logs a reviewed AI photo estimate to the diary in ONE transaction.
 *
 * The alternative — the client making N `POST /api/foods` calls followed by a
 * `POST /api/food-entry-meals` — fails badly in the middle: a network drop
 * after food 3 of 5 leaves three orphaned foods in the user's account and no
 * diary entry, with nothing to clean them up.
 *
 * Note this deliberately does NOT reuse `foodEntryService.createFoodEntryMeal`.
 * That path acquires a fresh client for the parent row, another per component
 * inside `buildLeafFoodEntries`, and another for the bulk insert. Foods created
 * here are uncommitted, so those other connections cannot see them, and their
 * implicit commits would defeat the rollback. Everything below runs on one
 * client.
 */

export class PhotoLogError extends Error {
  code: FoodPhotoLogErrorCode;
  constructor(code: FoodPhotoLogErrorCode, message: string) {
    super(message);
    this.name = 'PhotoLogError';
    this.code = code;
  }
}

interface ResolvedVariantRow {
  food_id: string;
  food_name: string;
  brand: string | null;
  variant_id: string;
  serving_size: number | string | null;
  serving_unit: string | null;
  calories: number | string | null;
  protein: number | string | null;
  carbs: number | string | null;
  fat: number | string | null;
  saturated_fat: number | string | null;
  polyunsaturated_fat: number | string | null;
  monounsaturated_fat: number | string | null;
  trans_fat: number | string | null;
  cholesterol: number | string | null;
  sodium: number | string | null;
  potassium: number | string | null;
  dietary_fiber: number | string | null;
  sugars: number | string | null;
  vitamin_a: number | string | null;
  vitamin_c: number | string | null;
  calcium: number | string | null;
  iron: number | string | null;
  glycemic_index: string | null;
  custom_nutrients: Record<string, unknown> | null;
}

/**
 * Loads every referenced (food, variant) pair in ONE query rather than looping
 * `getFoodById` / `getFoodVariantById` per item. RLS on the client scopes the
 * rows, so a food the user cannot see simply does not come back and is
 * reported as not found.
 */
async function loadExistingVariants(
  client: PoolClient,
  variantIds: string[]
): Promise<Map<string, ResolvedVariantRow>> {
  if (variantIds.length === 0) return new Map();
  const result = await client.query(
    `SELECT
       f.id   AS food_id,
       f.name AS food_name,
       f.brand,
       fv.id  AS variant_id,
       fv.serving_size, fv.serving_unit,
       fv.calories, fv.protein, fv.carbs, fv.fat,
       fv.saturated_fat, fv.polyunsaturated_fat, fv.monounsaturated_fat,
       fv.trans_fat, fv.cholesterol, fv.sodium, fv.potassium,
       fv.dietary_fiber, fv.sugars, fv.vitamin_a, fv.vitamin_c,
       fv.calcium, fv.iron, fv.glycemic_index, fv.custom_nutrients
     FROM food_variants fv
     JOIN foods f ON f.id = fv.food_id
     WHERE fv.id = ANY($1::uuid[])`,
    [variantIds]
  );
  return new Map(
    (result.rows as ResolvedVariantRow[]).map((row) => [row.variant_id, row])
  );
}

/**
 * Nutrition values a client sends for an unmatched ingredient are ALWAYS per
 * 100 g — see `foodPhotoLogNewFoodSchema` and the branded `Per100gMacros` type
 * in `@workspace/shared`. This only forwards them; it must never rescale.
 */
function buildNewFoodInput(
  targetUserId: string,
  food: Extract<FoodPhotoLogRequest['items'][number], { source: 'new' }>['food']
) {
  return {
    ...food,
    user_id: targetUserId,
    is_custom: true,
    // Deliberately a normal, visible food — NOT a quick food.
    //
    // Quick foods are excluded from search, favorites, recents and, crucially,
    // from `findFoodMatchCandidates`. Hiding an ingredient would mean the next
    // photo of the same dish could never match it, so every biryani would mint
    // another "chicken" and the library would fill with invisible duplicates
    // the user could not merge or reuse.
    //
    // Visible foods close the loop instead: the first photo creates "chicken
    // thigh", the second matches it, and a correction the user makes once
    // applies to every later estimate.
    provider_type: 'food_photo_estimate',
    shared_with_public: false,
    // A food built from a provider match is imported data, not a guess. Only
    // rows still carrying the model's own numbers arrive with ai_confidence,
    // and only those should be marked as estimates.
    source: food.ai_confidence ? 'ai_estimate' : 'imported',
    is_default: true,
  };
}

async function createPhotoLoggedMeal(
  targetUserId: string,
  actingUserId: string,
  payload: FoodPhotoLogRequest
): Promise<FoodPhotoLogResponse> {
  const client = await getClient(targetUserId, actingUserId);
  const createdFoodIds: string[] = [];
  try {
    await client.query('BEGIN');

    let mealTypeId: string | null | undefined;
    try {
      mealTypeId = await resolveMealTypeIdWithClient(
        client,
        payload.meal_type_id,
        payload.meal_type
      );
    } catch (error) {
      throw new PhotoLogError(
        'INVALID_MEAL_TYPE',
        error instanceof Error ? error.message : String(error)
      );
    }
    if (!mealTypeId) {
      throw new PhotoLogError(
        'INVALID_MEAL_TYPE',
        `Invalid meal type: ${payload.meal_type}`
      );
    }

    // Validate every reused food up front, before creating anything, so a bad
    // id fails without having written a row.
    const existingVariantIds = payload.items
      .filter((item) => item.source === 'existing')
      .map((item) => item.variant_id);
    const existingByVariant = await loadExistingVariants(
      client,
      existingVariantIds
    );
    for (const item of payload.items) {
      if (item.source !== 'existing') continue;
      const row = existingByVariant.get(item.variant_id);
      if (!row) {
        throw new PhotoLogError(
          'VARIANT_NOT_FOUND',
          `Food variant ${item.variant_id} was not found.`
        );
      }
      if (row.food_id !== item.food_id) {
        // The variant exists but belongs to a different food. Logging it would
        // attach one food's nutrition to another food's diary row.
        throw new PhotoLogError(
          'FOOD_NOT_FOUND',
          `Food variant ${item.variant_id} does not belong to food ${item.food_id}.`
        );
      }
    }

    // `items` describes the whole dish. When the user says it makes 2000 ml in
    // 250 ml servings and they had one, every component is logged at an eighth.
    // This is the same uniform multiplier a template-backed meal uses
    // (foodEntryService), and an ad-hoc parent applies no multiplier of its own
    // (see the note below), so the portion has to be folded into the component
    // quantities here. The fields default to the plate as shown, all eaten.
    const portionFactor =
      payload.consumed_quantity /
      (payload.serving_size * payload.total_servings);

    let foodEntryMealId: string | null = null;
    if (payload.mode === 'grouped') {
      const parent = await createFoodEntryMealWithClient(
        client,
        {
          user_id: targetUserId,
          meal_template_id: null,
          meal_type_id: mealTypeId,
          meal_type: payload.meal_type,
          entry_date: payload.entry_date,
          entry_time: payload.entry_time,
          name: payload.name,
          description: payload.description,
          // Ad-hoc logged meals do not scale their components by the parent
          // quantity (only template-backed ones do), so the real amounts live
          // on each component. The parent quantity is what was eaten purely so
          // the diary row and the meal editor say so — nothing multiplies by it.
          quantity: payload.consumed_quantity,
          unit: payload.serving_unit,
          legacy_serving_unit_math: false,
        },
        actingUserId
      );
      foodEntryMealId = parent.id;
    }

    const entries: FoodEntryInput[] = [];
    for (const item of payload.items) {
      if (item.source === 'existing') {
        const row = existingByVariant.get(item.variant_id)!;
        entries.push({
          user_id: targetUserId,
          created_by_user_id: actingUserId,
          food_id: row.food_id,
          variant_id: row.variant_id,
          meal_type_id: mealTypeId,
          quantity: item.quantity * portionFactor,
          unit: item.unit,
          entry_date: payload.entry_date,
          entry_time: payload.entry_time,
          food_entry_meal_id: foodEntryMealId,
          ...buildFoodEntrySnapshot(
            { name: row.food_name, brand: row.brand },
            row
          ),
        } as FoodEntryInput);
        continue;
      }

      const created = await createFoodWithClient(
        client,
        buildNewFoodInput(targetUserId, item.food)
      );
      createdFoodIds.push(created.id);
      entries.push({
        user_id: targetUserId,
        created_by_user_id: actingUserId,
        food_id: created.id,
        variant_id: created.default_variant.id,
        meal_type_id: mealTypeId,
        // The created food stores per-100 g nutrition and is the whole
        // ingredient; only the amount eaten is a portion of it.
        quantity: item.quantity * portionFactor,
        unit: item.unit,
        entry_date: payload.entry_date,
        entry_time: payload.entry_time,
        food_entry_meal_id: foodEntryMealId,
        ...buildFoodEntrySnapshot(
          { name: item.food.name, brand: item.food.brand },
          {
            ...item.food,
            glycemic_index: null,
            custom_nutrients: null,
          }
        ),
      } as FoodEntryInput);
    }

    const created = await bulkCreateFoodEntriesWithClient(client, entries);
    await client.query('COMMIT');

    return {
      mode: payload.mode,
      food_entry_meal_id: foodEntryMealId,
      // Filled in by the route after COMMIT — see the note there.
      meal_template_id: null,
      food_entry_ids: created.map((row: { id: string }) => row.id),
      created_food_ids: createdFoodIds,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      log(
        'error',
        '[foodPhotoLogService] ROLLBACK failed after a photo-log error',
        rollbackError
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

export { createPhotoLoggedMeal };
export default { createPhotoLoggedMeal };
