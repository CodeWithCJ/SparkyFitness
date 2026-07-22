import foodRepository from '../models/foodRepository.js';
import foodEntryMealRepository from '../models/foodEntryMealRepository.js';
import mealRepository from '../models/mealRepository.js';
import familyAccessRepository from '../models/familyAccessRepository.js';
import { log } from '../config/logging.js';
import mealTypeRepository from '../models/mealType.js';
import goalRepository from '../models/goalRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import reportRepository from '../models/reportRepository.js';
import { sanitizeCustomNutrients } from '../utils/foodUtils.js';

import Papa from 'papaparse';
import { isDayString } from '@workspace/shared';
import customNutrientService from './customNutrientService.js';
import express from 'express';
// Helper functions (already defined)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getGlycemicIndexValue(category: any) {
  switch (category) {
    case 'Very Low':
      return 10;
    case 'Low':
      return 30;
    case 'Medium':
      return 60;
    case 'High':
      return 80;
    case 'Very High':
      return 100;
    default:
      return null;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getGlycemicIndexCategory(value: any) {
  if (value === null) return 'None';
  if (value <= 20) return 'Very Low';
  if (value <= 50) return 'Low';
  if (value <= 70) return 'Medium';
  if (value <= 90) return 'High';
  return 'Very High';
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveMealTypeId(userId: any, mealTypeName: any) {
  if (!mealTypeName) return null;
  const types = await mealTypeRepository.getAllMealTypes(userId);
  const match = types.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (t: any) => t.name.toLowerCase() === mealTypeName.toLowerCase()
  );
  return match ? match.id : null;
}

// ── Diary CSV import ────────────────────────────────────────────────────────
//
// Bulk-creates diary log entries (food_entries), as distinct from the
// existing food-LIBRARY CSV import (foodCoreService.importFoodsInBulk /
// foodRepository.createFoodsInBulk), which only writes master-data foods and
// is untouched by this feature.
//
// Food resolution per row (see agent-docs plan "diary-csv-import"):
//   1. Name-only match within the caller-selected visibility scope (own
//      always included; family/public opt-in) — references the matched
//      food directly, never clones it, mirroring how normal diary logging
//      already stores another user's food_id for public/family foods.
//   2. Else a prior csv_import-tagged food from an earlier import.
//   3. Else auto-create a lightweight food+variant from the row's own
//      nutrient columns — but only if at least one nutrient is filled in;
//      otherwise the row is a per-row error (never a zero-nutrient food).
//
// Idempotency: every entry carries source='csv_import' plus a stable
// source_id derived from the row's content and position, so re-uploading the
// same file updates rows in place via food_entries' partial unique index on
// (user_id, source, source_id) instead of duplicating. Saved-meal expansion
// and ad-hoc meal groups are NOT idempotent (each import creates a new
// food_entry_meals instance) — food_entry_meals has no equivalent upsert key.

const DIARY_IMPORT_NUTRIENT_FIELDS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'saturated_fat',
  'polyunsaturated_fat',
  'monounsaturated_fat',
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
] as const;

const isBlankCell = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowHasNutrients = (row: any): boolean =>
  DIARY_IMPORT_NUTRIENT_FIELDS.some((field) => !isBlankCell(row[field]));

// Only includes columns the row actually filled in, so blanks fall back to
// whatever the resolved food/variant already has (matched-food nutrients, or
// the DB column default) rather than overwriting them with null. Coerced to
// numbers; non-numeric cells are dropped rather than stored as NaN.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickFilledNutrients(row: any): Record<string, number> {
  const picked: Record<string, number> = {};
  for (const field of DIARY_IMPORT_NUTRIENT_FIELDS) {
    if (isBlankCell(row[field])) continue;
    const num = Number(row[field]);
    if (Number.isFinite(num)) picked[field] = num;
  }
  return picked;
}

// Custom nutrients arrive as a { name: value } object assembled client-side
// from the CSV's extra (non-standard) columns. Returns a sanitized object or
// undefined when none are present.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowCustomNutrients(row: any): Record<string, unknown> | undefined {
  const cn = row.custom_nutrients;
  if (cn && typeof cn === 'object' && Object.keys(cn).length > 0) {
    return sanitizeCustomNutrients(cn);
  }
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowHasAnyNutrients(row: any): boolean {
  return rowHasNutrients(row) || rowCustomNutrients(row) !== undefined;
}

// The entry snapshot override for a row. When the row supplies its own
// nutrients they represent the totals for the portion in quantity+unit, so we
// also pin serving_size/serving_unit to that portion — otherwise the diary
// would rescale the provided totals by (quantity / matched-variant
// serving_size) and show the wrong numbers for a matched food whose serving
// differs from the row. With no nutrients supplied we override nothing and let
// the matched/selected variant drive the (correctly scaled) snapshot.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEntrySnapshotOverride(row: any): Record<string, unknown> {
  const filled = pickFilledNutrients(row);
  const customNutrients = rowCustomNutrients(row);
  if (Object.keys(filled).length === 0 && !customNutrients) return {};
  return {
    serving_size: Number(row.quantity),
    serving_unit: row.unit,
    ...filled,
    ...(customNutrients ? { custom_nutrients: customNutrients } : {}),
  };
}

// Deterministic per-row idempotency key. Reordering/inserting rows between
// re-imports shifts `index` and breaks the match for the shifted rows — an
// accepted limitation documented in the diary-csv-import plan.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildFoodDiaryImportSourceId(row: any, index: number): string {
  const parts = [
    row.date,
    row.meal_type,
    row.meal_name || '',
    row.food_name || '',
    row.quantity,
    index,
  ];
  return `csv:${parts.join('|')}`;
}

// Picks which of a food's variants a row should log against: an exact
// serving_unit match (preferring the default among ties, else most recently
// updated), else the food's default variant. Auto-created foods have a
// single variant and never reach the ambiguous branches.
function selectFoodDiaryVariantId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  variants: any[],
  unit: string | undefined,
  defaultVariantId: string | undefined
): string | undefined {
  if (!variants || variants.length === 0) return defaultVariantId;
  const unitMatches = unit
    ? variants.filter(
        (v) => (v.serving_unit || '').toLowerCase() === unit.toLowerCase()
      )
    : [];
  if (unitMatches.length > 0) {
    const defaultMatch = unitMatches.find((v) => v.is_default);
    if (defaultMatch) return defaultMatch.id;
    const newest = [...unitMatches].sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )[0];
    return newest.id;
  }
  const defaultVariant = variants.find((v) => v.is_default);
  return defaultVariant ? defaultVariant.id : defaultVariantId;
}

interface FoodDiaryImportScope {
  family?: boolean;
  public?: boolean;
}

// Resolves (or auto-creates) the food + variant a row should log against.
// Returns { error } instead of throwing so the caller can attribute the
// failure to this one row without aborting the rest of the batch.
async function resolveFoodDiaryImportFood(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any,
  scope: FoodDiaryImportScope,
  overrideNutrition: boolean
): Promise<{ foodId?: string; variantId?: string; error?: string }> {
  const foodName = (row.food_name || '').trim();
  if (!foodName) {
    return { error: 'Missing food_name.' };
  }
  const hasNutrients = rowHasAnyNutrients(row);
  const customNutrients = rowCustomNutrients(row);

  // 1. Name-only match within the selected scope (own > family > public,
  // most-recently-logged breaking ties) — reference directly, never clone.
  const visible = await foodRepository.findVisibleFoodByName(
    userId,
    foodName,
    scope
  );
  if (visible) {
    const variants = await foodRepository.getFoodVariantsByFoodId(
      visible.id,
      userId
    );
    const variantId = selectFoodDiaryVariantId(
      variants,
      row.unit,
      visible.default_variant_id || visible.default_variant?.id
    );
    if (!variantId) {
      return { error: `Matched food '${foodName}' has no usable variant.` };
    }
    // Override option: rewrite the matched variant's stored nutrition with the
    // imported values. Guarded to the user's OWN foods (the frontend also
    // forces scope to mine-only when override is on, but we re-check here so a
    // family/public food is never mutated). The variant's serving basis is
    // pinned to the row's portion, matching the imported totals.
    if (overrideNutrition && hasNutrients && visible.user_id === userId) {
      await foodRepository.updateFoodVariantNutrition(variantId, userId, {
        serving_size: row.quantity,
        serving_unit: row.unit,
        ...pickFilledNutrients(row),
        custom_nutrients: customNutrients,
      });
    }
    return { foodId: visible.id, variantId };
  }

  // 2. A food this importer previously created for this exact name.
  const prior = await foodRepository.findFoodByProviderExternalId(
    userId,
    foodName,
    'csv_import'
  );
  if (prior) {
    const variantId = prior.default_variant_id || prior.default_variant?.id;
    if (hasNutrients && variantId) {
      await foodRepository.updateFoodVariantNutrition(variantId, userId, {
        serving_size: row.quantity,
        serving_unit: row.unit,
        ...pickFilledNutrients(row),
        custom_nutrients: customNutrients,
      });
    }
    return { foodId: prior.id, variantId };
  }

  // 3. Auto-create — only if the row can describe its own nutrition.
  if (!hasNutrients) {
    return {
      error: `No existing food matched '${foodName}' within the selected scope, and no nutrient values were provided to create it.`,
    };
  }
  const created = await foodRepository.createFood({
    name: foodName,
    brand: row.brand || null,
    user_id: userId,
    is_custom: true,
    is_quick_food: true,
    shared_with_public: false,
    provider_type: 'csv_import',
    provider_external_id: foodName,
    provider_verified: false,
    serving_size: row.quantity,
    serving_unit: row.unit,
    source: 'imported',
    ...pickFilledNutrients(row),
    ...(customNutrients ? { custom_nutrients: customNutrients } : {}),
  });
  return { foodId: created.id, variantId: created.default_variant?.id };
}

// Imports a single-food row (no meal grouping) as one food_entries row.
async function importSingleFoodDiaryRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any,
  scope: FoodDiaryImportScope,
  overrideNutrition: boolean,
  index: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const quantity = Number(row.quantity);
  if (!row.quantity || isNaN(quantity) || quantity <= 0) {
    return { error: 'Invalid or missing quantity.', entry: row };
  }
  if (!row.date || !row.meal_type) {
    return { error: 'Missing date or meal_type.', entry: row };
  }
  const resolution = await resolveFoodDiaryImportFood(
    authenticatedUserId,
    row,
    scope,
    overrideNutrition
  );
  if (resolution.error) {
    return { error: resolution.error, entry: row };
  }
  try {
    const created = await foodRepository.createFoodEntry(
      {
        user_id: authenticatedUserId,
        food_id: resolution.foodId,
        variant_id: resolution.variantId,
        quantity,
        unit: row.unit,
        entry_date: row.date,
        meal_type: row.meal_type,
        source: 'csv_import',
        source_id: buildFoodDiaryImportSourceId(row, index),
        // CSV nutrient values are authoritative for this entry's snapshot
        // when present, even when the food itself was matched — they never
        // mutate the matched library food.
        ...buildEntrySnapshotOverride(row),
      },
      actingUserId
    );
    return { data: created };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message, entry: row };
  }
}

// Ad-hoc meal group: a meal_name that doesn't match any saved meal template.
// Creates one food_entry_meals parent plus one leaf food_entries row per row
// in the group, each food resolved via resolveFoodDiaryImportFood.
async function importAdHocFoodDiaryMealGroup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  group: {
    mealName: string;
    date: string;
    mealType: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows: { row: any; index: number }[];
  },
  scope: FoodDiaryImportScope,
  overrideNutrition: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ processed: any[]; errors: any[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processed: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const errors: any[] = [];
  let parent;
  try {
    parent = await foodEntryMealRepository.createFoodEntryMeal(
      {
        user_id: authenticatedUserId,
        meal_type: group.mealType,
        entry_date: group.date,
        name: group.mealName,
        quantity: 1,
        unit: 'serving',
      },
      actingUserId
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push({
      error: `Failed to create meal '${group.mealName}': ${message}`,
      entry: { meal_name: group.mealName, date: group.date },
    });
    return { processed, errors };
  }
  for (const { row } of group.rows) {
    const quantity = Number(row.quantity);
    if (!row.quantity || isNaN(quantity) || quantity <= 0) {
      errors.push({ error: 'Invalid or missing quantity.', entry: row });
      continue;
    }
    const resolution = await resolveFoodDiaryImportFood(
      authenticatedUserId,
      row,
      scope,
      overrideNutrition
    );
    if (resolution.error) {
      errors.push({ error: resolution.error, entry: row });
      continue;
    }
    try {
      // Meal leaves intentionally carry NO source/source_id: food_entry_meals
      // has no upsert key, so each import creates a fresh parent. If leaves
      // were keyed, a re-import would UPSERT the old leaves in place (the
      // ON CONFLICT set does not touch food_entry_meal_id) and strand the new
      // parent empty. Leaving them unkeyed makes re-import cleanly duplicate
      // the whole meal, matching the documented non-idempotent meal behavior.
      const created = await foodRepository.createFoodEntry(
        {
          user_id: authenticatedUserId,
          food_id: resolution.foodId,
          variant_id: resolution.variantId,
          meal_type_id: parent.meal_type_id,
          food_entry_meal_id: parent.id,
          quantity,
          unit: row.unit,
          entry_date: group.date,
          ...buildEntrySnapshotOverride(row),
        },
        actingUserId
      );
      processed.push({ data: created });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ error: message, entry: row });
    }
  }
  return { processed, errors };
}

