import { Label } from '@/components/ui/label';
import {
  getNutrientMetadata,
  formatNutrientValue,
} from '@/utils/nutrientUtils';
import type { FoodVariant } from '@/types/food';
import { CalculatedNutrition } from '@/utils/nutritionCalculations';
import { UserCustomNutrient } from '@/types/customNutrient';

interface NutrientGridProps {
  nutrition: CalculatedNutrition;
  customNutrients: UserCustomNutrient[];
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (
    value: number,
    from: 'kcal' | 'kJ',
    to: 'kcal' | 'kJ'
  ) => number;
  baseVariant: FoodVariant | null;
}

export const NutrientGrid = ({
  nutrition,
  customNutrients,
  energyUnit,
  convertEnergy,
  baseVariant,
}: NutrientGridProps) => {
  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal' ? 'kcal' : 'kJ';
  };

  const renderNutrientBlock = (
    keys: Array<keyof CalculatedNutrition>,
    customNutrientList: UserCustomNutrient[]
  ) => {
    return keys.map((key) => {
      const meta = getNutrientMetadata(key as string, customNutrientList);
      if (key === 'custom_nutrients') return null;

      const value = nutrition[key] as number;

      return (
        <div key={key}>
          <Label className="text-sm">
            {meta.label} ({meta.unit})
          </Label>
          <div className="text-lg font-medium">
            {formatNutrientValue(key as string, value, customNutrientList)}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium mb-3">Macronutrients</h4>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <Label className="text-sm">
              Calories ({getEnergyUnitString(energyUnit)})
            </Label>
            <div className="text-lg font-medium">
              {Math.round(
                convertEnergy(nutrition.calories, 'kcal', energyUnit)
              )}
            </div>
          </div>
          {renderNutrientBlock(['protein', 'carbs', 'fat'], customNutrients)}
        </div>
      </div>

      <div>
        <h4 className="font-medium mb-3">Fat Breakdown</h4>
        <div className="grid grid-cols-4 gap-4">
          {renderNutrientBlock(
            [
              'saturated_fat',
              'polyunsaturated_fat',
              'monounsaturated_fat',
              'trans_fat',
            ],
            customNutrients
          )}
        </div>
      </div>

      <div>
        <h4 className="font-medium mb-3">Minerals & Other Nutrients</h4>
        <div className="grid grid-cols-4 gap-4">
          {renderNutrientBlock(
            ['cholesterol', 'sodium', 'potassium', 'dietary_fiber'],
            customNutrients
          )}
        </div>
      </div>

      <div>
        <h4 className="font-medium mb-3">Sugars & Vitamins</h4>
        <div className="grid grid-cols-4 gap-4">
          {renderNutrientBlock(
            ['sugars', 'vitamin_a', 'vitamin_c', 'calcium'],
            customNutrients
          )}
        </div>
      </div>

      <div>
        <div className="grid grid-cols-1 gap-4">
          {renderNutrientBlock(['iron'], customNutrients)}
        </div>
      </div>

      {customNutrients.length > 0 && nutrition.custom_nutrients && (
        <div>
          <h4 className="font-medium mb-3">Custom Nutrients</h4>
          <div className="grid grid-cols-4 gap-4">
            {customNutrients.map((nutrient) => (
              <div key={nutrient.id}>
                <Label className="text-sm">
                  {nutrient.name} ({nutrient.unit})
                </Label>
                <div className="text-lg font-medium">
                  {formatNutrientValue(
                    nutrient.name,
                    nutrition.custom_nutrients[nutrient.name] || 0,
                    customNutrients
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {baseVariant && (
        <div className="bg-muted p-4 rounded-lg">
          <h4 className="font-medium mb-2">
            Base Values (per {baseVariant.serving_size}{' '}
            {baseVariant.serving_unit}):
          </h4>
          <div className="grid grid-cols-4 gap-4 text-sm">
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
