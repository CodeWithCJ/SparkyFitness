import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePreferences } from '@/contexts/PreferencesContext';
import { debug, info, warn } from '@/utils/logging';
import type { Meal } from '@/types/meal';
import { useTranslation } from 'react-i18next';
import { getLocalizedUnitLabel } from '@/utils/unitLocalization';

interface MealUnitSelectorProps {
  meal: Meal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (meal: Meal, quantity: number, unit: string) => void;
  initialQuantity?: number;
  initialUnit?: string;
  title?: string;
  description?: string;
  confirmLabel?: string;
}

const MealUnitSelector = ({
  meal,
  open,
  onOpenChange,
  onSelect,
  initialQuantity,
  initialUnit,
  title,
  description,
  confirmLabel,
}: MealUnitSelectorProps) => {
  const { loggingLevel, energyUnit, convertEnergy } = usePreferences();
  const { t } = useTranslation();
  debug(loggingLevel, 'MealUnitSelector component rendered.', { meal, open });

  // Default the prefilled quantity to one serving's worth (meal.serving_size),
  // matching MealBuilder. For an 8-serving meal this prefills 1.
  const [quantity, setQuantity] = useState(
    initialQuantity ?? meal?.serving_size ?? 1.0
  );
  const unit = initialUnit || meal?.serving_unit || 'serving';

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    debug(loggingLevel, 'Handling meal unit selector submit.');

    info(loggingLevel, 'Submitting meal selection:', {
      meal,
      quantity,
      unit,
    });

    onSelect(meal, quantity, unit);
    onOpenChange(false);
    setQuantity(1.0);
  };

  const calculateNutrition = () => {
    debug(loggingLevel, 'Calculating meal nutrition preview.');
    if (!meal || !meal.foods || meal.foods.length === 0) {
      warn(loggingLevel, 'calculateNutrition called with no meal foods.');
      return null;
    }

    // Calculate total nutrition for the meal based on its component foods
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    meal.foods.forEach((foodItem) => {
      const scale = foodItem.quantity / (foodItem.serving_size || 1);
      totalCalories += (foodItem.calories || 0) * scale;
      totalProtein += (foodItem.protein || 0) * scale;
      totalCarbs += (foodItem.carbs || 0) * scale;
      totalFat += (foodItem.fat || 0) * scale;
    });

    // Uniform multiplier: quantity / (serving_size × total_servings).
    // For pre-migration data where total_servings defaults to 1, this collapses
    // to quantity/serving_size — matches today's non-serving behavior.
    const mealServingSize = meal.serving_size || 1.0;
    const mealTotalServings = meal.total_servings || 1;
    const denominator = mealServingSize * mealTotalServings;
    const multiplier = denominator > 0 ? quantity / denominator : 1;

    const result = {
      calories: totalCalories * multiplier,
      protein: totalProtein * multiplier,
      carbs: totalCarbs * multiplier,
      fat: totalFat * multiplier,
    };

    debug(loggingLevel, 'Calculated meal nutrition result:', result);
    return result;
  };

  const nutrition = calculateNutrition();

  const focusAndSelect = useCallback((e: HTMLInputElement) => {
    if (e) {
      e.focus();
      e.select();
    }
  }, []);

  // Get display unit (prefer meal's serving_unit, fallback to 'serving')
  const displayUnit = meal?.serving_unit || 'serving';
  const localizedDisplayUnit = getLocalizedUnitLabel(displayUnit, t);
  const localizedEnergyUnit = getLocalizedUnitLabel(energyUnit, t);
  const gramUnit = getLocalizedUnitLabel('g', t);
  const isEditing = initialQuantity !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {title ??
              (isEditing
                ? t('mealUnitSelector.editTitle', {
                    mealName: meal?.name,
                    defaultValue: 'Edit {{mealName}}',
                  })
                : t('mealUnitSelector.addTitle', {
                    mealName: meal?.name,
                    defaultValue: 'Add {{mealName}} to meal plan',
                  }))}
          </DialogTitle>
          <DialogDescription>
            {description ??
              (isEditing
                ? t('mealUnitSelector.editDescription', {
                    mealName: meal?.name,
                    defaultValue: 'Edit the quantity for {{mealName}}.',
                  })
                : t(
                    'mealUnitSelector.addDescription',
                    'Select the quantity for this meal in your meal plan.'
                  ))}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="quantity">
                  {t('mealUnitSelector.quantity', 'Quantity')}
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0.01"
                  value={quantity}
                  ref={focusAndSelect}
                  onChange={(e) => {
                    const newQuantity = Number(e.target.value);
                    debug(loggingLevel, 'Meal quantity changed:', newQuantity);
                    setQuantity(newQuantity);
                  }}
                />
              </div>
              <div>
                <Label htmlFor="unit">
                  {t('mealUnitSelector.unit', 'Unit')}
                </Label>
                <Input
                  id="unit"
                  type="text"
                  value={localizedDisplayUnit}
                  disabled
                  className="bg-muted"
                />
              </div>
            </div>

            {nutrition && (
              <div className="bg-muted p-3 rounded-lg">
                <h4 className="font-medium mb-2">
                  {t('mealUnitSelector.nutritionFor', {
                    quantity,
                    unit: localizedDisplayUnit,
                    defaultValue: 'Nutrition for {{quantity}} {{unit}}:',
                  })}
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    {Math.round(
                      convertEnergy(nutrition.calories, 'kcal', energyUnit)
                    )}{' '}
                    {localizedEnergyUnit}
                  </div>
                  <div>
                    {t('nutrition.protein', 'Protein')}:{' '}
                    {nutrition.protein.toFixed(1)} {gramUnit}
                  </div>
                  <div>
                    {t('nutrition.carbs', 'Carbohydrates')}:{' '}
                    {nutrition.carbs.toFixed(1)} {gramUnit}
                  </div>
                  <div>
                    {t('nutrition.fat', 'Fat')}: {nutrition.fat.toFixed(1)}{' '}
                    {gramUnit}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit">
                {confirmLabel ??
                  (isEditing
                    ? t('mealUnitSelector.updateMeal', 'Update meal')
                    : t('mealUnitSelector.addToPlan', 'Add to meal plan'))}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default MealUnitSelector;