// Bulk-imports diary log rows from CSV. Groups rows by meal_name so a saved
// meal is logged by expanding its template (createFoodEntryMeal), an
// unrecognized meal_name becomes an ad-hoc meal group, and everything else
// is a single food_entries row. Row failures are collected, not thrown, so
// one bad row never aborts the rest of the batch.
async function importFoodDiaryEntriesInBulk(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[],
  scope: FoodDiaryImportScope = {},
  overrideNutrition = false
) {
  // Overriding stored food nutrition is only ever allowed against the user's
  // own foods, so ignore any family/public scope flags when it is on.
  const effectiveScope: FoodDiaryImportScope = overrideNutrition ? {} : scope;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processed: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const errors: any[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const singleRows: { row: any; index: number }[] = [];
  const mealGroups = new Map<
    string,
    {
      mealName: string;
      date: string;
      mealType: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows: { row: any; index: number }[];
    }
  >();

  rows.forEach((row, index) => {
    const mealName = (row.meal_name || '').trim();
    if (!mealName) {
      singleRows.push({ row, index });
      return;
    }
    const key = `${row.date}|${row.meal_type}|${mealName.toLowerCase()}`;
    const existing = mealGroups.get(key);
    if (existing) {
      existing.rows.push({ row, index });
    } else {
      mealGroups.set(key, {
        mealName,
        date: row.date,
        mealType: row.meal_type,
        rows: [{ row, index }],
      });
    }
  });

  for (const { row, index } of singleRows) {
    const result = await importSingleFoodDiaryRow(
      authenticatedUserId,
      actingUserId,
      row,
      effectiveScope,
      overrideNutrition,
      index
    );
    if (result.error) errors.push({ error: result.error, entry: result.entry });
    else processed.push(result.data);
  }

  for (const group of mealGroups.values()) {
    try {
      const savedMeals = await mealRepository.searchMeals(
        group.mealName,
        authenticatedUserId,
        5
      );
      const savedMeal = savedMeals.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m: any) => m.name.toLowerCase() === group.mealName.toLowerCase()
      );
      const noRowHasFoodName = group.rows.every(
        ({ row }) => !row.food_name || !row.food_name.trim()
      );
      if (savedMeal && noRowHasFoodName) {
        const representative = group.rows[0]!.row;
        const newMeal = await createFoodEntryMeal(
          authenticatedUserId,
          actingUserId,
          {
            meal_template_id: savedMeal.id,
            meal_type: group.mealType,
            entry_date: group.date,
            quantity: Number(representative.quantity) || 1,
            unit: representative.unit || 'serving',
            user_id: authenticatedUserId,
          }
        );
        processed.push(newMeal);
      } else {
        const adHoc = await importAdHocFoodDiaryMealGroup(
          authenticatedUserId,
          actingUserId,
          group,
          effectiveScope,
          overrideNutrition
        );
        processed.push(...adHoc.processed);
        errors.push(...adHoc.errors);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({
        error: `Failed to process meal '${group.mealName}': ${message}`,
        entry: { meal_name: group.mealName, rows: group.rows.length },
      });
    }
  }

  return {
    message:
      errors.length > 0
        ? 'Some diary entries could not be processed.'
        : 'All diary entries successfully processed.',
    processed,
    errors,
    skipped: [],
  };
}

