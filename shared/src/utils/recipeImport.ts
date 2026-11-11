import type {
  RecipeImportSuggestionResponse,
  RecipeImportSyncPreview,
} from '../schemas/api/RecipeImport.api.zod.ts';
import { getConversionFactor } from './servingSizeConversions.ts';

type Suggestions = RecipeImportSuggestionResponse['ingredients'];

const CORE_NUTRIENTS = ['calories', 'protein', 'carbs', 'fat'] as const;

/** Empty or invalid provider values remain unknown; a measured zero remains zero. */
export function recipeImportNutrientNumber(value: unknown): number | null {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && !value.trim())
  )
    return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** Both clients compare the same Mealie fields with the reviewed per-serving totals. */
export function recipeImportSyncComparison(
  preview: Pick<RecipeImportSyncPreview, 'existingNutrition' | 'nutrition'>
) {
  const fields = {
    calories: 'calories',
    protein: 'proteinContent',
    carbs: 'carbohydrateContent',
    fat: 'fatContent',
  } as const;
  return CORE_NUTRIENTS.map((nutrient) => ({
    nutrient,
    previous: recipeImportNutrientNumber(
      preview.existingNutrition[fields[nutrient]]
    ),
    proposed: recipeImportNutrientNumber(preview.nutrition[nutrient]),
  }));
}

/** Current selected nutrition takes precedence over gaps from an older preview. */
export function recipeImportNutritionGaps(
  variant:
    Partial<Record<(typeof CORE_NUTRIENTS)[number], unknown>> | undefined,
  knownMissing: readonly string[]
): { missingCore: boolean; missingNutrients: string[] } {
  const missingNutrients = variant
    ? [...new Set([...CORE_NUTRIENTS, ...knownMissing])].filter((key) => {
        const value: unknown = Reflect.get(variant, key);
        return (
          typeof value !== 'number' || !Number.isFinite(value) || value < 0
        );
      })
    : [...knownMissing];
  return {
    missingCore: CORE_NUTRIENTS.some((key) => missingNutrients.includes(key)),
    missingNutrients,
  };
}

/** Preserve whole-recipe amounts only across compatible, explicit units. */
export function recipeImportInitialQuantity(
  quantity: number | null | undefined,
  fromUnit: string | null | undefined,
  toUnit: string
): number | undefined {
  const factor = fromUnit ? getConversionFactor(toUnit, fromUnit) : null;
  return quantity != null &&
    Number.isFinite(quantity) &&
    quantity > 0 &&
    factor !== null
    ? quantity * factor
    : undefined;
}

/** One matching action covers every unresolved row within the API's request bound. */
export function unresolvedRecipeIngredientBatches(
  ids: readonly string[],
  confirmed: ReadonlySet<string>
): string[][] {
  const unresolved = ids.filter((id) => !confirmed.has(id));
  return Array.from({ length: Math.ceil(unresolved.length / 20) }, (_, index) =>
    unresolved.slice(index * 20, index * 20 + 20)
  );
}

/** Read current confirmations at response time, including manual picks made during a request. */
export function mergeRecipeImportSuggestions(
  previous: Suggestions,
  incoming: Suggestions,
  confirmed: ReadonlySet<string>
): Suggestions {
  const replacing = new Set(incoming.map((row) => row.ingredientId));
  return [
    ...previous.filter((row) => !replacing.has(row.ingredientId)),
    ...incoming,
  ].filter((row) => !confirmed.has(row.ingredientId));
}
