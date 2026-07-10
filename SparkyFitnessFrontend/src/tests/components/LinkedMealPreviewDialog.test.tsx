import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LinkedMealPreviewDialog from '@/components/LinkedMealPreviewDialog';

const mockTranslations: Record<string, string> = {
  'mealBuilder.linkedMealPreviewDescription': 'معاينة فقط لمكونات هالوجبة.',
  'mealBuilder.linkedMealServingInfo':
    'تكفي {{totalServings}} حصص، حجم الحصة {{servingSize}} {{servingUnit}}',
  'nutrition.calories': 'السعرات',
  'nutrition.protein': 'البروتين',
  'nutrition.carbohydrates': 'الكربوهيدرات',
  'nutrition.carbs': 'الكربوهيدرات',
  'nutrition.fat': 'الدهون',
  'units.milliliter': 'مل',
  'units.gram': 'غ',
  'units.kcal': 'سعرة حرارية',
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | Record<string, unknown>) => {
      const translation =
        mockTranslations[key] ?? (typeof options === 'string' ? options : key);
      const values = typeof options === 'object' ? options : {};
      return translation.replace(/{{(\w+)}}/g, (_, token: string) =>
        String(values[token] ?? '')
      );
    },
  }),
}));

jest.mock('@/hooks/Foods/useMeals', () => ({
  useMeal: () => ({
    isLoading: false,
    data: {
      id: 'meal-1',
      name: 'شوربة عدس',
      description: '',
      serving_size: 250,
      serving_unit: 'ml',
      total_servings: 4,
      foods: [
        {
          food_name: 'عدس',
          quantity: 100,
          serving_size: 100,
          calories: 120,
          protein: 9,
          carbs: 20,
          fat: 1,
        },
      ],
    },
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    energyUnit: 'kcal' as const,
    convertEnergy: (value: number) => value,
  }),
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

describe('LinkedMealPreviewDialog', () => {
  it('localizes serving and nutrient units in the preview', () => {
    render(
      <LinkedMealPreviewDialog
        mealId="meal-1"
        open={true}
        onOpenChange={jest.fn()}
      />
    );

    expect(screen.getByText('شوربة عدس')).toBeInTheDocument();
    expect(
      screen.getByText('تكفي 4 حصص، حجم الحصة 250 مل')
    ).toBeInTheDocument();
    expect(screen.getByText('السعرات: 120 سعرة حرارية')).toBeInTheDocument();
    expect(screen.getByText('البروتين: 9.0 غ')).toBeInTheDocument();
  });
});
