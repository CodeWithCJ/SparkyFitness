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
                servingUnit: meal.serving_unit,
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
                    className="flex items-center justify-between text-sm border-b py-1 last:border-b-0"
                  >
                    <span>
                      {component.item_type === 'meal'
                        ? component.child_meal_name
                        : component.food_name}
                    </span>
                    <span className="flex gap-2 text-muted-foreground">
                      {PREVIEW_NUTRIENTS.map((key) => {
                        const meta = getNutrientMetadata(key);
                        const val = (component[key] as number) || 0;
                        const displayVal =
                          key === 'calories'
                            ? Math.round(
                                convertEnergy(val * scale, 'kcal', energyUnit)
                              )
                            : formatNutrientValue(key, val * scale, []);
                        return (
                          <span key={key} className={meta.color}>
                            {displayVal}
                            {key === 'calories' ? '' : meta.unit}
                          </span>
                        );
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LinkedMealPreviewDialog;
