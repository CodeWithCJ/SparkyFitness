import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import { useMeal } from '@/hooks/Foods/useMeals';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  getNutrientMetadata,
  formatNutrientValue,
} from '@/utils/nutrientUtils';
import type { MealFood } from '@/types/meal';
import { getLocalizedUnitLabel } from '@/utils/unitLocalization';

interface LinkedMealPreviewDialogProps {
  mealId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PREVIEW_NUTRIENTS = ['calories', 'protein', 'carbs', 'fat'] as const;

// Read-only quick view of a linked sub-meal's identity and ingredient list,
// opened from the "Linked meal" badge in MealBuilder. Intentionally not a
// full MealBuilder instance (no editing) to avoid recursive-editor complexity
// and to keep this self-contained (no app-wide deep-link route exists yet).
const LinkedMealPreviewDialog = ({
  mealId,
  open,
  onOpenChange,
}: LinkedMealPreviewDialogProps) => {
  const { t } = useTranslation();
  const { energyUnit, convertEnergy } = usePreferences();
  const { data: meal, isLoading } = useMeal(mealId ?? undefined, open);
  const localizedEnergyUnit = getLocalizedUnitLabel(energyUnit, t);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {meal?.name ||
              t('mealBuilder.linkedMealPreviewTitle', 'Linked meal')}
          </DialogTitle>
          <DialogDescription>
            {meal?.description ||
              t(
                'mealBuilder.linkedMealPreviewDescription',
                'Read-only preview of this sub-meal.'
              )}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <p className="text-muted-foreground text-sm">
            {t('common.loading', 'Loading...')}
          </p>
        )}

        {meal && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('mealBuilder.linkedMealServingInfo', {
                servingSize: meal.serving_size,
                servingUnit: getLocalizedUnitLabel(
                  meal.serving_unit || 'serving',
                  t
                ),
                totalServings: meal.total_servings,
                defaultValue: `Yields {{totalServings}} × {{servingSize}} {{servingUnit}}`,
              })}
            </p>
            <div className="space-y-1">
              {(meal.foods || []).map((component: MealFood, idx: number) => {
                const scale =
                  component.quantity / (component.serving_size || 1);
                return (
                  <div
                    key={idx}
                    className="flex flex-col gap-1 border-b py-2 text-sm last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span>
                      {component.item_type === 'meal'
                        ? component.child_meal_name
                        : component.food_name}
                    </span>
                    <span className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                      {PREVIEW_NUTRIENTS.map((key) => {
                        const meta = getNutrientMetadata(key);
                        const val = (component[key] as number) || 0;
                        const displayVal =
                          key === 'calories'
                            ? Math.round(
                                convertEnergy(val * scale, 'kcal', energyUnit)
                              )
                            : formatNutrientValue(key, val * scale, []);
                        const label = t(meta.label, meta.defaultLabel);
                        const unit =
                          key === 'calories'
                            ? localizedEnergyUnit
                            : getLocalizedUnitLabel(meta.unit, t);
                        return (
                          <span key={key} className={meta.color}>
                            {label}: {displayVal} {unit}
                          </span>
                        );
                      })}
                    </span>
                  </div>
                );
              })}
              {(meal.foods || []).length === 0 && (
                <p className="py-2 text-sm text-muted-foreground">
                  {t(
                    'mealBuilder.linkedMealNoIngredients',
                    'No ingredients in this meal.'
                  )}
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LinkedMealPreviewDialog;
