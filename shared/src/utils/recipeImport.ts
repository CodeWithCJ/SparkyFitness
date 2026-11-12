import type {
  RecipeImportSuggestionResponse,
  RecipeImportSyncPreview,
  RecipeImportIngredient,
  RecipeImportMapping,
  RecipeImportSuggestedMapping,
} from '../schemas/api/RecipeImport.api.zod.ts';
import { getConversionFactor } from './servingSizeConversions.ts';

type Suggestions = RecipeImportSuggestionResponse['ingredients'];

const CORE_NUTRIENTS = ['calories', 'protein', 'carbs', 'fat'] as const;

/** Remembered choices never count as this preparation's explicit confirmations. */
export function recipeImportInitialMappings(
  ingredients: readonly RecipeImportIngredient[]
): Record<string, RecipeImportMapping> {
  return Object.fromEntries<RecipeImportMapping>(
    ingredients.flatMap((row) =>
      row.mapping && row.mappingOrigin !== 'saved'
        ? [[row.ingredientId, row.mapping] as const]
        : []
    )
  );
}
/** Older servers returned remembered choices in mapping with confirmed:true. */
export function recipeImportSavedSuggestion(
  ingredient: RecipeImportIngredient
): RecipeImportSuggestedMapping | null {
  const saved =
    ingredient.suggestedMapping ??
    (ingredient.mappingOrigin === 'saved' ? ingredient.mapping : null);
  return saved ? { ...saved, confirmed: false } : null;
}
/** Flag possible extra ingredients without inventing a food or treating preparation dimensions as ingredients. */
export function recipeImportNoteNeedsReview(note: string): boolean {
  const match = note.match(
    /^\s*(?:\d+(?:[.,]\d+)?(?:\s+\d+\s*\/\s*\d+|\s*\/\s*\d+)?|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*(?:[-–]\s*\d+\s*)?([\p{L}]+)/u
  );
  return (
    !!match &&
    !/^(?:cm|mm|inch|inches|min|mins|minute|minutes|hour|hours|hr|hrs)$/i.test(
      match[1]!
    )
  );
}

/** Mealie's writable nutrition fields; apps own the translated labels. */
export const MEALIE_NUTRITION_FIELDS = [
  {
    nutrient: 'calories',
    field: 'calories',
    sources: ['calories'],
    unit: 'kcal',
  },
  {
    nutrient: 'protein',
    field: 'proteinContent',
    sources: ['protein'],
    unit: 'g',
  },
  {
    nutrient: 'carbs',
    field: 'carbohydrateContent',
    sources: ['carbs'],
    unit: 'g',
  },
  { nutrient: 'fat', field: 'fatContent', sources: ['fat'], unit: 'g' },
  {
    nutrient: 'saturated_fat',
    field: 'saturatedFatContent',
    sources: ['saturated_fat'],
    unit: 'g',
  },
  {
    nutrient: 'trans_fat',
    field: 'transFatContent',
    sources: ['trans_fat'],
    unit: 'g',
  },
  {
    nutrient: 'cholesterol',
    field: 'cholesterolContent',
    sources: ['cholesterol'],
    unit: 'mg',
  },
  {
    nutrient: 'sodium',
    field: 'sodiumContent',
    sources: ['sodium'],
    unit: 'mg',
  },
  {
    nutrient: 'dietary_fiber',
    field: 'fiberContent',
    sources: ['dietary_fiber'],
    unit: 'g',
  },
  { nutrient: 'sugars', field: 'sugarContent', sources: ['sugars'], unit: 'g' },
  {
    nutrient: 'unsaturated_fat',
    field: 'unsaturatedFatContent',
    sources: ['polyunsaturated_fat', 'monounsaturated_fat'],
    unit: 'g',
  },
] as const;

export interface RecipeImportSyncRow {
  nutrient: string;
  field: string | null;
  unit: string;
  previous: number | null;
  previousText?: string;
  proposed: number | null;
  status: 'complete' | 'partial' | 'skipped';
  reason: 'unknown' | 'unsupported' | null;
  known: number;
  total: number;
}

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
  preview: Pick<RecipeImportSyncPreview, 'existingNutrition' | 'nutrition'> &
    Partial<
      Pick<
        RecipeImportSyncPreview,
        'batchNutrition' | 'recipeServings' | 'nutritionCoverage'
      >
    >
): RecipeImportSyncRow[] {
  const rows: RecipeImportSyncRow[] = MEALIE_NUTRITION_FIELDS.map(
    ({ nutrient, field, sources, unit }) => {
      // Prefer the batch so combined values round exactly like the actual PATCH.
      const useBatch =
        !!preview.batchNutrition &&
        !!preview.recipeServings &&
        sources.some((key) => Object.hasOwn(preview.batchNutrition!, key));
      const nutrition = useBatch ? preview.batchNutrition! : preview.nutrition;
      const values = sources.map((key) =>
        recipeImportNutrientNumber(nutrition[key])
      );
      const known = sources.reduce(
        (sum, key, index) =>
          sum +
          (preview.nutritionCoverage?.[key]?.known ??
            (values[index] !== null ? 1 : 0)),
        0
      );
      const total = sources.reduce(
        (sum, key) => sum + (preview.nutritionCoverage?.[key]?.total ?? 1),
        0
      );
      const proposed = values.every((value) => value === null)
        ? null
        : Math.round(
            (values.reduce<number>((sum, value) => sum + (value ?? 0), 0) /
              (useBatch ? preview.recipeServings! : 1)) *
              1e6
          ) / 1e6;
      const raw = preview.existingNutrition[field];
      const previous = recipeImportNutrientNumber(raw);
      return {
        nutrient,
        field,
        unit,
        previous,
        proposed,
        known,
        total,
        ...(previous === null && typeof raw === 'string' && raw.trim()
          ? { previousText: raw }
          : {}),
        status:
          proposed === null
            ? 'skipped'
            : known < total
              ? 'partial'
              : 'complete',
        reason: proposed === null ? 'unknown' : null,
      };
    }
  );
  const supported = new Set<string>(
    MEALIE_NUTRITION_FIELDS.flatMap((row) => [...row.sources])
  );
  for (const [nutrient, value] of Object.entries(preview.nutrition)) {
    if (!supported.has(nutrient) && recipeImportNutrientNumber(value) !== null)
      rows.push({
        nutrient,
        field: null,
        unit: '',
        previous: null,
        proposed: null,
        status: 'skipped',
        reason: 'unsupported',
        known: 0,
        total: 0,
      });
  }
  return rows;
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
