import { Label } from '@/components/ui/label';
import {
  getNutrientMetadata,
  formatNutrientValue,
} from '@/utils/nutrientUtils';
import type { FoodVariant } from '@/types/food';
import { CalculatedNutrition } from '@/utils/nutritionCalculations';
import { UserCustomNutrient } from '@/types/customNutrient';
import { useTranslation } from 'react-i18next';

interface NutrientGridProps {
  nutrition: CalculatedNutrition;
  customNutrients: UserCustomNutrient[];
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (
    value: number,
    from: 'kcal' | 'kJ',
    to: 'kcal' | 'kJ'
  ) => number;
  baseVariant: FoodVariant | null | undefined;
  visibleNutrients: string[];
}

export const NutrientGrid = ({
  nutrition,
  customNutrients,
  energyUnit,
  convertEnergy,
  baseVariant,
  visibleNutrients,
}: NutrientGridProps) => {
  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal' ? 'kcal' : 'kJ';
  };
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {visibleNutrients.map((key) => {
          if (key === 'calories') {
            return (
              <div key="calories">
                <Label className="text-sm">
                  Calories ({getEnergyUnitString(energyUnit)})
                </Label>
                <div className="text-lg font-medium">
                  {Math.round(
                    convertEnergy(nutrition.calories, 'kcal', energyUnit)
                  )}
                </div>
              </div>
            );
          }

          const customNutrient = customNutrients.find((cn) => cn.name === key);
          if (customNutrient) {
            const value = nutrition.custom_nutrients?.[key] || 0;
            return (
              <div key={key}>
                <Label className="text-sm">
                  {customNutrient.name} ({customNutrient.unit})
                </Label>
                <div className="text-lg font-medium">
                  {formatNutrientValue(key, value, customNutrients)}
                </div>
              </div>
            );
          }

          if (key in nutrition && key !== 'custom_nutrients') {
            const meta = getNutrientMetadata(key, customNutrients);
            const value = nutrition[key as keyof CalculatedNutrition] as number;
            return (
              <div key={key}>
                <Label className="text-sm">
                  {t(meta.label, { defaultValue: meta.defaultLabel })} (
                  {meta.unit})
                </Label>
                <div className="text-lg font-medium">
                  {formatNutrientValue(key, value, customNutrients)}
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>

      {baseVariant && (
        <div className="bg-muted p-4 rounded-lg mt-4">
          <h4 className="font-medium mb-2">
            Base Values (per {baseVariant.serving_size}{' '}
            {baseVariant.serving_unit}):
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              {Math.round(
                convertEnergy(baseVariant.calories || 0, 'kcal', energyUnit)
              )}{' '}
              {getEnergyUnitString(energyUnit)}
            </div>
            <div>{baseVariant.protein || 0}g protein</div>
            <div>{baseVariant.carbs || 0}g carbs</div>
            <div>{baseVariant.fat || 0}g fat</div>
          </div>
        </div>
      )}
    </div>
  );
};
