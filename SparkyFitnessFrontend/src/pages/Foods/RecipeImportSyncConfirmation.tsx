import { useTranslation } from 'react-i18next';
import {
  recipeImportSyncComparison,
  type RecipeImportSyncPreview,
  type RecipeImportSyncRow,
} from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

export default function RecipeImportSyncConfirmation({
  preview,
  loading,
  busy,
  error,
  onCancel,
  onConfirm,
  onRefresh,
}: {
  preview?: RecipeImportSyncPreview;
  loading: boolean;
  busy: boolean;
  error: Error | null;
  onCancel: () => void;
  onConfirm: () => void;
  onRefresh: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n?.resolvedLanguage ?? i18n?.language;
  const { energyUnit, convertEnergy, getEnergyUnitString } = usePreferences();
  const labels: Record<string, string> = {
    calories: t('recipeImport.syncEnergy', 'Energy'),
    protein: t('recipeImport.syncProtein', 'Protein'),
    carbs: t('recipeImport.syncCarbs', 'Carbohydrates'),
    fat: t('recipeImport.syncFat', 'Fat'),
    saturated_fat: t('recipeImport.syncSaturatedFat', 'Saturated fat'),
    trans_fat: t('recipeImport.syncTransFat', 'Trans fat'),
    unsaturated_fat: t('recipeImport.syncUnsaturatedFat', 'Unsaturated fat'),
    cholesterol: t('recipeImport.syncCholesterol', 'Cholesterol'),
    sodium: t('recipeImport.syncSodium', 'Sodium'),
    dietary_fiber: t('recipeImport.syncFiber', 'Dietary fiber'),
    sugars: t('recipeImport.syncSugars', 'Sugars'),
    potassium: t('recipeImport.syncPotassium', 'Potassium'),
    vitamin_a: t('recipeImport.syncVitaminA', 'Vitamin A'),
    vitamin_c: t('recipeImport.syncVitaminC', 'Vitamin C'),
    calcium: t('recipeImport.syncCalcium', 'Calcium'),
    iron: t('recipeImport.syncIron', 'Iron'),
    caffeine_mg: t('recipeImport.syncCaffeine', 'Caffeine'),
    alcohol_g: t('recipeImport.syncAlcohol', 'Alcohol'),
    water_ml: t('recipeImport.syncWater', 'Water'),
  };
  const rows = preview ? recipeImportSyncComparison(preview) : [];
  function format(row: RecipeImportSyncRow, value: number | null) {
    if (value === null) return '?';
    const shown =
      row.nutrient === 'calories'
        ? convertEnergy(value, 'kcal', energyUnit)
        : value;
    return `${shown.toLocaleString(locale, { maximumFractionDigits: 2 })} ${row.nutrient === 'calories' ? getEnergyUnitString(energyUnit) : row.unit}`;
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogContent className="max-h-[90vh] flex flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t('recipeImport.syncReviewTitle', 'Review nutrition sync')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'recipeImport.syncReviewDescription',
              "Review the saved meal's nutrition before replacing the recipe's nutrition in Mealie. Only nutrition is sent."
            )}
          </DialogDescription>
        </DialogHeader>
        {loading && (
          <p role="status">
            {t('recipeImport.loadingSyncPreview', 'Loading current nutrition…')}
          </p>
        )}
        {preview && !loading && (
          <div className="min-h-0 overflow-y-auto space-y-3">
            <p className="font-medium">{preview.recipeName}</p>
            <p className="text-sm">
              {t('recipeImport.syncMeal', 'Saved meal: {{name}}', {
                name: preview.mealName,
              })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t(
                'recipeImport.syncSavedValues',
                'These are saved ingredient values. To include a library correction, replace the affected ingredient using its corrected food variant, check the values, then save the meal.'
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {preview.mealSavedAt
                ? t('recipeImport.syncSavedAt', 'Last saved: {{date}}', {
                    date: new Date(preview.mealSavedAt).toLocaleString(locale),
                  })
                : t(
                    'recipeImport.syncSavedAtUnknown',
                    'Last saved time unavailable.'
                  )}
            </p>
            <p className="text-sm">
              {t('recipeImport.syncServings', 'Mealie servings: {{servings}}', {
                servings: preview.recipeServings.toLocaleString(locale),
              })}
            </p>
            {preview.sourceChanged && (
              <p
                role="alert"
                className="text-sm text-amber-700 dark:text-amber-300"
              >
                {t(
                  'recipeImport.syncSourceChanged',
                  'This recipe has changed in Mealie. Check the current recipe and serving count before confirming.'
                )}
              </p>
            )}
            <table className="w-full text-sm">
              <caption className="text-left mb-2">
                {t(
                  'recipeImport.syncPerServing',
                  'Nutrition per Mealie serving'
                )}
              </caption>
              <thead>
                <tr>
                  <th className="text-left">
                    {t('recipeImport.syncNutrient', 'Nutrient')}
                  </th>
                  <th className="text-right">
                    {t('recipeImport.syncCurrent', 'In Mealie')}
                  </th>
                  <th className="text-right">
                    {t('recipeImport.syncProposed', 'From saved meal')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((row) => row.field !== null)
                  .map((row) => (
                    <tr key={row.nutrient} className="border-t">
                      <th className="text-left py-2 font-normal">
                        {labels[row.nutrient] ?? row.nutrient}
                        {row.status === 'partial' && (
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            {t(
                              'recipeImport.syncPartial',
                              'Partial: {{known}}/{{total}} values known',
                              { known: row.known, total: row.total }
                            )}
                          </p>
                        )}
                        {row.status === 'skipped' && (
                          <p className="text-xs text-muted-foreground">
                            {t(
                              'recipeImport.syncSkippedUnknown',
                              'Skipped: no known ingredient values.'
                            )}
                          </p>
                        )}
                      </th>
                      <td className="text-right">
                        {row.previousText ?? format(row, row.previous)}
                      </td>
                      <td className="text-right font-medium">
                        {format(row, row.proposed)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="text-sm text-muted-foreground">
              {t(
                'recipeImport.syncCoverageHelp',
                'Partial sums include only known ingredient values. Skipped values stay unchanged in Mealie.'
              )}
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {rows
                .filter((row) => row.reason === 'unsupported')
                .map((row) => (
                  <li key={row.nutrient}>
                    {t(
                      'recipeImport.syncSkippedUnsupported',
                      '{{nutrient}} — not supported by Mealie.',
                      { nutrient: labels[row.nutrient] ?? row.nutrient }
                    )}
                  </li>
                ))}
            </ul>
          </div>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error.message}
          </p>
        )}
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            {t('common.cancel', 'Cancel')}
          </Button>
          {error && (
            <Button
              variant="outline"
              disabled={busy || loading}
              onClick={onRefresh}
            >
              {t('recipeImport.refreshSyncPreview', 'Refresh preview')}
            </Button>
          )}
          <Button
            disabled={!preview || loading || busy || !!error}
            onClick={onConfirm}
          >
            {busy
              ? t('recipeImport.syncing', 'Syncing nutrition…')
              : t('recipeImport.confirmSync', 'Confirm nutrition sync')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
