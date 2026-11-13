import { useTranslation } from 'react-i18next';
import type { RecipeImportMapping } from '@workspace/shared';
import { useRecipeImportNutrition } from '@/hooks/Foods/useRecipeImportQueries';
import { usePreferences } from '@/contexts/PreferencesContext';
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
  const { totals, resolved, complete } = useRecipeImportNutrition(mappings);
  const { energyUnit, convertEnergy, getEnergyUnitString } = usePreferences();
  if (isActingOnBehalf || mappings.length === 0) return null;
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
      {complete && resolved === ingredientCount ? (
        <p>
          {t(
            'recipeImport.totalEnergyNutrition',
            '{{calories}} {{energyUnit}} · P {{protein}} g · C {{carbs}} g · F {{fat}} g',
            {
              energyUnit: getEnergyUnitString(energyUnit),
              ...Object.fromEntries(
                nutrients.map((key) => [
                  key,
                  (key === 'calories'
                    ? convertEnergy(totals[key], 'kcal', energyUnit)
                    : totals[key]
                  ).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  }),
                ])
              ),
            }
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
