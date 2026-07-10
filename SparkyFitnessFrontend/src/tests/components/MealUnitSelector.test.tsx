import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MealUnitSelector from '@/pages/Foods/MealUnitSelector';
import type { Meal } from '@/types/meal';

const mockTranslations: Record<string, string> = {
  'mealUnitSelector.addTitle': 'إضافة {{mealName}} للخطة',
  'mealUnitSelector.addDescription': 'حدد الكمية اللي تبي تضيفها من الوجبة.',
  'mealUnitSelector.quantity': 'الكمية',
  'mealUnitSelector.unit': 'الوحدة',
  'mealUnitSelector.nutritionFor': 'القيم الغذائية لـ {{quantity}} {{unit}}:',
  'mealUnitSelector.addToPlan': 'إضافة للخطة',
  'common.cancel': 'إلغاء',
  'nutrition.protein': 'البروتين',
  'nutrition.carbs': 'الكربوهيدرات',
  'nutrition.fat': 'الدهون',
  'units.milliliter': 'مل',
  'units.gram': 'غ',
  'units.kcal': 'سعرة حرارية',
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const translation = mockTranslations[key] ?? key;
      return translation.replace(/{{(\w+)}}/g, (_, token: string) =>
        String(options?.[token] ?? '')
      );
    },
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'ERROR',
    energyUnit: 'kcal' as const,
    convertEnergy: (value: number) => value,
  }),
}));

jest.mock('@/utils/logging', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const meal = {
  id: 'meal-1',
  name: 'شوربة عدس',
  serving_size: 250,
  serving_unit: 'ml',
  total_servings: 4,
  foods: [
    {
      food_id: 'food-1',
      food_name: 'عدس',
      quantity: 1000,
      unit: 'ml',
      serving_size: 1000,
      serving_unit: 'ml',
      calories: 800,
      protein: 48,
      carbs: 120,
      fat: 12,
    },
  ],
} as Meal;

describe('MealUnitSelector', () => {
  it('shows Arabic units but submits the raw storage unit', () => {
    const onSelect = jest.fn();

    render(
      <MealUnitSelector
        meal={meal}
        open={true}
        onOpenChange={jest.fn()}
        onSelect={onSelect}
      />
    );

    expect(screen.getByText('إضافة شوربة عدس للخطة')).toBeInTheDocument();
    expect(screen.getByLabelText('الوحدة')).toHaveValue('مل');
    expect(screen.getByText('القيم الغذائية لـ 250 مل:')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'إضافة للخطة' }));

    expect(onSelect).toHaveBeenCalledWith(meal, 250, 'ml');
  });
});