async function createFoodEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryData: any
) {
  try {
    const entryWithUser = {
      ...entryData,
      user_id: entryData.user_id || authenticatedUserId,
      created_by_user_id: actingUserId,
    };
    if (entryData.custom_nutrients !== undefined) {
      entryWithUser.custom_nutrients = sanitizeCustomNutrients(
        entryData.custom_nutrients
      );
    }
    log(
      'info',
      `createFoodEntry in foodService: authenticatedUserId: ${authenticatedUserId}, actingUserId: ${actingUserId}, entryData: ${JSON.stringify(entryData)}`
    );
    const newEntry = await foodRepository.createFoodEntry(
      entryWithUser,
      actingUserId
    );
    return newEntry;
  } catch (error) {
    log(
      'error',
      `Error creating food entry for user ${authenticatedUserId} by ${actingUserId} in foodService:`,
      error
    );
    throw error;
  }
}
async function updateFoodEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryData: any
) {
  try {
    const entryOwnerId = await foodRepository.getFoodEntryOwnerId(
      entryId,
      authenticatedUserId
    );
    if (!entryOwnerId) {
      throw new Error('Food entry not found.');
    }
    if (entryOwnerId !== authenticatedUserId) {
      throw new Error(
        'Forbidden: You do not have permission to update this food entry.'
      );
    }
    // Fetch the existing entry to get food_id and current variant_id if not provided in entryData
    const existingEntry = await foodRepository.getFoodEntryById(
      entryId,
      authenticatedUserId
    );
    if (!existingEntry) {
      throw new Error('Food entry not found.');
    }
    const foodIdToUse = existingEntry.food_id;
    const variantIdToUse = entryData.variant_id || existingEntry.variant_id;
    let newSnapshotData;
    if (foodIdToUse) {
      // Variant changed — rebuild snapshot from the new food/variant
      const food = await foodRepository.getFoodById(
        foodIdToUse,
        authenticatedUserId
      );
      if (!food) {
        throw new Error('Food not found for snapshotting.');
      }
      const variant = await foodRepository.getFoodVariantById(
        variantIdToUse,
        authenticatedUserId
      );
      if (!variant) {
        throw new Error('Food variant not found for snapshotting.');
      }
      newSnapshotData = {
        food_name: food.name,
        brand_name: food.brand,
        serving_size: variant.serving_size,
        serving_unit: variant.serving_unit,
        calories: variant.calories,
        protein: variant.protein,
        carbs: variant.carbs,
        fat: variant.fat,
        saturated_fat: variant.saturated_fat,
        polyunsaturated_fat: variant.polyunsaturated_fat,
        monounsaturated_fat: variant.monounsaturated_fat,
        trans_fat: variant.trans_fat,
        cholesterol: variant.cholesterol,
        sodium: variant.sodium,
        potassium: variant.potassium,
        dietary_fiber: variant.dietary_fiber,
        sugars: variant.sugars,
        vitamin_a: variant.vitamin_a,
        vitamin_c: variant.vitamin_c,
        calcium: variant.calcium,
        iron: variant.iron,
        glycemic_index: variant.glycemic_index,
        custom_nutrients: sanitizeCustomNutrients(variant.custom_nutrients),
      };
    } else {
      // No variant change or no linked food — preserve existing entry's snapshot
      newSnapshotData = {
        food_name: existingEntry.food_name,
        brand_name: existingEntry.brand_name,
        serving_size: existingEntry.serving_size,
        serving_unit: existingEntry.serving_unit,
        calories: existingEntry.calories,
        protein: existingEntry.protein,
        carbs: existingEntry.carbs,
        fat: existingEntry.fat,
        saturated_fat: existingEntry.saturated_fat,
        polyunsaturated_fat: existingEntry.polyunsaturated_fat,
        monounsaturated_fat: existingEntry.monounsaturated_fat,
        trans_fat: existingEntry.trans_fat,
        cholesterol: existingEntry.cholesterol,
        sodium: existingEntry.sodium,
        potassium: existingEntry.potassium,
        dietary_fiber: existingEntry.dietary_fiber,
        sugars: existingEntry.sugars,
        vitamin_a: existingEntry.vitamin_a,
        vitamin_c: existingEntry.vitamin_c,
        calcium: existingEntry.calcium,
        iron: existingEntry.iron,
        glycemic_index: existingEntry.glycemic_index,
        custom_nutrients: sanitizeCustomNutrients(
          existingEntry.custom_nutrients
        ),
      };
    }
    // Apply inline nutrition overrides if provided by the client
    const nutritionOverrideFields = [
      'food_name',
      'brand_name',
      'serving_size',
      'serving_unit',
      'calories',
      'protein',
      'carbs',
      'fat',
      'saturated_fat',
      'polyunsaturated_fat',
      'monounsaturated_fat',
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
      'glycemic_index',
    ];
    for (const field of nutritionOverrideFields) {
      if (entryData[field] !== undefined) {
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        newSnapshotData[field] = entryData[field];
      }
    }
    if (entryData.custom_nutrients !== undefined) {
      newSnapshotData.custom_nutrients = sanitizeCustomNutrients(
        entryData.custom_nutrients
      );
    }
    const updatedEntry = await foodRepository.updateFoodEntry(
      entryId,
      authenticatedUserId,
      actingUserId,
      {
        ...entryData,
        meal_type_id: entryData.meal_type_id ?? existingEntry.meal_type_id,
        variant_id: variantIdToUse,
        // undefined preserves the stored time; an explicit null clears it
        entry_time:
          entryData.entry_time !== undefined
            ? entryData.entry_time
            : existingEntry.entry_time,
      }, // Ensure meal_type_id and correct variant_id are passed
      newSnapshotData // Pass the new snapshot data
    );
    if (!updatedEntry) {
      throw new Error('Food entry not found or not authorized to update.');
    }
    return updatedEntry;
  } catch (error) {
    log(
      'error',
      `Error updating food entry ${entryId} by user ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteFoodEntry(authenticatedUserId: any, entryId: any) {
  try {
    const entryOwnerId = await foodRepository.getFoodEntryOwnerId(
      entryId,
      authenticatedUserId
    );
    if (!entryOwnerId) {
      throw new Error('Food entry not found.');
    }
    // Authorization check: Ensure the authenticated user owns the entry
    // or has family access to the owner's data.
    // For simplicity, assuming direct ownership for now.
    if (entryOwnerId !== authenticatedUserId) {
      // In a real app, you'd check family access here.
      throw new Error(
        'Forbidden: You do not have permission to delete this food entry.'
      );
    }
    const success = await foodRepository.deleteFoodEntry(
      entryId,
      authenticatedUserId
    );
    if (!success) {
      throw new Error('Food entry not found or not authorized to delete.');
    }
    return true;
  } catch (error) {
    log(
      'error',
      `Error deleting food entry ${entryId} by user ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}
async function getFoodEntriesByDate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedDate: any
) {
  try {
    if (!targetUserId) {
      log(
        'error',
        'getFoodEntriesByDate: targetUserId is undefined. Returning empty array.'
      );
      return [];
    }
    const entries = await foodRepository.getFoodEntriesByDate(
      targetUserId,
      selectedDate
    );
    return entries;
  } catch (error) {
    log(
      'error',
      `Error fetching food entries for user ${targetUserId} on ${selectedDate} by ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}
async function getFoodEntriesByDateRange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any
) {
  try {
    const entries = await foodRepository.getFoodEntriesByDateRange(
      targetUserId,
      startDate,
      endDate
    );
    return entries;
  } catch (error) {
    log(
      'error',
      `Error fetching food entries for user ${targetUserId} from ${startDate} to ${endDate} by ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}
async function copyFoodEntries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sourceDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sourceMealType: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetMealType: any
) {
  try {
    log(
      'info',
      `copyFoodEntries: Copying from ${sourceDate} (${sourceMealType}) to ${targetDate} (${targetMealType}) for user ${authenticatedUserId}`
    );
    // 1. Fetch source entries
    const sourceEntries = await foodRepository.getFoodEntriesByDateAndMealType(
      authenticatedUserId,
      sourceDate,
      sourceMealType
    );
    if (sourceEntries.length === 0) {
      log(
        'debug',
        `No food entries found for ${sourceMealType} on ${sourceDate} for user ${authenticatedUserId}. No entries to copy.`
      );
      return [];
    }
    const targetMealTypeId = await resolveMealTypeId(
      authenticatedUserId,
      targetMealType
    );
    if (!targetMealTypeId) {
      throw new Error(`Invalid target meal type: ${targetMealType}`);
    }
    // Map to keep track of duplicated food_entry_meals
    // Key: old_food_entry_meal_id, Value: new_food_entry_meal_id
    const mealMapping = new Map();
    const entriesToCreate = [];
    for (const entry of sourceEntries) {
      log(
        'debug',
        `copyFoodEntries: Processing source entry: ${JSON.stringify(entry)}`
      );
      let newFoodEntryMealId = null;
      // If the entry belongs to a meal container, ensure the container is duplicated
      if (entry.food_entry_meal_id) {
        if (mealMapping.has(entry.food_entry_meal_id)) {
          newFoodEntryMealId = mealMapping.get(entry.food_entry_meal_id);
        } else {
          // Fetch the original meal details
          const originalMeal =
            await foodEntryMealRepository.getFoodEntryMealById(
              entry.food_entry_meal_id,
              authenticatedUserId
            );
          if (originalMeal) {
            // Create a new meal container for the target date/slot
            const newMeal = await foodEntryMealRepository.createFoodEntryMeal(
              {
                user_id: authenticatedUserId,
                meal_template_id: originalMeal.meal_template_id,
                meal_type_id: targetMealTypeId,
                entry_date: targetDate,
                entry_time: originalMeal.entry_time ?? null,
                name: originalMeal.name,
                description: originalMeal.description,
                quantity: originalMeal.quantity,
                unit: originalMeal.unit,
              },
              actingUserId
            );
            newFoodEntryMealId = newMeal.id;
            mealMapping.set(entry.food_entry_meal_id, newFoodEntryMealId);
            log(
              'debug',
              `copyFoodEntries: Duplicated meal container "${originalMeal.name}" (${entry.food_entry_meal_id} -> ${newFoodEntryMealId})`
            );
          }
        }
      }
      // Check for existing entry to prevent duplicates in the same meal/slot
      const existingEntry = await foodRepository.getFoodEntryByDetails(
        authenticatedUserId,
        entry.food_id,
        targetMealType,
        targetDate,
        entry.variant_id,
        newFoodEntryMealId // Use the new meal container ID for the duplicate check
      );
      if (!existingEntry) {
        entriesToCreate.push({
          user_id: authenticatedUserId,
          created_by_user_id: actingUserId,
          food_id: entry.food_id,
          meal_type_id: targetMealTypeId,
          food_entry_meal_id: newFoodEntryMealId, // Link the food to the new container
          quantity: entry.quantity,
          unit: entry.unit,
          entry_date: targetDate,
          entry_time: entry.entry_time ?? null,
          variant_id: entry.variant_id,
          meal_plan_template_id: null,
          food_name: entry.food_name,
          brand_name: entry.brand_name,
          serving_size: entry.serving_size,
          serving_unit: entry.serving_unit,
          calories: entry.calories,
          protein: entry.protein,
          carbs: entry.carbs,
          fat: entry.fat,
          saturated_fat: entry.saturated_fat,
          polyunsaturated_fat: entry.polyunsaturated_fat,
          monounsaturated_fat: entry.monounsaturated_fat,
          trans_fat: entry.trans_fat,
          cholesterol: entry.cholesterol,
          sodium: entry.sodium,
          potassium: entry.potassium,
          dietary_fiber: entry.dietary_fiber,
          sugars: entry.sugars,
          vitamin_a: entry.vitamin_a,
          vitamin_c: entry.vitamin_c,
          calcium: entry.calcium,
          iron: entry.iron,
          glycemic_index: entry.glycemic_index,
          custom_nutrients: sanitizeCustomNutrients(entry.custom_nutrients),
        });
        log(
          'debug',
          `copyFoodEntries: Adding entry for food_id: ${entry.food_id} into meal_id: ${newFoodEntryMealId}`
        );
      } else {
        log(
          'debug',
          `Skipping duplicate food entry for food_id ${entry.food_id} in ${targetMealType} on ${targetDate}.`
        );
      }
    }
    if (entriesToCreate.length === 0) {
      log(
        'debug',
        'All food entries already exist in target slot. No new entries created.'
      );
      return [];
    }
    const newEntries = await foodRepository.bulkCreateFoodEntries(
      entriesToCreate,
      authenticatedUserId
    );
    return newEntries;
  } catch (error) {
    log(
      'error',
      `Error copying food entries for user ${authenticatedUserId} from ${sourceDate} ${sourceMealType} to ${targetDate} ${targetMealType}:`,
      error
    );
    throw error;
  }
}
async function copyFoodEntriesFromUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sourceUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sourceDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sourceMealType: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetMealType: any
) {
  try {
    log(
      'info',
      `copyFoodEntriesFromUser: Copying from user ${sourceUserId} (${sourceDate} ${sourceMealType}) to user ${authenticatedUserId} (${targetDate} ${targetMealType}) by actor ${actingUserId}`
    );
    // Copy authorization must be evaluated for the real actor performing the
    // request, not the active/switched user (authenticatedUserId here is the
    // active-context user). Otherwise a delegate acting in another user's
    // context could copy a third party's diary using that user's grants.
    const hasAccess = await familyAccessRepository.checkCopyPermissions(
      actingUserId,
      sourceUserId
    );
    if (!hasAccess) {
      throw new Error(
        'Forbidden: You do not have permissions to copy from this family member.'
      );
    }
    const sourceEntries = await foodRepository.getFoodEntriesByDateAndMealType(
      sourceUserId,
      sourceDate,
      sourceMealType
    );
    if (sourceEntries.length === 0) {
      log(
        'debug',
        `No food entries found for ${sourceMealType} on ${sourceDate} for user ${sourceUserId}. No entries to copy.`
      );
      return [];
    }
    const targetMealTypeId = await resolveMealTypeId(
      authenticatedUserId,
      targetMealType
    );
    if (!targetMealTypeId) {
      throw new Error(`Invalid target meal type: ${targetMealType}`);
    }
    const mealMapping = new Map();
    const entriesToCreate = [];
    for (const entry of sourceEntries) {
      let newFoodEntryMealId = null;
      if (entry.food_entry_meal_id) {
        if (mealMapping.has(entry.food_entry_meal_id)) {
          newFoodEntryMealId = mealMapping.get(entry.food_entry_meal_id);
        } else {
          const originalMeal =
            await foodEntryMealRepository.getFoodEntryMealById(
              entry.food_entry_meal_id,
              sourceUserId
            );
          if (originalMeal) {
            const newMeal = await foodEntryMealRepository.createFoodEntryMeal(
              {
                user_id: authenticatedUserId,
                meal_template_id: originalMeal.meal_template_id,
                meal_type_id: targetMealTypeId,
                entry_date: targetDate,
                entry_time: originalMeal.entry_time ?? null,
                name: originalMeal.name,
                description: originalMeal.description,
                quantity: originalMeal.quantity,
                unit: originalMeal.unit,
              },
              actingUserId
            );
            newFoodEntryMealId = newMeal.id;
            mealMapping.set(entry.food_entry_meal_id, newFoodEntryMealId);
          }
        }
      }
      const existingEntry = await foodRepository.getFoodEntryByDetails(
        authenticatedUserId,
        entry.food_id,
        targetMealType,
        targetDate,
        entry.variant_id,
        newFoodEntryMealId
      );
      if (!existingEntry) {
        entriesToCreate.push({
          user_id: authenticatedUserId,
          created_by_user_id: actingUserId,
          food_id: entry.food_id,
          meal_type_id: targetMealTypeId,
          food_entry_meal_id: newFoodEntryMealId,
          quantity: entry.quantity,
          unit: entry.unit,
          entry_date: targetDate,
          entry_time: entry.entry_time ?? null,
          variant_id: entry.variant_id,
          meal_plan_template_id: null,
          food_name: entry.food_name,
          brand_name: entry.brand_name,
          serving_size: entry.serving_size,
          serving_unit: entry.serving_unit,
          calories: entry.calories,
          protein: entry.protein,
          carbs: entry.carbs,
          fat: entry.fat,
          saturated_fat: entry.saturated_fat,
          polyunsaturated_fat: entry.polyunsaturated_fat,
          monounsaturated_fat: entry.monounsaturated_fat,
          trans_fat: entry.trans_fat,
          cholesterol: entry.cholesterol,
          sodium: entry.sodium,
          potassium: entry.potassium,
          dietary_fiber: entry.dietary_fiber,
          sugars: entry.sugars,
          vitamin_a: entry.vitamin_a,
          vitamin_c: entry.vitamin_c,
          calcium: entry.calcium,
          iron: entry.iron,
          glycemic_index: entry.glycemic_index,
          custom_nutrients: sanitizeCustomNutrients(entry.custom_nutrients),
        });
      }
    }
    if (entriesToCreate.length === 0) {
      return [];
    }
    const newEntries = await foodRepository.bulkCreateFoodEntries(
      entriesToCreate,
      authenticatedUserId
    );
    return newEntries;
  } catch (error) {
    log(
      'error',
      `Error copying food entries from user ${sourceUserId} to ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function copyFoodEntriesToUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sourceDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sourceMealType: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetMealType: any
) {
  try {
    log(
      'info',
      `copyFoodEntriesToUser: Copying from user ${authenticatedUserId} (${sourceDate} ${sourceMealType}) to user ${targetUserId} (${targetDate} ${targetMealType}) by actor ${actingUserId}`
    );
    // Authorize the real actor, not the active/switched user — see
    // copyFoodEntriesFromUser.
    const hasAccess = await familyAccessRepository.checkCopyPermissions(
      actingUserId,
      targetUserId
    );
    if (!hasAccess) {
      throw new Error(
        'Forbidden: You do not have permissions to copy to this family member.'
      );
    }
    const sourceEntries = await foodRepository.getFoodEntriesByDateAndMealType(
      authenticatedUserId,
      sourceDate,
      sourceMealType
    );
    if (sourceEntries.length === 0) {
      log(
        'debug',
        `No food entries found for ${sourceMealType} on ${sourceDate} for user ${authenticatedUserId}. No entries to copy.`
      );
      return [];
    }
    const targetMealTypeId = await resolveMealTypeId(
      targetUserId,
      targetMealType
    );
    if (!targetMealTypeId) {
      throw new Error(`Invalid target meal type: ${targetMealType}`);
    }
    const mealMapping = new Map();
    const entriesToCreate = [];
    for (const entry of sourceEntries) {
      let newFoodEntryMealId = null;
      if (entry.food_entry_meal_id) {
        if (mealMapping.has(entry.food_entry_meal_id)) {
          newFoodEntryMealId = mealMapping.get(entry.food_entry_meal_id);
        } else {
          const originalMeal =
            await foodEntryMealRepository.getFoodEntryMealById(
              entry.food_entry_meal_id,
              authenticatedUserId
            );
          if (originalMeal) {
            const newMeal = await foodEntryMealRepository.createFoodEntryMeal(
              {
                user_id: targetUserId,
                meal_template_id: originalMeal.meal_template_id,
                meal_type_id: targetMealTypeId,
                entry_date: targetDate,
                entry_time: originalMeal.entry_time ?? null,
                name: originalMeal.name,
                description: originalMeal.description,
                quantity: originalMeal.quantity,
                unit: originalMeal.unit,
              },
              actingUserId
            );
            newFoodEntryMealId = newMeal.id;
            mealMapping.set(entry.food_entry_meal_id, newFoodEntryMealId);
          }
        }
      }
      const existingEntry = await foodRepository.getFoodEntryByDetails(
        targetUserId,
        entry.food_id,
        targetMealType,
        targetDate,
        entry.variant_id,
        newFoodEntryMealId
      );
      if (!existingEntry) {
        entriesToCreate.push({
          user_id: targetUserId,
          created_by_user_id: actingUserId,
          food_id: entry.food_id,
          meal_type_id: targetMealTypeId,
          food_entry_meal_id: newFoodEntryMealId,
          quantity: entry.quantity,
          unit: entry.unit,
          entry_date: targetDate,
          entry_time: entry.entry_time ?? null,
          variant_id: entry.variant_id,
          meal_plan_template_id: null,
          food_name: entry.food_name,
          brand_name: entry.brand_name,
          serving_size: entry.serving_size,
          serving_unit: entry.serving_unit,
          calories: entry.calories,
          protein: entry.protein,
          carbs: entry.carbs,
          fat: entry.fat,
          saturated_fat: entry.saturated_fat,
          polyunsaturated_fat: entry.polyunsaturated_fat,
          monounsaturated_fat: entry.monounsaturated_fat,
          trans_fat: entry.trans_fat,
          cholesterol: entry.cholesterol,
          sodium: entry.sodium,
          potassium: entry.potassium,
          dietary_fiber: entry.dietary_fiber,
          sugars: entry.sugars,
          vitamin_a: entry.vitamin_a,
          vitamin_c: entry.vitamin_c,
          calcium: entry.calcium,
          iron: entry.iron,
          glycemic_index: entry.glycemic_index,
          custom_nutrients: sanitizeCustomNutrients(entry.custom_nutrients),
        });
      }
    }
    if (entriesToCreate.length === 0) {
      return [];
    }
    const newEntries = await foodRepository.bulkCreateFoodEntries(
      entriesToCreate,
      targetUserId
    );
    return newEntries;
  } catch (error) {
    log(
      'error',
      `Error copying food entries from user ${authenticatedUserId} to user ${targetUserId}:`,
      error
    );
    throw error;
  }
}
async function copyFoodEntriesFromYesterday(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mealType: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetDate: any
) {
  try {
    const [yearStr, monthStr, dayStr] = targetDate.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      throw new Error('Invalid date format provided for targetDate.');
    }
    const priorDay = new Date(Date.UTC(year, month - 1, day));
    priorDay.setUTCDate(priorDay.getUTCDate() - 1);
    const sourceDate = priorDay.toISOString().split('T')[0];
    log(
      'info',
      `copyFoodEntriesFromYesterday: Calculating sourceDate ${sourceDate} from targetDate ${targetDate}`
    );
    // Delegate to consolidated copyFoodEntries function
    return await copyFoodEntries(
      authenticatedUserId,
      actingUserId,
      sourceDate,
      mealType,
      targetDate,
      mealType
    );
  } catch (error) {
    log(
      'error',
      `Error copying food entries from prior day for user ${authenticatedUserId} to ${targetDate} ${mealType}:`,
      error
    );
    throw error;
  }
}
async function copyAllFoodEntries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sourceDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetDate: any
) {
  try {
    log(
      'info',
      `copyAllFoodEntries: Copying entire day from ${sourceDate} to ${targetDate} for user ${authenticatedUserId}`
    );
    // 1. Fetch all entries from the source day to find used meal slots
    const allSourceEntries = await foodRepository.getFoodEntriesByDate(
      authenticatedUserId,
      sourceDate
    );
    if (allSourceEntries.length === 0) {
      log(
        'debug',
        `No food entries found on ${sourceDate} for user ${authenticatedUserId}. Nothing to copy.`
      );
      return [];
    }
    // 2. Identify unique meal types (slots) that have data
    const usedMealTypes = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...new Set(allSourceEntries.map((e: any) => e.meal_type)),
    ];
    log(
      'debug',
      `copyAllFoodEntries: Found ${usedMealTypes.length} slots with data: ${usedMealTypes.join(', ')}`
    );
    const allCopiedEntries = [];
    // 3. Loop through each slot and perform a Deep Copy
    for (const mealType of usedMealTypes) {
      const copiedEntries = await copyFoodEntries(
        authenticatedUserId,
        actingUserId,
        sourceDate,
        mealType,
        targetDate,
        mealType
      );
      allCopiedEntries.push(...copiedEntries);
    }
    log(
      'info',
      `Successfully copied entire day (${allCopiedEntries.length} entries) from ${sourceDate} to ${targetDate} for user ${authenticatedUserId}.`
    );
    return allCopiedEntries;
  } catch (error) {
    log(
      'error',
      `Error copying all food entries for user ${authenticatedUserId} from ${sourceDate} to ${targetDate}:`,
      error
    );
    throw error;
  }
}
async function copyAllFoodEntriesFromYesterday(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetDate: any
) {
  try {
    const [yearStr, monthStr, dayStr] = targetDate.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      throw new Error('Invalid date format provided for targetDate.');
    }
    const priorDay = new Date(Date.UTC(year, month - 1, day));
    priorDay.setUTCDate(priorDay.getUTCDate() - 1);
    const sourceDate = priorDay.toISOString().split('T')[0];
    return await copyAllFoodEntries(
      authenticatedUserId,
      actingUserId,
      sourceDate,
      targetDate
    );
  } catch (error) {
    log(
      'error',
      `Error copying all food entries from prior day for user ${authenticatedUserId} to ${targetDate}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDailyNutritionSummary(userId: any, date: any) {
  try {
    const summary = await foodRepository.getDailyNutritionSummary(userId, date);
    if (!summary) {
      // Return a zero-initialized summary if no entries are found for the date
      return {
        total_calories: 0,
        total_protein: 0,
        total_carbs: 0,
        total_fat: 0,
        total_dietary_fiber: 0,
      };
    }
    return summary;
  } catch (error) {
    log(
      'error',
      `Error fetching daily nutrition summary for user ${userId} on ${date} in foodService:`,
      error
    );
    throw error;
  }
}
// New functions for food_entry_meals logic
// Safety net for the recursive flatten. The meal service validates template
// nesting at <= MAX_MEAL_NESTING_DEPTH (5) at write time; this slightly higher
// cap protects the diary expansion against unexpectedly deep/legacy structures.
const MAX_MEAL_FLATTEN_DEPTH = 6;

interface FlattenContext {
  authenticatedUserId: string;
  actingUserId: string;
  targetUserId: string;
  mealTypeId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryDate: any;
  entryTime?: string | null;
  foodEntryMealId: string;
}

// Recursively flattens a meal's ingredient list (foods and linked sub-meals)
// into leaf food_entries, composing the portion multiplier down the tree so a
// linked meal scales by its own serving yield. Sub-meals never produce their
// own diary rows — only leaf foods do, which keeps diary/reporting unchanged.
async function buildLeafFoodEntries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components: any,
  multiplier: number,
  ctx: FlattenContext,
  depth = 0
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries: any[] = [];
  if (depth > MAX_MEAL_FLATTEN_DEPTH) {
    log(
      'warn',
      `Max meal nesting depth (${MAX_MEAL_FLATTEN_DEPTH}) exceeded while flattening meal for diary; stopping recursion.`
    );
    return entries;
  }
  for (const component of components || []) {
    const isMeal = component.item_type === 'meal';
    if (isMeal) {
      const childMealId = component.child_meal_id;
      if (childMealId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let child: any;
        try {
          child = await mealRepository.getMealById(
            childMealId,
            ctx.authenticatedUserId
          );
        } catch {
          log(
            'warn',
            `Linked meal ${childMealId} not found/accessible while flattening; falling back to snapshot.`
          );
        }
        if (child) {
          const servingSize = Number(child.serving_size) || 1.0;
          const totalServings = Number(child.total_servings) || 1.0;
          const denominator = servingSize * totalServings;
          const quantityInBaseUnit =
            component.unit === 'serving' &&
            child.serving_unit &&
            child.serving_unit !== 'serving'
              ? (Number(component.quantity) || 0) * servingSize
              : Number(component.quantity) || 0;
          const childFactor =
            denominator > 0 ? quantityInBaseUnit / denominator : 1.0;
          const childEntries = await buildLeafFoodEntries(
            child.foods,
            multiplier * childFactor,
            ctx,
            depth + 1
          );
          entries.push(...childEntries);
          continue;
        }
      }

      // Fallback for deleted sub-meals (where child_meal_id is null or not found):
      // Treat as a static custom food entry using its snapshot nutrients
      entries.push({
        food_name: component.food_name || 'Deleted Sub-Meal',
        quantity: (Number(component.quantity) || 0) * multiplier,
        unit: component.unit || 'serving',
        calories: (Number(component.calories) || 0) * multiplier,
        protein: (Number(component.protein) || 0) * multiplier,
        carbs: (Number(component.carbs) || 0) * multiplier,
        fat: (Number(component.fat) || 0) * multiplier,
        saturated_fat: (Number(component.saturated_fat) || 0) * multiplier,
        polyunsaturated_fat:
          (Number(component.polyunsaturated_fat) || 0) * multiplier,
        monounsaturated_fat:
          (Number(component.monounsaturated_fat) || 0) * multiplier,
        trans_fat: (Number(component.trans_fat) || 0) * multiplier,
        cholesterol: (Number(component.cholesterol) || 0) * multiplier,
        sodium: (Number(component.sodium) || 0) * multiplier,
        potassium: (Number(component.potassium) || 0) * multiplier,
        dietary_fiber: (Number(component.dietary_fiber) || 0) * multiplier,
        sugars: (Number(component.sugars) || 0) * multiplier,
        vitamin_a: (Number(component.vitamin_a) || 0) * multiplier,
        vitamin_c: (Number(component.vitamin_c) || 0) * multiplier,
        calcium: (Number(component.calcium) || 0) * multiplier,
        iron: (Number(component.iron) || 0) * multiplier,
        glycemic_index: component.glycemic_index || null,
        custom_nutrients: component.custom_nutrients || null,
      });
      continue;
    }
    const food = await foodRepository.getFoodById(
      component.food_id,
      ctx.authenticatedUserId
    );
    if (!food) {
      log(
        'warn',
        `Food with ID ${component.food_id} not found while flattening meal. Skipping.`
      );
      continue;
    }
    const variantId = component.variant_id || food.default_variant?.id;
    if (!variantId) {
      log(
        'warn',
        `No variant ID found for food ${component.food_id} while flattening meal. Skipping.`
      );
      continue;
    }
    const variant = await foodRepository.getFoodVariantById(
      variantId,
      ctx.authenticatedUserId
    );
    if (!variant) {
      log(
        'warn',
        `Food variant ${variantId} not found for food ${component.food_id} while flattening meal. Skipping.`
      );
      continue;
    }
    const snapshot = {
      food_name: food.name,
      brand_name: food.brand,
      serving_size: variant.serving_size,
      serving_unit: variant.serving_unit,
      calories: variant.calories,
      protein: variant.protein,
      carbs: variant.carbs,
      fat: variant.fat,
      saturated_fat: variant.saturated_fat,
      polyunsaturated_fat: variant.polyunsaturated_fat,
      monounsaturated_fat: variant.monounsaturated_fat,
      trans_fat: variant.trans_fat,
      cholesterol: variant.cholesterol,
      sodium: variant.sodium,
      potassium: variant.potassium,
      dietary_fiber: variant.dietary_fiber,
      sugars: variant.sugars,
      vitamin_a: variant.vitamin_a,
      vitamin_c: variant.vitamin_c,
      calcium: variant.calcium,
      iron: variant.iron,
      glycemic_index: variant.glycemic_index,
      custom_nutrients: sanitizeCustomNutrients(variant.custom_nutrients),
    };
    entries.push({
      user_id: ctx.targetUserId,
      created_by_user_id: ctx.actingUserId,
      food_id: component.food_id,
      meal_type_id: ctx.mealTypeId,
      quantity: (Number(component.quantity) || 0) * multiplier,
      unit: component.unit,
      variant_id: variantId,
      entry_date: ctx.entryDate,
      entry_time: ctx.entryTime ?? null,
      food_entry_meal_id: ctx.foodEntryMealId,
      ...snapshot,
    });
  }
  return entries;
}
async function createFoodEntryMeal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mealData: any
) {
  log(
    'info',
    `createFoodEntryMeal in foodEntryService: authenticatedUserId: ${authenticatedUserId}, actingUserId: ${actingUserId}, mealData: ${JSON.stringify(mealData)}`
  );
  try {
    // Backwards compatibility (issue #1023): clients on the new serving model
    // send X-Meal-Model-Version: 2. Old clients omit the header — for
    // serving-unit logs they expected the legacy special-case math
    // (multiplier = quantity), so mark the new row as legacy and compute the
    // multiplier accordingly. Non-serving units collapse identically either
    // way, so the flag has no effect there.
    const clientMealModelVersion =
      Number(mealData._clientMealModelVersion) || 1;
    const isLegacyClient = clientMealModelVersion < 2;
    const useLegacyServingMath =
      isLegacyClient && (mealData.unit || 'serving') === 'serving';

    let foodsToProcess = mealData.foods || [];
    let mealServingSize = 1.0; // Default per-serving quantity
    let mealTotalServings = 1.0; // Default yield count
    let description = mealData.description || null;
    let name = mealData.name;

    // If a meal_template id is provided fetch the template for serving size and foods.
    if (mealData.meal_template_id) {
      log(
        'info',
        `Fetching meal template ${mealData.meal_template_id} for serving size, name, description, and foods.`
      );
      const mealTemplate = await mealRepository.getMealById(
        mealData.meal_template_id,
        authenticatedUserId
      );
      if (mealTemplate) {
        mealServingSize = mealTemplate.serving_size || 1.0;
        mealTotalServings = mealTemplate.total_servings || 1.0;
        if (!name && mealTemplate.name) {
          name = mealTemplate.name;
        }
        if (!description && mealTemplate.description) {
          description = mealTemplate.description;
        }
        log(
          'info',
          `Meal template serving: ${mealServingSize} ${mealTemplate.serving_unit || 'serving'} × ${mealTotalServings} servings`
        );
        // If no specific foods provided use template
        if (!mealData.foods || mealData.foods.length === 0) {
          if (mealTemplate.foods) {
            foodsToProcess = mealTemplate.foods;
          } else {
            log(
              'warn',
              `Meal template ${mealData.meal_template_id} has no foods.`
            );
          }
        }
      } else {
        log(
          'warn',
          `Meal template ${mealData.meal_template_id} not found when creating food entry meal.`
        );
      }
    }

    // 1. Create the parent food_entry_meals record with quantity, unit, name, and description.
    const newFoodEntryMeal = await foodEntryMealRepository.createFoodEntryMeal(
      {
        user_id: mealData.user_id || authenticatedUserId, // Use target user ID
        meal_template_id: mealData.meal_template_id || null,
        meal_type_id: mealData.meal_type_id || null,
        meal_type: mealData.meal_type,
        entry_date: mealData.entry_date,
        entry_time: mealData.entry_time ?? null,
        name: name,
        description: description,
        quantity: mealData.quantity || 1.0, // Default to 1.0
        unit: mealData.unit || 'serving', // Default to 'serving'
        legacy_serving_unit_math: useLegacyServingMath,
      },
      actingUserId
    );
    const resolvedMealTypeId = newFoodEntryMeal.meal_type_id;

    // Calculate portion multiplier.
    //   - Uniform model (new clients): consumed_quantity / (serving_size × total_servings).
    //   - Legacy model (old clients, unit='serving'): multiplier = consumed_quantity.
    // Full recipe nutrition is stored in component foods scaled by mf.quantity / mf.serving_size,
    // so this multiplier scales the WHOLE recipe down to the consumed portion.
    const consumedQuantity = mealData.quantity || 1.0;
    let multiplier = 1.0;
    if (mealData.meal_template_id) {
      if (useLegacyServingMath) {
        multiplier = consumedQuantity;
      } else {
        const denominator = mealServingSize * mealTotalServings;
        multiplier = denominator > 0 ? consumedQuantity / denominator : 1.0;
      }
    }
    log(
      'info',
      `Portion multiplier: ${multiplier} (consumed: ${consumedQuantity}, serving_size: ${mealServingSize}, total_servings: ${mealTotalServings}, has_template: ${!!mealData.meal_template_id}, legacy_client: ${isLegacyClient}, legacy_math: ${useLegacyServingMath})`
    );
    // 2. Create component food_entries records with scaled quantities.
    // buildLeafFoodEntries recursively flattens any linked sub-meals so the
    // diary only ever stores leaf foods (see MEAL_COMPOSITION_PLAN.md).
    const entriesToCreate = await buildLeafFoodEntries(
      foodsToProcess,
      multiplier,
      {
        authenticatedUserId,
        actingUserId,
        targetUserId: newFoodEntryMeal.user_id, // target user from the created meal
        mealTypeId: resolvedMealTypeId,
        entryDate: mealData.entry_date,
        entryTime: newFoodEntryMeal.entry_time ?? null,
        foodEntryMealId: newFoodEntryMeal.id,
      }
    );
    if (entriesToCreate.length > 0) {
      await foodRepository.bulkCreateFoodEntries(
        entriesToCreate,
        authenticatedUserId
      );
      log(
        'info',
        `Created ${entriesToCreate.length} component food entries for food_entry_meal ${newFoodEntryMeal.id}.`
      );
    }
    return newFoodEntryMeal;
  } catch (error) {
    log(
      'error',
      `Error creating food entry meal for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function updateFoodEntryMeal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  foodEntryMealId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updatedMealData: any
) {
  log(
    'info',
    `updateFoodEntryMeal in foodEntryService: foodEntryMealId: ${foodEntryMealId}, updatedMealData: ${JSON.stringify(updatedMealData)}, authenticatedUserId: ${authenticatedUserId}, actingUserId: ${actingUserId}`
  );
  try {
    // 1. Update the parent food_entry_meals record's metadata
    const updatedFoodEntryMeal =
      await foodEntryMealRepository.updateFoodEntryMeal(
        foodEntryMealId,
        {
          name: updatedMealData.name,
          description: updatedMealData.description,
          meal_type: updatedMealData.meal_type, // Also allow updating meal type
          meal_type_id: updatedMealData.meal_type_id, // Update meal type id so component entries inherit it
          entry_date: updatedMealData.entry_date, // And entry date
          entry_time: updatedMealData.entry_time, // undefined preserves, null clears
          meal_template_id: updatedMealData.meal_template_id, // Pass meal_template_id
          quantity: updatedMealData.quantity, // Update quantity
          unit: updatedMealData.unit, // Update unit
        },
        authenticatedUserId
      );
    const resolvedMealTypeId = updatedFoodEntryMeal.meal_type_id;
    if (!updatedFoodEntryMeal) {
      throw new Error('Food entry meal not found or not authorized to update.');
    }
    // 2. Delete existing component food_entries
    await foodRepository.deleteFoodEntryComponentsByFoodEntryMealId(
      foodEntryMealId,
      authenticatedUserId
    );
    log(
      'debug',
      `Deleted existing component food entries for food_entry_meal ${foodEntryMealId}.`
    );
    log('info', '[DEBUG] updateFoodEntryMeal Service Data:', updatedMealData); // DEBUG LOG
    // Calculate portion multiplier.
    // Foods from getFoodEntryMealWithComponents have BASE (unscaled) quantities.
    // Use the uniform model for new entries; honor the legacy_serving_unit_math
    // flag for pre-deploy entries so editing them does not silently shift their
    // nutrition (those entries were stored under the old
    // "unit === 'serving' → multiplier = quantity" special case).
    let multiplier = 1.0;
    const newQuantity = updatedMealData.quantity || 1.0;
    const legacyMath = updatedFoodEntryMeal.legacy_serving_unit_math === true;
    if (updatedMealData.meal_template_id) {
      const mealTemplate = await mealRepository.getMealById(
        updatedMealData.meal_template_id,
        authenticatedUserId
      );
      if (mealTemplate && mealTemplate.serving_size) {
        const referenceServingSize = mealTemplate.serving_size || 1.0;
        const referenceTotalServings = mealTemplate.total_servings || 1.0;
        if (legacyMath && updatedMealData.unit === 'serving') {
          multiplier = newQuantity;
        } else {
          const denominator = referenceServingSize * referenceTotalServings;
          multiplier = denominator > 0 ? newQuantity / denominator : 1.0;
        }
        log(
          'info',
          `Update portion scaling (with template): multiplier ${multiplier} (consumed: ${newQuantity}, serving_size: ${referenceServingSize}, total_servings: ${referenceTotalServings}, legacy: ${legacyMath})`
        );
      }
    } else {
      multiplier = 1.0;
      log(
        'info',
        `Update portion scaling (no template): multiplier ${multiplier}`
      );
    }
    // 3. Create new component food_entries records
    const entriesToCreate = [];
    for (const foodItem of updatedMealData.foods) {
      const food = await foodRepository.getFoodById(
        foodItem.food_id,
        authenticatedUserId
      );
      if (!food) {
        log(
          'warn',
          `Food with ID ${foodItem.food_id} not found when updating food entry meal. Skipping.`
        );
        continue;
      }
      const variantId = foodItem.variant_id || food.default_variant?.id;
      if (!variantId) {
        log(
          'warn',
          `No variant ID found for food ${foodItem.food_id} when updating food entry meal. Skipping.`
        );
        continue;
      }
      const variant = await foodRepository.getFoodVariantById(
        variantId,
        authenticatedUserId
      );
      if (!variant) {
        log(
          'warn',
          `Food variant with ID ${variantId} not found for food ${foodItem.food_id} when updating food entry meal. Skipping.`
        );
        continue;
      }
      const snapshot = {
        food_name: food.name,
        brand_name: food.brand,
        serving_size: variant.serving_size,
        serving_unit: variant.serving_unit,
        calories: variant.calories,
        protein: variant.protein,
        carbs: variant.carbs,
        fat: variant.fat,
        saturated_fat: variant.saturated_fat,
        polyunsaturated_fat: variant.polyunsaturated_fat,
        monounsaturated_fat: variant.monounsaturated_fat,
        trans_fat: variant.trans_fat,
        cholesterol: variant.cholesterol,
        sodium: variant.sodium,
        potassium: variant.potassium,
        dietary_fiber: variant.dietary_fiber,
        sugars: variant.sugars,
        vitamin_a: variant.vitamin_a,
        vitamin_c: variant.vitamin_c,
        calcium: variant.calcium,
        iron: variant.iron,
        glycemic_index: variant.glycemic_index,
        custom_nutrients: sanitizeCustomNutrients(variant.custom_nutrients),
      };
      // Scale the food quantity
      const scaledQuantity = foodItem.quantity * multiplier;
      entriesToCreate.push({
        user_id: authenticatedUserId,
        created_by_user_id: actingUserId,
        food_id: foodItem.food_id,
        meal_type_id: resolvedMealTypeId,
        quantity: scaledQuantity, // SCALED quantity
        unit: foodItem.unit,
        variant_id: variantId,
        entry_date: updatedMealData.entry_date,
        entry_time: updatedFoodEntryMeal.entry_time ?? null,
        food_entry_meal_id: foodEntryMealId, // Link to the existing food_entry_meals ID
        ...snapshot,
      });
    }
    if (entriesToCreate.length > 0) {
      await foodRepository.bulkCreateFoodEntries(
        entriesToCreate,
        authenticatedUserId
      );
      log(
        'info',
        `Recreated ${entriesToCreate.length} component food entries for food_entry_meal ${foodEntryMealId}.`
      );
    }
    return updatedFoodEntryMeal;
  } catch (error) {
    log(
      'error',
      `Error updating food entry meal ${foodEntryMealId} for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function getFoodEntryMealWithComponents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  foodEntryMealId: any
) {
  log(
    'info',
    `getFoodEntryMealWithComponents in foodEntryService: foodEntryMealId: ${foodEntryMealId}, authenticatedUserId: ${authenticatedUserId}`
  );
  try {
    const foodEntryMeal = await foodEntryMealRepository.getFoodEntryMealById(
      foodEntryMealId,
      authenticatedUserId
    );
    if (!foodEntryMeal) {
      return null;
    }
    const componentFoodEntries =
      await foodRepository.getFoodEntryComponentsByFoodEntryMealId(
        foodEntryMealId,
        authenticatedUserId
      );
    // Calculate the multiplier that was used when storing, so we can unscale
    // component values for editing. New entries (legacy_serving_unit_math = false)
    // were stored with the uniform formula
    //   multiplier = quantity / (serving_size × total_servings).
    // Pre-deploy entries (legacy_serving_unit_math = true) were stored with the
    // old "unit === 'serving' → multiplier = quantity" special case.
    let storedMultiplier = 1.0;
    if (foodEntryMeal.meal_template_id) {
      try {
        const mealTemplate = await mealRepository.getMealById(
          foodEntryMeal.meal_template_id,
          authenticatedUserId
        );
        if (mealTemplate) {
          const consumedQuantity = foodEntryMeal.quantity || 1.0;
          const templateServingSize = mealTemplate.serving_size || 1.0;
          const templateTotalServings = mealTemplate.total_servings || 1.0;
          const legacyMath = foodEntryMeal.legacy_serving_unit_math === true;
          if (legacyMath && foodEntryMeal.unit === 'serving') {
            storedMultiplier = consumedQuantity;
          } else {
            const denominator = templateServingSize * templateTotalServings;
            storedMultiplier =
              denominator > 0 ? consumedQuantity / denominator : 1.0;
          }
          log(
            'info',
            `Calculated stored multiplier for unscaling: ${storedMultiplier} (consumed: ${consumedQuantity}, serving_size: ${templateServingSize}, total_servings: ${templateTotalServings}, legacy: ${legacyMath})`
          );
        }
      } catch (err) {
        log(
          'warn',
          'Failed to fetch meal template for unscaling, using multiplier 1.0',
          err
        );
      }
    }
    // Aggregate nutritional data from componentFoodEntries (for frontend display)
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let totalSodium = 0;
    let totalFiber = 0;
    let totalSugars = 0;
    let totalSaturatedFat = 0;
    let totalPolyunsaturatedFat = 0;
    let totalMonounsaturatedFat = 0;
    let totalTransFat = 0;
    let totalCholesterol = 0;
    let totalPotassium = 0;
    let totalVitaminA = 0;
    let totalVitaminC = 0;
    let totalCalcium = 0;
    let totalIron = 0;
    const totalCustomNutrients = {};
    let totalCarbsForGI = 0;
    let weightedGIAccumulator = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    componentFoodEntries.forEach((entry: any) => {
      const servingSize = entry.serving_size || 1;
      const ratio = entry.quantity / servingSize;
      totalCalories += (entry.calories || 0) * ratio;
      totalProtein += (entry.protein || 0) * ratio;
      totalCarbs += (entry.carbs || 0) * ratio;
      totalFat += (entry.fat || 0) * ratio;
      totalSodium += (entry.sodium || 0) * ratio;
      totalFiber += (entry.dietary_fiber || 0) * ratio;
      totalSugars += (entry.sugars || 0) * ratio;
      totalSaturatedFat += (entry.saturated_fat || 0) * ratio;
      totalPolyunsaturatedFat += (entry.polyunsaturated_fat || 0) * ratio;
      totalMonounsaturatedFat += (entry.monounsaturated_fat || 0) * ratio;
      totalTransFat += (entry.trans_fat || 0) * ratio;
      totalCholesterol += (entry.cholesterol || 0) * ratio;
      totalPotassium += (entry.potassium || 0) * ratio;
      totalVitaminA += (entry.vitamin_a || 0) * ratio;
      totalVitaminC += (entry.vitamin_c || 0) * ratio;
      totalCalcium += (entry.calcium || 0) * ratio;
      totalIron += (entry.iron || 0) * ratio;
      // Aggregate custom nutrients
      if (
        entry.custom_nutrients &&
        typeof entry.custom_nutrients === 'object'
      ) {
        Object.entries(entry.custom_nutrients).forEach(([name, value]) => {
          if (
            value === null ||
            value === undefined ||
            String(value).trim() === ''
          ) {
            return; // Skip empty, null, or whitespace-only values
          }
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            totalCustomNutrients[name] =
              // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
              (totalCustomNutrients[name] || 0) + numValue * ratio;
          }
        });
      }
      if (entry.glycemic_index && entry.carbs) {
        const giValue = getGlycemicIndexValue(entry.glycemic_index);
        if (giValue !== null) {
          weightedGIAccumulator +=
            giValue * ((entry.carbs * entry.quantity) / servingSize);
          totalCarbsForGI += (entry.carbs * entry.quantity) / servingSize;
        }
      }
    });
    const aggregatedGlycemicIndex =
      totalCarbsForGI > 0 ? weightedGIAccumulator / totalCarbsForGI : null;
    return {
      ...foodEntryMeal,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      foods: componentFoodEntries.map((entry: any) => {
        const quantityToReturn = foodEntryMeal.meal_template_id
          ? entry.quantity / storedMultiplier
          : entry.quantity;
        return {
          food_id: entry.food_id,
          food_name: entry.food_name,
          variant_id: entry.variant_id,
          quantity: quantityToReturn,
          unit: entry.unit,
          calories: entry.calories, // BASE value per serving_size
          protein: entry.protein,
          carbs: entry.carbs,
          fat: entry.fat,
          saturated_fat: entry.saturated_fat,
          polyunsaturated_fat: entry.polyunsaturated_fat,
          monounsaturated_fat: entry.monounsaturated_fat,
          trans_fat: entry.trans_fat,
          cholesterol: entry.cholesterol,
          sodium: entry.sodium,
          potassium: entry.potassium,
          dietary_fiber: entry.dietary_fiber,
          sugars: entry.sugars,
          vitamin_a: entry.vitamin_a,
          vitamin_c: entry.vitamin_c,
          calcium: entry.calcium,
          iron: entry.iron,
          glycemic_index: entry.glycemic_index,
          custom_nutrients: entry.custom_nutrients,
          serving_size: entry.serving_size,
          serving_unit: entry.serving_unit,
        };
      }),
      // Aggregated totals are still calculated (for display when not editing)
      calories: totalCalories,
      protein: totalProtein,
      carbs: totalCarbs,
      fat: totalFat,
      saturated_fat: totalSaturatedFat,
      polyunsaturated_fat: totalPolyunsaturatedFat,
      monounsaturated_fat: totalMonounsaturatedFat,
      trans_fat: totalTransFat,
      cholesterol: totalCholesterol,
      sodium: totalSodium,
      potassium: totalPotassium,
      dietary_fiber: totalFiber,
      sugars: totalSugars,
      vitamin_a: totalVitaminA,
      vitamin_c: totalVitaminC,
      calcium: totalCalcium,
      iron: totalIron,
      custom_nutrients: totalCustomNutrients,
      glycemic_index: getGlycemicIndexCategory(aggregatedGlycemicIndex),
    };
  } catch (error) {
    log(
      'error',
      `Error getting food entry meal ${foodEntryMealId} with components for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function getFoodEntryMealsByDate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedDate: any
) {
  log(
    'debug',
    `getFoodEntryMealsByDate in foodEntryService: authenticatedUserId: ${authenticatedUserId}, targetUserId: ${targetUserId}, selectedDate: ${selectedDate}`
  );
  try {
    const foodEntryMeals =
      await foodEntryMealRepository.getFoodEntryMealsByDate(
        targetUserId,
        selectedDate
      );
    const mealsWithComponents = [];
    for (const meal of foodEntryMeals) {
      const componentFoodEntries =
        await foodRepository.getFoodEntryComponentsByFoodEntryMealId(
          meal.id,
          authenticatedUserId
        );
      let totalCalories = 0;
      let totalSodium = 0;
      let totalFiber = 0;
      let totalSugars = 0;
      let totalSaturatedFat = 0;
      let totalPolyunsaturatedFat = 0;
      let totalMonounsaturatedFat = 0;
      let totalTransFat = 0;
      let totalCholesterol = 0;
      let totalPotassium = 0;
      let totalVitaminA = 0;
      let totalVitaminC = 0;
      let totalCalcium = 0;
      let totalIron = 0;
      const totalCustomNutrients = {};
      let totalProtein = 0;
      let totalCarbs = 0;
      let totalFat = 0;
      let totalCarbsForGI = 0;
      let weightedGIAccumulator = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      componentFoodEntries.forEach((entry: any) => {
        const ratio = entry.quantity / (entry.serving_size || 1);
        totalCalories += (entry.calories || 0) * ratio;
        totalProtein += (entry.protein || 0) * ratio;
        totalCarbs += (entry.carbs || 0) * ratio;
        totalFat += (entry.fat || 0) * ratio;
        totalSodium += (entry.sodium || 0) * ratio;
        totalFiber += (entry.dietary_fiber || 0) * ratio;
        totalSugars += (entry.sugars || 0) * ratio;
        totalSaturatedFat += (entry.saturated_fat || 0) * ratio;
        totalPolyunsaturatedFat += (entry.polyunsaturated_fat || 0) * ratio;
        totalMonounsaturatedFat += (entry.monounsaturated_fat || 0) * ratio;
        totalTransFat += (entry.trans_fat || 0) * ratio;
        totalCholesterol += (entry.cholesterol || 0) * ratio;
        totalPotassium += (entry.potassium || 0) * ratio;
        totalVitaminA += (entry.vitamin_a || 0) * ratio;
        totalVitaminC += (entry.vitamin_c || 0) * ratio;
        totalCalcium += (entry.calcium || 0) * ratio;
        totalIron += (entry.iron || 0) * ratio;
        // Aggregate custom nutrients
        if (
          entry.custom_nutrients &&
          typeof entry.custom_nutrients === 'object'
        ) {
          Object.entries(entry.custom_nutrients).forEach(([name, value]) => {
            if (
              value === null ||
              value === undefined ||
              String(value).trim() === ''
            ) {
              return; // Skip empty, null, or whitespace-only values
            }
            const numValue = Number(value);
            if (!isNaN(numValue)) {
              // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
              totalCustomNutrients[name] =
                // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                (totalCustomNutrients[name] || 0) + numValue * ratio;
            }
          });
        }
        if (entry.glycemic_index && entry.carbs) {
          const giValue = getGlycemicIndexValue(entry.glycemic_index);
          if (giValue !== null) {
            weightedGIAccumulator +=
              giValue * ((entry.carbs * entry.quantity) / entry.serving_size);
            totalCarbsForGI +=
              (entry.carbs * entry.quantity) / entry.serving_size;
          }
        }
      });
      const aggregatedGlycemicIndex =
        totalCarbsForGI > 0 ? weightedGIAccumulator / totalCarbsForGI : null;
      mealsWithComponents.push({
        ...meal,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        foods: componentFoodEntries.map((entry: any) => ({
          food_id: entry.food_id,
          food_name: entry.food_name,
          variant_id: entry.variant_id,
          quantity: entry.quantity,
          unit: entry.unit,
          calories: (entry.calories * entry.quantity) / entry.serving_size,
          protein: (entry.protein * entry.quantity) / entry.serving_size,
          carbs: (entry.carbs * entry.quantity) / entry.serving_size,
          fat: (entry.fat * entry.quantity) / entry.serving_size,

          saturated_fat:
            (entry.saturated_fat * entry.quantity) / entry.serving_size,

          polyunsaturated_fat:
            (entry.polyunsaturated_fat * entry.quantity) / entry.serving_size,

          monounsaturated_fat:
            (entry.monounsaturated_fat * entry.quantity) / entry.serving_size,

          trans_fat: (entry.trans_fat * entry.quantity) / entry.serving_size,

          cholesterol:
            (entry.cholesterol * entry.quantity) / entry.serving_size,

          sodium: (entry.sodium * entry.quantity) / entry.serving_size,
          potassium: (entry.potassium * entry.quantity) / entry.serving_size,

          dietary_fiber:
            (entry.dietary_fiber * entry.quantity) / entry.serving_size,

          sugars: (entry.sugars * entry.quantity) / entry.serving_size,
          vitamin_a: (entry.vitamin_a * entry.quantity) / entry.serving_size,
          vitamin_c: (entry.vitamin_c * entry.quantity) / entry.serving_size,
          calcium: (entry.calcium * entry.quantity) / entry.serving_size,
          iron: (entry.iron * entry.quantity) / entry.serving_size,
          glycemic_index: entry.glycemic_index,
          custom_nutrients: entry.custom_nutrients,
          serving_size: entry.serving_size,
          serving_unit: entry.serving_unit,
        })),
        calories: totalCalories,
        protein: totalProtein,
        carbs: totalCarbs,
        fat: totalFat,
        saturated_fat: totalSaturatedFat,
        polyunsaturated_fat: totalPolyunsaturatedFat,
        monounsaturated_fat: totalMonounsaturatedFat,
        trans_fat: totalTransFat,
        cholesterol: totalCholesterol,
        sodium: totalSodium,
        potassium: totalPotassium,
        dietary_fiber: totalFiber,
        sugars: totalSugars,
        vitamin_a: totalVitaminA,
        vitamin_c: totalVitaminC,
        calcium: totalCalcium,
        iron: totalIron,
        custom_nutrients: totalCustomNutrients,
        glycemic_index: getGlycemicIndexCategory(aggregatedGlycemicIndex),
      });
    }
    return mealsWithComponents;
  } catch (error) {
    log(
      'error',
      `Error getting food entry meals by date for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

async function deleteFoodEntryMeal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  foodEntryMealId: any
) {
  log(
    'info',
    `deleteFoodEntryMeal in foodEntryService: authenticatedUserId: ${authenticatedUserId}, foodEntryMealId: ${foodEntryMealId}`
  );
  try {
    // foodRepository.deleteFoodEntryComponentsByFoodEntryMealId will be called due to ON DELETE CASCADE
    // on the food_entries.food_entry_meal_id foreign key.
    const success = await foodEntryMealRepository.deleteFoodEntryMeal(
      foodEntryMealId,
      authenticatedUserId
    );
    if (!success) {
      throw new Error('Food entry meal not found or not authorized to delete.');
    }
    return { message: 'Food entry meal deleted successfully.' };
  } catch (error) {
    log(
      'error',
      `Error deleting food entry meal ${foodEntryMealId} for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

// Helpers for CSV Export
const translateMealType = (meal: string, locale: string) => {
  if (!meal) return '';
  const isFr = locale.startsWith('fr');
  if (isFr) {
    const mapFr: Record<string, string> = {
      breakfast: 'Petit-déjeuner',
      lunch: 'Déjeuner',
      dinner: 'Dîner',
      snacks: 'Collations',
    };
    return mapFr[meal?.toLowerCase()] || meal;
  } else {
    const mapEn: Record<string, string> = {
      breakfast: 'Breakfast',
      lunch: 'Lunch',
      dinner: 'Dinner',
      snacks: 'Snacks',
    };
    return mapEn[meal?.toLowerCase()] || meal;
  }
};

const formatLocalizedNumber = (num: number | string, locale: string) => {
  if (num === null || num === undefined || num === '') return '';
  const isFr = locale.startsWith('fr');
  return isFr ? String(num).replace('.', ',') : String(num);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formatDateLocalized = (dateInput: any, locale: string) => {
  try {
    const isFr = locale.startsWith('fr');
    const dateStr = getDayString(dateInput); // robust parsing
    const [year, month, day] = dateStr.split('-');
    return isFr ? `${day}/${month}/${year}` : `${year}-${month}-${day}`;
  } catch {
    return String(dateInput);
  }
};

const getCSVLabels = (locale: string) => {
  const isFr = locale.startsWith('fr');
  return {
    SUMMARY_ROW: isFr ? 'BILAN DU JOUR' : 'DAILY SUMMARY',
    TOTAL_CONSUMED: isFr ? 'Total Consommé' : 'Total Consumed',
    DAILY_GOALS: isFr ? 'Objectifs du jour' : 'Daily Goals',
    EXERCISE_CALORIES: isFr
      ? 'Calories Brûlées (Exercices)'
      : 'Burned Calories (Exercises)',
    WATER_CONSUMED: isFr ? 'Eau Consommée' : 'Water Consumed',
    DRINK_DETAIL: isFr ? 'Boisson' : 'Drink',
    DRINK_TIME: isFr ? 'Heure' : 'Time',
  };
};

function getDayString(dateInput: string | number | Date | unknown): string {
  if (
    typeof dateInput === 'string' &&
    isDayString(dateInput.substring(0, 10))
  ) {
    return dateInput.substring(0, 10);
  }
  const d = new Date(dateInput as string | number | Date);
  if (isNaN(d.getTime())) return String(dateInput);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function exportAllDiaryEntriesToCSVStream(
  userId: string,
  res: express.Response,
  delimiter: string = ';',
  locale: string = 'fr'
) {
  log(
    'info',
    `exportAllDiaryEntriesToCSVStream: Started for user ${userId} with delimiter '${delimiter}'`
  );

  const BATCH_SIZE = 500;
  let offset = 0;
  let hasMore = true;
  let isFirstBatch = true;

  // State for daily summaries
  let currentDateProcessed: string | null = null;

  const isFr = locale.startsWith('fr');
  const CSV_LABELS = getCSVLabels(locale);

  const baseHeaders = isFr
    ? [
        'Date',
        'Type de repas',
        "Nom de l'aliment",
        'Marque',
        'Quantité Consommée',
        'Unité',
        'Calories (kcal)',
        'Protéines (g)',
        'Glucides (g)',
        'Lipides (g)',
        'Gras Saturés (g)',
        'Fibres (g)',
        'Sucres (g)',
        'Sodium (mg)',
        'Cholestérol (mg)',
        'Eau (ml)',
        'Nom du Repas',
        'Heure',
      ]
    : [
        'Date',
        'Meal Type',
        'Food Name',
        'Brand',
        'Quantity Consumed',
        'Unit',
        'Calories (kcal)',
        'Protein (g)',
        'Carbs (g)',
        'Fat (g)',
        'Saturated Fat (g)',
        'Fiber (g)',
        'Sugars (g)',
        'Sodium (mg)',
        'Cholesterol (mg)',
        'Water (ml)',
        'Meal Name',
        'Time',
      ];

  try {
    // Write BOM for Excel UTF-8
    res.write('\ufeff');

    // Fetch all historical goals ONCE (O(1) query instead of N+1)
    const historicalGoals = await goalRepository.getAllHistoricalGoals(userId);
    const getGoalForDate = (dateStr: string) => {
      // First, find the most recent goal with a specific date that is <= dateStr
      // Skip goals with NULL goal_date (they are default/fallback goals)
      const datedGoal = historicalGoals.find(
        (g: { goal_date: string | Date | null }) => {
          if (!g.goal_date) return false; // Skip NULL-dated default goals
          const gDate = getDayString(g.goal_date);
          return gDate <= dateStr;
        }
      );
      if (datedGoal) return datedGoal;

      // Fallback: use the default goal (NULL goal_date) or the oldest goal
      return (
        historicalGoals.find(
          (g: { goal_date: string | Date | null }) => !g.goal_date
        ) ||
        historicalGoals[historicalGoals.length - 1] ||
        null
      );
    };

    // Fetch user custom nutrients ONCE
    const userCustomNutrients =
      await customNutrientService.getCustomNutrients(userId);

    while (hasMore) {
      const batch = await foodRepository.getFoodEntriesBatch(
        userId,
        BATCH_SIZE,
        offset
      );

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      const uniqueDates: string[] = Array.from(
        new Set(
          batch.map((e: { entry_date: string | Date }) =>
            getDayString(e.entry_date)
          )
        )
      );

      // Pre-fetch summaries for all unique dates in the current batch (O(1) batch queries instead of N+1 loop)
      const minDate = uniqueDates.reduce(
        (min, cur) => (cur < min ? cur : min),
        uniqueDates[0]
      );
      const maxDate = uniqueDates.reduce(
        (max, cur) => (cur > max ? cur : max),
        uniqueDates[0]
      );

      const [
        nutritionSummaries,
        waterEntries,
        exerciseEntries,
        waterIntakeLogs,
      ] = await Promise.all([
        foodRepository.getDailyNutritionSummariesByDates(userId, uniqueDates),
        measurementRepository.getWaterIntakesByDates(userId, uniqueDates),
        reportRepository.getExerciseEntries(
          userId,
          minDate,
          maxDate,
          null,
          null,
          null
        ),
        measurementRepository.getWaterIntakeLogsByDates(userId, uniqueDates),
      ]);

      const summariesCache = new Map();

      for (const dateStr of uniqueDates) {
        const nutrition =
          nutritionSummaries.find(
            (n: { entry_date: string | Date }) =>
              getDayString(n.entry_date) === dateStr
          ) || null;
        const water = waterEntries.find(
          (w: { entry_date: string | Date; water_ml: number | string }) =>
            getDayString(w.entry_date) === dateStr
        );
        const waterTotal = parseFloat(String(water?.water_ml)) || 0;

        let caloriesBurned = 0;
        exerciseEntries.forEach(
          (ex: {
            entry_date: string | Date;
            calories_burned: number | string;
          }) => {
            if (getDayString(ex.entry_date) === dateStr) {
              caloriesBurned += Number(ex.calories_burned) || 0;
            }
          }
        );

        const drinkLogs = waterIntakeLogs.filter(
          (l: { entry_date: string | Date }) =>
            getDayString(l.entry_date) === dateStr
        );

        summariesCache.set(dateStr, {
          nutrition,
          goal: getGoalForDate(dateStr),
          waterTotal,
          caloriesBurned,
          drinkLogs,
        });
      }

      const rowsToExport = [];

      for (const entry of batch) {
        const dateStr = getDayString(entry.entry_date);

        // Did the date change? Insert the summary for the PREVIOUS date
        if (currentDateProcessed !== null && currentDateProcessed !== dateStr) {
          const sumData = summariesCache.get(currentDateProcessed);
          if (sumData) {
            const sumDateFormatted = formatDateLocalized(
              currentDateProcessed,
              locale
            );

            const sumRow1: Record<string, string> = {
              [baseHeaders[0]]: sumDateFormatted,
              [baseHeaders[1]]: CSV_LABELS.SUMMARY_ROW,
              [baseHeaders[2]]: CSV_LABELS.TOTAL_CONSUMED,
              [baseHeaders[3]]: '',
              [baseHeaders[4]]: '',
              [baseHeaders[5]]: '',
              [baseHeaders[6]]: formatLocalizedNumber(
                (Number(sumData.nutrition?.total_calories) || 0).toFixed(1),
                locale
              ),
              [baseHeaders[7]]: formatLocalizedNumber(
                (Number(sumData.nutrition?.total_protein) || 0).toFixed(1),
                locale
              ),
              [baseHeaders[8]]: formatLocalizedNumber(
                (Number(sumData.nutrition?.total_carbs) || 0).toFixed(1),
                locale
              ),
              [baseHeaders[9]]: formatLocalizedNumber(
                (Number(sumData.nutrition?.total_fat) || 0).toFixed(1),
                locale
              ),
              [baseHeaders[10]]: '',
              [baseHeaders[11]]: formatLocalizedNumber(
                (Number(sumData.nutrition?.total_dietary_fiber) || 0).toFixed(
                  1
                ),
                locale
              ),
              [baseHeaders[12]]: '',
              [baseHeaders[13]]: '',
              [baseHeaders[14]]: '',
              [baseHeaders[15]]: '',
              [baseHeaders[16]]: '',
              [baseHeaders[17]]: '',
            };

            for (const cn of userCustomNutrients) {
              const val = sumData.nutrition?.total_custom_nutrients?.[cn.name];
              sumRow1[`${cn.name} (${cn.unit})`] = val
                ? formatLocalizedNumber((Number(val) || 0).toFixed(1), locale)
                : '0';
            }

            const sumRow2: Record<string, string> = {
              [baseHeaders[0]]: sumDateFormatted,
              [baseHeaders[1]]: CSV_LABELS.SUMMARY_ROW,
              [baseHeaders[2]]: CSV_LABELS.DAILY_GOALS,
              [baseHeaders[3]]: '',
              [baseHeaders[4]]: '',
              [baseHeaders[5]]: '',
              [baseHeaders[6]]: sumData.goal
                ? formatLocalizedNumber(
                    Number(sumData.goal.calories).toFixed(1),
                    locale
                  )
                : '',
              [baseHeaders[7]]: sumData.goal
                ? formatLocalizedNumber(
                    Number(sumData.goal.protein).toFixed(1),
                    locale
                  )
                : '',
              [baseHeaders[8]]: sumData.goal
                ? formatLocalizedNumber(
                    Number(sumData.goal.carbs).toFixed(1),
                    locale
                  )
                : '',
              [baseHeaders[9]]: sumData.goal
                ? formatLocalizedNumber(
                    Number(sumData.goal.fat).toFixed(1),
                    locale
                  )
                : '',
              [baseHeaders[10]]: '',
              [baseHeaders[11]]: '',
              [baseHeaders[12]]: '',
              [baseHeaders[13]]: '',
              [baseHeaders[14]]: '',
              [baseHeaders[15]]: '',
              [baseHeaders[16]]: '',
              [baseHeaders[17]]: '',
            };

            for (const cn of userCustomNutrients) {
              sumRow2[`${cn.name} (${cn.unit})`] = '';
            }

            const sumRow3: Record<string, string> = {
              [baseHeaders[0]]: sumDateFormatted,
              [baseHeaders[1]]: CSV_LABELS.SUMMARY_ROW,
              [baseHeaders[2]]: CSV_LABELS.EXERCISE_CALORIES,
              [baseHeaders[3]]: '',
              [baseHeaders[4]]: '',
              [baseHeaders[5]]: '',
              [baseHeaders[6]]: formatLocalizedNumber(
                sumData.caloriesBurned.toFixed(1),
                locale
              ),
              [baseHeaders[7]]: '',
              [baseHeaders[8]]: '',
              [baseHeaders[9]]: '',
              [baseHeaders[10]]: '',
              [baseHeaders[11]]: '',
              [baseHeaders[12]]: '',
              [baseHeaders[13]]: '',
              [baseHeaders[14]]: '',
              [baseHeaders[15]]: '',
              [baseHeaders[16]]: '',
              [baseHeaders[17]]: '',
            };

            for (const cn of userCustomNutrients) {
              sumRow3[`${cn.name} (${cn.unit})`] = '';
            }

            // Individual drink detail rows
            const drinkDetailRows: Record<string, string>[] = [];
            if (sumData.drinkLogs && sumData.drinkLogs.length > 0) {
              for (const drink of sumData.drinkLogs) {
                const drinkTime = drink.logged_at
                  ? new Date(drink.logged_at).toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })
                  : '';
                const drinkLabel = drink.container_name
                  ? `${CSV_LABELS.DRINK_DETAIL}: ${drink.container_name}`
                  : CSV_LABELS.DRINK_DETAIL;
                const drinkRow: Record<string, string> = {
                  [baseHeaders[0]]: sumDateFormatted,
                  [baseHeaders[1]]: CSV_LABELS.SUMMARY_ROW,
                  [baseHeaders[2]]: drinkLabel,
                  [baseHeaders[3]]: '',
                  [baseHeaders[4]]: '',
                  [baseHeaders[5]]: '',
                  [baseHeaders[6]]: '',
                  [baseHeaders[7]]: '',
                  [baseHeaders[8]]: '',
                  [baseHeaders[9]]: '',
                  [baseHeaders[10]]: '',
                  [baseHeaders[11]]: '',
                  [baseHeaders[12]]: '',
                  [baseHeaders[13]]: '',
                  [baseHeaders[14]]: '',
                  [baseHeaders[15]]: formatLocalizedNumber(
                    drink.water_ml,
                    locale
                  ),
                  [baseHeaders[16]]: '',
                  [baseHeaders[17]]: drinkTime,
                };
                for (const cn of userCustomNutrients) {
                  drinkRow[`${cn.name} (${cn.unit})`] = '';
                }
                drinkDetailRows.push(drinkRow);
              }
            }

            const sumRow4: Record<string, string> = {
              [baseHeaders[0]]: sumDateFormatted,
              [baseHeaders[1]]: CSV_LABELS.SUMMARY_ROW,
              [baseHeaders[2]]: CSV_LABELS.WATER_CONSUMED,
              [baseHeaders[3]]: '',
              [baseHeaders[4]]: '',
              [baseHeaders[5]]: '',
              [baseHeaders[6]]: '',
              [baseHeaders[7]]: '',
              [baseHeaders[8]]: '',
              [baseHeaders[9]]: '',
              [baseHeaders[10]]: '',
              [baseHeaders[11]]: '',
              [baseHeaders[12]]: '',
              [baseHeaders[13]]: '',
              [baseHeaders[14]]: '',
              [baseHeaders[15]]: formatLocalizedNumber(
                sumData.waterTotal,
                locale
              ),
              [baseHeaders[16]]: '',
              [baseHeaders[17]]: '',
            };

            for (const cn of userCustomNutrients) {
              sumRow4[`${cn.name} (${cn.unit})`] = '';
            }

            rowsToExport.push(
              sumRow1,
              sumRow2,
              sumRow3,
              ...drinkDetailRows,
              sumRow4
            );
          }
        }

        currentDateProcessed = dateStr;

        const scale =
          entry.serving_size && entry.serving_size > 0
            ? entry.quantity / entry.serving_size
            : 1;

        // Regular food entry
        const entryRow: Record<string, string> = {
          [baseHeaders[0]]: formatDateLocalized(entry.entry_date, locale),
          [baseHeaders[1]]: translateMealType(entry.meal_type || '', locale),
          [baseHeaders[2]]: entry.food_name || '',
          [baseHeaders[3]]: entry.brand_name || '',
          [baseHeaders[4]]: formatLocalizedNumber(entry.quantity, locale),
          [baseHeaders[5]]: entry.unit || '',
          [baseHeaders[6]]: entry.calories
            ? formatLocalizedNumber((entry.calories * scale).toFixed(1), locale)
            : '0',
          [baseHeaders[7]]: entry.protein
            ? formatLocalizedNumber((entry.protein * scale).toFixed(1), locale)
            : '0',
          [baseHeaders[8]]: entry.carbs
            ? formatLocalizedNumber((entry.carbs * scale).toFixed(1), locale)
            : '0',
          [baseHeaders[9]]: entry.fat
            ? formatLocalizedNumber((entry.fat * scale).toFixed(1), locale)
            : '0',
          [baseHeaders[10]]: entry.saturated_fat
            ? formatLocalizedNumber(
                (entry.saturated_fat * scale).toFixed(1),
                locale
              )
            : '0',
          [baseHeaders[11]]: entry.dietary_fiber
            ? formatLocalizedNumber(
                (entry.dietary_fiber * scale).toFixed(1),
                locale
              )
            : '0',
          [baseHeaders[12]]: entry.sugars
            ? formatLocalizedNumber((entry.sugars * scale).toFixed(1), locale)
            : '0',
          [baseHeaders[13]]: entry.sodium
            ? formatLocalizedNumber((entry.sodium * scale).toFixed(1), locale)
            : '0',
          [baseHeaders[14]]: entry.cholesterol
            ? formatLocalizedNumber(
                (entry.cholesterol * scale).toFixed(1),
                locale
              )
            : '0',
          [baseHeaders[15]]: '',
          [baseHeaders[16]]: entry.meal_name || '',
          [baseHeaders[17]]: '',
        };

        for (const cn of userCustomNutrients) {
          const val = entry.custom_nutrients?.[cn.name];
          entryRow[`${cn.name} (${cn.unit})`] = val
            ? formatLocalizedNumber((Number(val) * scale).toFixed(1), locale)
            : '0';
        }

        rowsToExport.push(entryRow);
      }

      // Parse to CSV chunk
      const csvChunk = Papa.unparse(rowsToExport, {
        header: isFirstBatch,
        delimiter: delimiter, // configurable
        quotes: true, // Forces double quotes around all fields
      });

      // Write chunk to stream
      res.write(csvChunk + '\n');

      isFirstBatch = false;
      offset += BATCH_SIZE;
      hasMore = batch.length === BATCH_SIZE;
    }

    // Print summary for the VERY LAST date processed
    if (currentDateProcessed !== null) {
      const lastSummary = await foodRepository.getDailyNutritionSummary(
        userId,
        currentDateProcessed
      );
      const water = await measurementRepository.getWaterIntakeByDate(
        userId,
        currentDateProcessed
      );
      const exEntries = await reportRepository.getExerciseEntries(
        userId,
        currentDateProcessed,
        currentDateProcessed,
        null,
        null,
        null
      );

      let caloriesBurned = 0;
      exEntries.forEach(
        (ex: {
          entry_date: string | Date;
          calories_burned: number | string;
        }) => {
          caloriesBurned += Number(ex.calories_burned) || 0;
        }
      );

      const lastDateDrinkLogs =
        await measurementRepository.getWaterIntakeLogsByDates(userId, [
          currentDateProcessed,
        ]);

      const sumData = {
        nutrition: lastSummary,
        goal: getGoalForDate(currentDateProcessed),
        waterTotal: parseFloat(String(water?.water_ml)) || 0,
        caloriesBurned: caloriesBurned,
        drinkLogs: lastDateDrinkLogs,
      };

      if (sumData) {
        const sumDateFormatted = formatDateLocalized(
          currentDateProcessed,
          locale
        );

        const finalRow1: Record<string, string> = {
          [baseHeaders[0]]: sumDateFormatted,
          [baseHeaders[1]]: CSV_LABELS.SUMMARY_ROW,
          [baseHeaders[2]]: CSV_LABELS.TOTAL_CONSUMED,
          [baseHeaders[3]]: '',
          [baseHeaders[4]]: '',
          [baseHeaders[5]]: '',
          [baseHeaders[6]]: formatLocalizedNumber(
            (Number(sumData.nutrition?.total_calories) || 0).toFixed(1),
            locale
          ),
          [baseHeaders[7]]: formatLocalizedNumber(
            (Number(sumData.nutrition?.total_protein) || 0).toFixed(1),
            locale
          ),
          [baseHeaders[8]]: formatLocalizedNumber(
            (Number(sumData.nutrition?.total_carbs) || 0).toFixed(1),
            locale
          ),
          [baseHeaders[9]]: formatLocalizedNumber(
            (Number(sumData.nutrition?.total_fat) || 0).toFixed(1),
            locale
          ),
          [baseHeaders[10]]: '',
          [baseHeaders[11]]: formatLocalizedNumber(
            (Number(sumData.nutrition?.total_dietary_fiber) || 0).toFixed(1),
            locale
          ),
          [baseHeaders[12]]: '',
          [baseHeaders[13]]: '',
          [baseHeaders[14]]: '',
          [baseHeaders[15]]: '',
          [baseHeaders[16]]: '',
          [baseHeaders[17]]: '',
        };

        for (const cn of userCustomNutrients) {
          const val = sumData.nutrition?.total_custom_nutrients?.[cn.name];
          finalRow1[`${cn.name} (${cn.unit})`] = val
            ? formatLocalizedNumber((Number(val) || 0).toFixed(1), locale)
            : '0';
        }

        const finalRow2: Record<string, string> = {
          [baseHeaders[0]]: sumDateFormatted,
          [baseHeaders[1]]: CSV_LABELS.SUMMARY_ROW,
          [baseHeaders[2]]: CSV_LABELS.DAILY_GOALS,
          [baseHeaders[3]]: '',
          [baseHeaders[4]]: '',
          [baseHeaders[5]]: '',
          [baseHeaders[6]]: sumData.goal
            ? formatLocalizedNumber(
                Number(sumData.goal.calories).toFixed(1),
                locale
              )
            : '',
          [baseHeaders[7]]: sumData.goal
            ? formatLocalizedNumber(
                Number(sumData.goal.protein).toFixed(1),
                locale
              )
            : '',
          [baseHeaders[8]]: sumData.goal
            ? formatLocalizedNumber(
                Number(sumData.goal.carbs).toFixed(1),
                locale
              )
            : '',
          [baseHeaders[9]]: sumData.goal
            ? formatLocalizedNumber(Number(sumData.goal.fat).toFixed(1), locale)
            : '',
          [baseHeaders[10]]: '',
          [baseHeaders[11]]: '',
          [baseHeaders[12]]: '',
          [baseHeaders[13]]: '',
          [baseHeaders[14]]: '',
          [baseHeaders[15]]: '',
          [baseHeaders[16]]: '',
          [baseHeaders[17]]: '',
        };

        for (const cn of userCustomNutrients) {
          finalRow2[`${cn.name} (${cn.unit})`] = '';
        }

        const finalRow3: Record<string, string> = {
          [baseHeaders[0]]: sumDateFormatted,
          [baseHeaders[1]]: CSV_LABELS.SUMMARY_ROW,
          [baseHeaders[2]]: CSV_LABELS.EXERCISE_CALORIES,
          [baseHeaders[3]]: '',
          [baseHeaders[4]]: '',
          [baseHeaders[5]]: '',
          [baseHeaders[6]]: formatLocalizedNumber(
            sumData.caloriesBurned.toFixed(1),
            locale
          ),
          [baseHeaders[7]]: '',
          [baseHeaders[8]]: '',
          [baseHeaders[9]]: '',
          [baseHeaders[10]]: '',
          [baseHeaders[11]]: '',
          [baseHeaders[12]]: '',
          [baseHeaders[13]]: '',
          [baseHeaders[14]]: '',
          [baseHeaders[15]]: '',
          [baseHeaders[16]]: '',
          [baseHeaders[17]]: '',
        };

        for (const cn of userCustomNutrients) {
          finalRow3[`${cn.name} (${cn.unit})`] = '';
        }

        const finalRow4: Record<string, string> = {
          [baseHeaders[0]]: sumDateFormatted,
          [baseHeaders[1]]: CSV_LABELS.SUMMARY_ROW,
          [baseHeaders[2]]: CSV_LABELS.WATER_CONSUMED,
          [baseHeaders[3]]: '',
          [baseHeaders[4]]: '',
          [baseHeaders[5]]: '',
          [baseHeaders[6]]: '',
          [baseHeaders[7]]: '',
          [baseHeaders[8]]: '',
          [baseHeaders[9]]: '',
          [baseHeaders[10]]: '',
          [baseHeaders[11]]: '',
          [baseHeaders[12]]: '',
          [baseHeaders[13]]: '',
          [baseHeaders[14]]: '',
          [baseHeaders[15]]: formatLocalizedNumber(sumData.waterTotal, locale),
          [baseHeaders[16]]: '',
          [baseHeaders[17]]: '',
        };

        for (const cn of userCustomNutrients) {
          finalRow4[`${cn.name} (${cn.unit})`] = '';
        }

        // Individual drink detail rows for last date
        const finalDrinkRows: Record<string, string>[] = [];
        if (sumData.drinkLogs && sumData.drinkLogs.length > 0) {
          for (const drink of sumData.drinkLogs) {
            const drinkTime = drink.logged_at
              ? new Date(drink.logged_at).toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })
              : '';
            const drinkLabel = drink.container_name
              ? `${CSV_LABELS.DRINK_DETAIL}: ${drink.container_name}`
              : CSV_LABELS.DRINK_DETAIL;
            const drinkRow: Record<string, string> = {
              [baseHeaders[0]]: sumDateFormatted,
              [baseHeaders[1]]: CSV_LABELS.SUMMARY_ROW,
              [baseHeaders[2]]: drinkLabel,
              [baseHeaders[3]]: '',
              [baseHeaders[4]]: '',
              [baseHeaders[5]]: '',
              [baseHeaders[6]]: '',
              [baseHeaders[7]]: '',
              [baseHeaders[8]]: '',
              [baseHeaders[9]]: '',
              [baseHeaders[10]]: '',
              [baseHeaders[11]]: '',
              [baseHeaders[12]]: '',
              [baseHeaders[13]]: '',
              [baseHeaders[14]]: '',
              [baseHeaders[15]]: formatLocalizedNumber(drink.water_ml, locale),
              [baseHeaders[16]]: '',
              [baseHeaders[17]]: drinkTime,
            };
            for (const cn of userCustomNutrients) {
              drinkRow[`${cn.name} (${cn.unit})`] = '';
            }
            finalDrinkRows.push(drinkRow);
          }
        }

        const finalRows = [
          finalRow1,
          finalRow2,
          finalRow3,
          ...finalDrinkRows,
          finalRow4,
        ];

        const finalChunk = Papa.unparse(finalRows, {
          header: false,
          delimiter: delimiter,
          quotes: true,
        });

        res.write(finalChunk + '\n');
      }
    }

    res.end();
    log(
      'info',
      `exportAllDiaryEntriesToCSVStream: Completed successfully for user ${userId}.`
    );
  } catch (error) {
    log(
      'error',
      `Error in exportAllDiaryEntriesToCSVStream for user ${userId}:`,
      error
    );
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error during CSV generation');
    } else {
      res.end('\nERROR: Failed to complete export.');
    }
  }
}

export { createFoodEntry };
export { deleteFoodEntry };
export { updateFoodEntry };
export { getFoodEntriesByDate };
export { getFoodEntriesByDateRange };
export { copyFoodEntries };
export { copyFoodEntriesFromYesterday };
export { copyAllFoodEntries };
export { copyAllFoodEntriesFromYesterday };
export { getDailyNutritionSummary };
export { createFoodEntryMeal };
export { updateFoodEntryMeal };
export { getFoodEntryMealWithComponents };
export { getFoodEntryMealsByDate };
export { deleteFoodEntryMeal };
export { exportAllDiaryEntriesToCSVStream };
export { copyFoodEntriesFromUser };
export { copyFoodEntriesToUser };
export { importFoodDiaryEntriesInBulk };
export default {
  createFoodEntry,
  deleteFoodEntry,
  updateFoodEntry,
  getFoodEntriesByDate,
  getFoodEntriesByDateRange,
  copyFoodEntries,
  copyFoodEntriesFromYesterday,
  copyAllFoodEntries,
  copyAllFoodEntriesFromYesterday,
  getDailyNutritionSummary,
  createFoodEntryMeal,
  updateFoodEntryMeal,
  getFoodEntryMealWithComponents,
  getFoodEntryMealsByDate,
  deleteFoodEntryMeal,
  exportAllDiaryEntriesToCSVStream,
  copyFoodEntriesFromUser,
  copyFoodEntriesToUser,
  importFoodDiaryEntriesInBulk,
};
