import { UserCustomNutrient } from '@/types/customNutrient';
import { FoodVariant } from '@/types/food';
import { getGridClass } from '@/utils/layout';

export const NutrientGrid = ({
  food,
  visibleNutrients,
  energyUnit,
  convertEnergy,
  getEnergyUnitString,
  customNutrients = [],
}) => {
  const nutrientDetails: {
    [key: string]: { color: string; label: string; unit: string };
  } = {
    calories: {
      color: 'text-gray-900 dark:text-gray-100',
      label: getEnergyUnitString(energyUnit),
      unit: '',
    },
    protein: { color: 'text-blue-600', label: 'protein', unit: 'g' },
    carbs: { color: 'text-orange-600', label: 'carbs', unit: 'g' },
    fat: { color: 'text-yellow-600', label: 'fat', unit: 'g' },
    dietary_fiber: { color: 'text-green-600', label: 'fiber', unit: 'g' },
    sugar: { color: 'text-pink-500', label: 'sugar', unit: 'g' },
    sodium: { color: 'text-purple-500', label: 'sodium', unit: 'mg' },
    cholesterol: { color: 'text-indigo-500', label: 'cholesterol', unit: 'mg' },
    saturated_fat: { color: 'text-red-500', label: 'sat fat', unit: 'g' },
    trans_fat: { color: 'text-red-700', label: 'trans fat', unit: 'g' },
    potassium: { color: 'text-teal-500', label: 'potassium', unit: 'mg' },
    vitamin_a: { color: 'text-yellow-400', label: 'vit a', unit: 'mcg' },
    vitamin_c: { color: 'text-orange-400', label: 'vit c', unit: 'mg' },
    iron: { color: 'text-gray-500', label: 'iron', unit: 'mg' },
    calcium: { color: 'text-blue-400', label: 'calcium', unit: 'mg' },
    glycemic_index: { color: 'text-purple-600', label: 'GI', unit: '' },
  };

  // Add custom nutrients to nutrientDetails
  customNutrients.forEach((cn: UserCustomNutrient) => {
    if (!nutrientDetails[cn.name]) {
      nutrientDetails[cn.name] = {
        color: 'text-indigo-500', // Default color for custom nutrients
        label: cn.name,
        unit: cn.unit,
      };
    }
  });

  return (
    <div
      className={`grid grid-cols-2 ${getGridClass(visibleNutrients.length)} gap-2 text-sm text-gray-600`}
    >
      {visibleNutrients.map((nutrient) => {
        const details = nutrientDetails[nutrient];
        if (!details) return null;

        const digits = nutrient === 'calories' ? 0 : 1;

        let displayValue: number | string;
        if (nutrient === 'calories') {
          const kcalValue = Number(
            (food?.[nutrient as keyof FoodVariant] as number) || 0
          );
          displayValue = Math.round(
            convertEnergy(kcalValue, 'kcal', energyUnit)
          );
        } else if (nutrient === 'glycemic_index') {
          displayValue = food?.glycemic_index || 'None';
        } else {
          let value = Number(food?.[nutrient as keyof FoodVariant] as number);

          if (isNaN(value) && food?.custom_nutrients) {
            const customVal = food.custom_nutrients[nutrient];
            if (customVal !== undefined) {
              value = Number(customVal);
            }
          }

          displayValue = (value || 0).toFixed(digits);
        }

        return (
          <div key={nutrient} className="whitespace-nowrap">
            <span className={`font-medium ${details.color}`}>
              {displayValue}
              {details.unit}
            </span>{' '}
            {details.label}
          </div>
        );
      })}
    </div>
  );
};
