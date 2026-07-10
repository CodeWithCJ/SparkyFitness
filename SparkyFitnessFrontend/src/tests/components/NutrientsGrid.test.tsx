import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NutrientGrid } from '@/pages/Diary/NutrientsGrid';
import type { CalculatedNutrition } from '@/utils/nutritionCalculations';
import type { FoodVariant } from '@/types/food';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) => {
      const translations: Record<string, string> = {
        'nutrition.calories': 'السعرات',
        'nutrition.protein': 'البروتين',
        'nutrition.carbs': 'الكربوهيدرات',
        'nutrition.fat': 'الدهون',
        'units.kcal': 'سعرة حرارية',
        'units.gram': 'غ',
      };

      if (key === 'foodNutrition.baseValues') {
        return `القيم الأساسية لكل ${options?.['size']} ${options?.['unit']}`;
      }

      return translations[key] ?? key;
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
}));

const nutrition = {
  calories: 420,
  protein: 30,
  carbs: 45,
  fat: 12,
} as CalculatedNutrition;

const baseVariant = {
  serving_size: 100,
  serving_unit: 'g',
  calories: 210,
  protein: 15,
  carbs: 22,
  fat: 6,
} as FoodVariant;

describe('NutrientGrid', () => {
  it('localizes nutrient labels, units, and base values', () => {
    render(
      <NutrientGrid
        nutrition={nutrition}
        customNutrients={[]}
        energyUnit="kcal"
        convertEnergy={(value) => value}
        baseVariant={baseVariant}
        visibleNutrients={['calories', 'protein']}
      />
    );

    expect(screen.getByText('السعرات (سعرة حرارية)')).toBeInTheDocument();
    expect(screen.getByText('البروتين (غ)')).toBeInTheDocument();
    expect(screen.getByText('القيم الأساسية لكل 100 غ')).toBeInTheDocument();
    expect(screen.getByText('210 سعرة حرارية')).toBeInTheDocument();
    expect(screen.getByText('15 غ')).toBeInTheDocument();
  });
});
