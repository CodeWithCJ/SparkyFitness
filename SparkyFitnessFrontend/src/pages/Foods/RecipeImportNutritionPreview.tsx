import { useTranslation } from 'react-i18next';
import {
  getConversionFactor,
  type RecipeImportMapping,
} from '@workspace/shared';
import { useRecipeImportNutritionFoods } from '@/hooks/Foods/useRecipeImportQueries';
import { useActiveUser } from '@/contexts/ActiveUserContext';

const nutrients = ['calories', 'protein', 'carbs', 'fat'] as const;

export default function RecipeImportNutritionPreview({
  mappings,
  ingredientCount,
}: {
  mappings: RecipeImportMapping[];
  ingredientCount: number;
}) {
  const { t } = useTranslation();
  const { isActingOnBehalf } = useActiveUser();
  const foods = useRecipeImportNutritionFoods(mappings);
  if (isActingOnBehalf || mappings.length === 0) return null;
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  let resolved = 0;
  mappings.forEach((mapping, index) => {
    const food = foods[index]?.data;
    const variant =
      food?.variants?.find((item) => item.id === mapping.variantId) ??
      (food?.default_variant?.id === mapping.variantId
        ? food.default_variant
        : undefined);
    if (!variant) return;
    const factor = getConversionFactor(variant.serving_unit, mapping.unit);
    if (
      factor === null ||
      !(variant.serving_size > 0) ||
      nutrients.some((key) => !Number.isFinite(variant[key]))
    )
      return;
    const scale = (mapping.quantity * factor) / variant.serving_size;
    nutrients.forEach((key) => {
      totals[key] += variant[key] * scale;
    });
    resolved += 1;
  });
  return (
    <section
      className="rounded-md border bg-muted/40 p-3 space-y-1"
      aria-label={t(
        'recipeImport.nutritionSummary',
        'Whole-recipe nutrition preview'
      )}
    >
      <p className="text-sm font-medium">
        {t('recipeImport.nutritionSummary', 'Whole-recipe nutrition preview')}
      </p>
      {resolved === ingredientCount ? (
        <p>
          {t(
            'recipeImport.totalNutrition',
            '{{calories}} kcal · P {{protein}} g · C {{carbs}} g · F {{fat}} g',
            Object.fromEntries(
              nutrients.map((key) => [
                key,
                totals[key].toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                }),
              ])
            )
          )}
        </p>
      ) : (
        <p className="text-sm">
          {t(
            'recipeImport.nutritionPending',
            'Confirm all ingredients with complete nutrition and compatible units to preview recipe totals. Unknown values are not counted as zero.'
          )}
        </p>
      )}
    </section>
  );
}
