import { createHash } from 'node:crypto';
import {
  getConversionFactor,
  FOOD_VARIANT_NUTRIENT_FIELDS,
  roundMealServingValue,
  recipeImportNutrientNumber as nutrientNumber,
  recipeImportSyncComparison,
  type RecipeImportNutrition,
} from '@workspace/shared';
import type { FoodVariantInput } from '../types/nutrition.js';
export { recipeImportNutrientNumber as nutrientNumber } from '@workspace/shared';

export class RecipeImportError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'RecipeImportError';
  }
}
export const RECIPE_NUTRIENTS = [
  ...FOOD_VARIANT_NUTRIENT_FIELDS,
  'water_ml',
] as const;
const REQUIRED = ['calories', 'protein', 'carbs', 'fat'] as const;
export function variantNutrition(
  variant: FoodVariantInput
): RecipeImportNutrition {
  return Object.fromEntries(
    RECIPE_NUTRIENTS.map((key) => [key, nutrientNumber(variant[key])])
  );
}
export function missingNutrients(variant: FoodVariantInput): string[] {
  return RECIPE_NUTRIENTS.filter(
    (key) => nutrientNumber(variant[key]) === null
  );
}
type RecipeNutritionItem = {
  quantity: number;
  unit: string;
  variant: FoodVariantInput;
};
export function calculateRecipeNutrition(
  items: ReadonlyArray<RecipeNutritionItem>
): RecipeImportNutrition {
  return calculateRecipeNutritionDetails(items).nutrition;
}
export function calculateRecipeNutritionDetails(
  items: ReadonlyArray<RecipeNutritionItem>
) {
  if (!items.length)
    throw new RecipeImportError(
      422,
      'INCOMPLETE_MAPPING',
      'Map every recipe ingredient before saving.'
    );
  const totals: RecipeImportNutrition = Object.fromEntries(
    RECIPE_NUTRIENTS.map((key) => [key, null])
  );
  const coverage: Record<string, { known: number; total: number }> =
    Object.fromEntries(
      RECIPE_NUTRIENTS.map((key) => [key, { known: 0, total: items.length }])
    );
  for (const item of items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0)
      throw new RecipeImportError(
        422,
        'INCOMPLETE_MAPPING',
        'Ingredient quantity must be positive.'
      );
    const size = nutrientNumber(item.variant.serving_size);
    if (
      !size ||
      REQUIRED.some((key) => nutrientNumber(item.variant[key]) === null)
    )
      throw new RecipeImportError(
        422,
        'INCOMPLETE_NUTRITION',
        'The selected food has incomplete nutrition. Choose a variant with calories, protein, carbohydrates and fat.'
      );
    const factor = getConversionFactor(
      item.variant.serving_unit || '',
      item.unit
    );
    if (factor === null)
      throw new RecipeImportError(
        422,
        'INCOMPATIBLE_UNIT',
        'Ingredient and food serving units are incompatible. Select a matching variant or explicitly review a quantity in its unit.'
      );
    for (const key of RECIPE_NUTRIENTS) {
      const n = nutrientNumber(item.variant[key]);
      if (n !== null) {
        totals[key] = (totals[key] ?? 0) + (n * item.quantity * factor) / size;
        coverage[key]!.known += 1;
      }
    }
  }
  if (Object.values(totals).some((n) => n !== null && !Number.isFinite(n)))
    throw new RecipeImportError(
      422,
      'INCOMPLETE_NUTRITION',
      'Calculated recipe nutrition is outside the supported range.'
    );
  return { nutrition: totals, coverage };
}
export function mealServingFields(
  servings: number,
  finishedWeightGrams?: number
) {
  if (
    !Number.isFinite(servings) ||
    servings <= 0 ||
    servings > 1e9 ||
    (finishedWeightGrams !== undefined &&
      (!Number.isFinite(finishedWeightGrams) ||
        finishedWeightGrams <= 0 ||
        finishedWeightGrams > 1e9))
  )
    throw new RecipeImportError(
      422,
      'INCOMPLETE_MAPPING',
      'Set a positive number of servings and finished weight.'
    );
  const size =
    finishedWeightGrams === undefined
      ? 1
      : roundMealServingValue(finishedWeightGrams / servings);
  if (!Number.isFinite(size) || size > 1e9)
    throw new RecipeImportError(
      422,
      'INCOMPLETE_MAPPING',
      'The finished amount per serving exceeds the supported range. Review the weight and servings.'
    );
  if (size <= 0)
    throw new RecipeImportError(
      422,
      'INCOMPLETE_MAPPING',
      'The finished amount per serving is too small. Review the weight and servings.'
    );
  return {
    serving_size: size,
    serving_unit:
      finishedWeightGrams === undefined ? ('serving' as const) : ('g' as const),
    total_servings: servings,
  };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)])
    );
  return value;
}
export function recipeFingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
export function selectCandidateIds(
  value: unknown,
  allowed: Record<string, string[]>,
  confirmed: ReadonlySet<string>
): Array<{ ingredientId: string; candidateId: string }> {
  if (!Array.isArray(value)) return [];
  const selected = new Set<string>();
  const result: Array<{ ingredientId: string; candidateId: string }> = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const { ingredientId, candidateId } = row as Record<string, unknown>;
    if (
      typeof ingredientId === 'string' &&
      typeof candidateId === 'string' &&
      !confirmed.has(ingredientId) &&
      !selected.has(ingredientId) &&
      allowed[ingredientId]?.includes(candidateId)
    ) {
      selected.add(ingredientId);
      result.push({ ingredientId, candidateId });
    }
  }
  return result;
}
export function nutritionPatch(
  totals: RecipeImportNutrition,
  servings: number
): Record<string, string> {
  mealServingFields(servings);
  const result: Record<string, string> = {};
  for (const row of recipeImportSyncComparison({
    existingNutrition: {},
    nutrition: totals,
    batchNutrition: totals,
    recipeServings: servings,
  })) {
    if (row.field !== null && row.proposed !== null)
      result[row.field] = String(row.proposed);
  }
  return result;
}
