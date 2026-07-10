import {
  getNutrientMetadata,
  formatNutrientValue,
} from '@/utils/nutrientUtils';
import type { FoodVariant } from '@/types/food';
import { CalculatedNutrition } from '@/utils/nutritionCalculations';
import { UserCustomNutrient } from '@/types/customNutrient';
import { useTranslation } from 'react-i18next';
import { getLocalizedUnitLabel } from '@/utils/unitLocalization';

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
  const { t } = useTranslation();
  const energyUnitLabel = getLocalizedUnitLabel(energyUnit, t);
  const gramUnitLabel = getLocalizedUnitLabel('g', t);

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {visibleNutrients.map((key) => {
          if (key === 'calories') {
            return (
              <div key="calories">
                <dt className="text-sm font-medium">
                  {t('nutrition.calories')} ({energyUnitLabel})
                </dt>
                <dd className="text-lg font-medium">
                  {Math.round(
                    convertEnergy(nutrition.calories, 'kcal', energyUnit)
                  )}
                </dd>
              </div>
            );
          }

          const customNutrient = customNutrients.find((cn) => cn.name === key);
          if (customNutrient) {
            const value = nutrition.custom_nutrients?.[key] || 0;
            return (
              <div key={key}>
                <dt className="text-sm font-medium">
                  {customNutrient.name} (
                  {getLocalizedUnitLabel(customNutrient.unit, t)})
                </dt>
                <dd className="text-lg font-medium">
                  {formatNutrientValue(key, value, customNutrients)}
                </dd>
              </div>
            );
          }

          if (key in nutrition && key !== 'custom_nutrients') {
            const meta = getNutrientMetadata(key, customNutrients);
            const value = nutrition[key as keyof CalculatedNutrition] as number;
            return (
              <div key={key}>
                <dt className="text-sm font-medium">
                  {t(meta.label, { defaultValue: meta.defaultLabel })} (
                  {getLocalizedUnitLabel(meta.unit, t)})
                </dt>
                <dd className="text-lg font-medium">
                  {formatNutrientValue(key, value, customNutrients)}
                </dd>
              </div>
            );
          }

          return null;
        })}
      </dl>

      {baseVariant && (
        <div className="bg-muted p-4 rounded-lg mt-4">
          <h4 className="font-medium mb-2">
            {t('foodNutrition.baseValues', {
              size: baseVariant.serving_size,
              unit: getLocalizedUnitLabel(baseVariant.serving_unit, t),
            })}
          </h4>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">
                {t('nutrition.calories')}
              </dt>
              <dd className="font-medium">
                {Math.round(
                  convertEnergy(baseVariant.calories || 0, 'kcal', energyUnit)
                )}{' '}
                {energyUnitLabel}
              </dd>
            </div>
            {[
              {
                key: 'protein',
                label: t('nutrition.protein'),
                value: baseVariant.protein || 0,
              },
              {
                key: 'carbs',
                label: t('nutrition.carbs'),
                value: baseVariant.carbs || 0,
              },
              {
                key: 'fat',
                label: t('nutrition.fat'),
                value: baseVariant.fat || 0,
              },
            ].map((nutrient) => (
              <div key={nutrient.key}>
                <dt className="text-muted-foreground">{nutrient.label}</dt>
                <dd className="font-medium">
                  {nutrient.value} {gramUnitLabel}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
};
