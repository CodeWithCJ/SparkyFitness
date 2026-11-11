import { useTranslation } from 'react-i18next';
import {
  recipeImportSyncComparison,
  type RecipeImportSyncPreview,
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
  const { t } = useTranslation();
  const { energyUnit, convertEnergy, getEnergyUnitString } = usePreferences();
  const labels = {
    calories: t('recipeImport.syncEnergy', 'Energy'),
    protein: t('recipeImport.syncProtein', 'Protein'),
    carbs: t('recipeImport.syncCarbs', 'Carbohydrates'),
    fat: t('recipeImport.syncFat', 'Fat'),
  };
  function format(nutrient: keyof typeof labels, value: number | null) {
    if (value === null) return '?';
    const shown =
      nutrient === 'calories'
        ? convertEnergy(value, 'kcal', energyUnit)
        : value;
    return `${shown.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${nutrient === 'calories' ? getEnergyUnitString(energyUnit) : 'g'}`;
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogContent>
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
          <div className="space-y-3">
            <p className="font-medium">{preview.recipeName}</p>
            <p className="text-sm">
              {t('recipeImport.syncMeal', 'Saved meal: {{name}}', {
                name: preview.mealName,
              })}
            </p>
            <p className="text-sm">
              {t('recipeImport.syncServings', 'Mealie servings: {{servings}}', {
                servings: preview.recipeServings.toLocaleString(),
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
                {recipeImportSyncComparison(preview).map((row) => (
                  <tr key={row.nutrient} className="border-t">
                    <th className="text-left py-2 font-normal">
                      {labels[row.nutrient]}
                    </th>
                    <td className="text-right">
                      {format(row.nutrient, row.previous)}
                    </td>
                    <td className="text-right font-medium">
                      {format(row.nutrient, row.proposed)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
