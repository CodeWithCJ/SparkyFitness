import type { CreateFoodEntryPayload } from '../services/api/foodEntriesApi';
import type { FoodItem } from '../types/foods';

import { parseDecimalInput } from './numericInput';

/**
 * Upper bound on how many foods one multi-add batch may log. Keeps the
 * per-row POST fan-out (see useAddFoodEntriesBatch) and the review list at a
 * size the diary API and the UI can reason about.
 */
export const MULTI_ADD_MAX_ITEMS = 50;

/**
 * Serving-bearing subset shared by every variant shape a draft can carry.
 * An id-less serving IS the food's default basis — conversion falls back
 * to the default variant for nutrition and the linked-entry id in that
 * case, because only an id-bearing choice can be logged as a linked
 * variant.
 */
export interface DraftVariantServing {
  id?: string;
  serving_size: number;
  serving_unit: string;
}

/**
 * Stable identity for a selectable food. The same food surfaces in several
 * landing sections (Recently Logged / Top / Favorites); keying on
 * food id + default variant id collapses those duplicates into one basket
 * row, while different variants of the same food stay separately selectable.
 */
export function multiAddKeyForFood(food: FoodItem): string {
  const variantId = food.default_variant?.id;
  return `${food.id}:${variantId ?? 'snapshot'}`;
}

/**
 * Initial quantity text for a new draft. Quantity in this feature is
 * denominated in the variant's serving unit (grams, ml, pieces) — NOT a
 * serving multiplier — matching FoodEntryAddScreen, which seeds its input
 * with the variant's serving size and where servings are counted as
 * quantity / serving size. A plain '1' here would log one GRAM of a 100 g
 * food while its row displays "100 g".
 */
export function initialDraftQuantityText(food: FoodItem): string {
  // Typed required on FoodDefaultVariant, but these objects arrive as raw
  // API JSON — guard the boundary rather than trust it.
  const servingSize = food.default_variant?.serving_size;
  return servingSize != null && Number.isFinite(servingSize)
    ? String(servingSize)
    : '1';
}

export interface MultiAddDraft {
  food: FoodItem;
  /**
   * Chosen serving basis snapshot, taken at selection time so conversion
   * never depends on the variants query still being cached at submit
   * time. An id-less snapshot means the default variant's basis.
   */
  variant?: DraftVariantServing;
  /**
   * Raw quantity text from the review row. Locale-tolerant ("1,5" and "1.5"
   * both parse) via parseDecimalInput; conversion rejects anything that does
   * not parse to a positive finite number.
   */
  quantityText: string;
  mealTypeId: string;
  /** Calendar-day string (YYYY-MM-DD) the entries are logged to. */
  entryDate: string;
}

export type MultiAddDraftConversion =
  | { status: 'ok'; key: string; payload: CreateFoodEntryPayload }
  | { status: 'invalid'; key: string; reason: 'quantity' };

const OPTIONAL_NUTRIENT_KEYS = [
  'saturated_fat',
  'trans_fat',
  'cholesterol',
  'sodium',
  'potassium',
  'dietary_fiber',
  'sugars',
  'vitamin_a',
  'vitamin_c',
  'calcium',
  'iron',
  'caffeine_mg',
  'water_ml',
  'alcohol_g',
] as const;

function snapshotNutrition(food: FoodItem): Partial<CreateFoodEntryPayload> {
  const variant = food.default_variant;
  const snapshot: Partial<CreateFoodEntryPayload> = {
    food_name: food.name,
    brand_name: food.brand ?? undefined,
    serving_size: variant.serving_size,
    serving_unit: variant.serving_unit,
    calories: variant.calories,
    protein: variant.protein,
    carbs: variant.carbs,
    fat: variant.fat,
  };
  for (const nutrientKey of OPTIONAL_NUTRIENT_KEYS) {
    const value = variant[nutrientKey];
    if (value !== undefined) {
      snapshot[nutrientKey] = value;
    }
  }
  if (variant.custom_nutrients != null) {
    snapshot.custom_nutrients = variant.custom_nutrients;
  }
  return snapshot;
}

/**
 * Converts one review-row draft into a single-entry create payload. Foods
 * with both a food id and a default-variant id log as linked entries; foods
 * without a linkable variant fall back to a standalone snapshot entry so the
 * diary still records nutrition at log time, matching the single-entry flow.
 */
export function convertDraftToPayload(
  draft: MultiAddDraft
): MultiAddDraftConversion {
  const { food } = draft;
  const key = multiAddKeyForFood(food);

  const quantity = parseDecimalInput(draft.quantityText);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { status: 'invalid', key, reason: 'quantity' };
  }

  // Id-less choice == default basis: only an id-bearing choice can be a
  // linked variant; the default carries full nutrition for snapshots.
  const variant = draft.variant?.id ? draft.variant : food.default_variant;
  const payload: CreateFoodEntryPayload = {
    meal_type_id: draft.mealTypeId,
    quantity,
    unit: variant.serving_unit,
    entry_date: draft.entryDate,
    entry_time: null,
    notes: null,
  };

  if (food.id && variant.id) {
    payload.food_id = food.id;
    payload.variant_id = variant.id;
  } else {
    Object.assign(payload, snapshotNutrition(food));
  }

  return { status: 'ok', key, payload };
}

export interface PartitionedMultiAddDrafts {
  ok: { key: string; payload: CreateFoodEntryPayload }[];
  invalid: { key: string; reason: 'quantity' }[];
}

/**
 * Converts a whole review list at once, preserving basket keys so callers can
 * map outcomes back onto rows (e.g. to remove confirmed successes).
 */
export function partitionDrafts(
  drafts: MultiAddDraft[]
): PartitionedMultiAddDrafts {
  const result: PartitionedMultiAddDrafts = { ok: [], invalid: [] };
  for (const draft of drafts) {
    const conversion = convertDraftToPayload(draft);
    if (conversion.status === 'ok') {
      result.ok.push({ key: conversion.key, payload: conversion.payload });
    } else {
      result.invalid.push({ key: conversion.key, reason: conversion.reason });
    }
  }
  return result;
}
