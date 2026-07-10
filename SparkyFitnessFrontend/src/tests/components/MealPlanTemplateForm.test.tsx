import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MealPlanTemplateForm from '@/pages/Foods/MealPlanTemplateForm';
import type { Food } from '@/types/food';
import type { MealPlanTemplate } from '@/types/meal';

const food = {
  id: 'food-1',
  name: 'بيض',
  is_custom: true,
  default_variant: {
    id: 'variant-1',
    serving_size: 1,
    serving_unit: 'piece',
    calories: 70,
    protein: 6,
    carbs: 1,
    fat: 5,
  },
} as Food;

const mockFetchQuery = jest.fn().mockResolvedValue(food);

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ fetchQuery: mockFetchQuery }),
}));

jest.mock('@/hooks/Foods/useFoods', () => ({
  foodViewOptions: () => ({ queryKey: ['food'] }),
}));

jest.mock('@/hooks/Foods/useMeals', () => ({
  mealViewOptions: () => ({ queryKey: ['meal'] }),
}));

jest.mock('@/hooks/Diary/useMealTypes', () => ({
  useMealTypes: () => ({ data: [] }),
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
  error: jest.fn(),
}));

jest.mock('@/hooks/use-toast', () => ({
  toast: jest.fn(),
}));

const translations: Record<string, string> = {
  'mealPlanTemplateForm.editTitle': 'تعديل خطة الوجبات',
  'mealPlanTemplateForm.editDescription': 'عدّل بيانات الخطة.',
  'mealPlanTemplateForm.planNameLabel': 'اسم الخطة',
  'mealPlanTemplateForm.descriptionLabel': 'الوصف',
  'mealPlanTemplateForm.startDateLabel': 'تاريخ البداية',
  'mealPlanTemplateForm.endDateLabel': 'تاريخ النهاية',
  'mealPlanTemplateForm.setActiveLabel': 'تفعيل الخطة',
  'mealPlanTemplateForm.addFoodOrMealButton': 'إضافة صنف أو وجبة',
  'mealPlanTemplateForm.editAssignment': 'تعديل كمية {{itemName}}',
  'mealPlanTemplateForm.removeAssignment': 'إزالة {{itemName}}',
  'mealPlanTemplateForm.mealTotal': 'الإجمالي',
  'mealPlanTemplateForm.dailyTotalFor': 'إجمالي {{day}}',
  'mealPlanTemplateForm.savePlan': 'حفظ الخطة',
  'common.cancel': 'إلغاء',
  'common.sunday': 'الأحد',
  'common.monday': 'الاثنين',
  'common.tuesday': 'الثلاثاء',
  'common.wednesday': 'الأربعاء',
  'common.thursday': 'الخميس',
  'common.friday': 'الجمعة',
  'common.saturday': 'السبت',
  'common.breakfast': 'الفطور',
  'common.lunch': 'الغداء',
  'common.dinner': 'العشاء',
  'common.snacks': 'الوجبات الخفيفة',
  'units.kcal': 'سعرة حرارية',
  'units.gram': 'غ',
  'units.serving': 'حصة',
  'units.piece': 'حبة',
  'nutrition.calories': 'السعرات',
  'nutrition.protein': 'البروتين',
  'nutrition.carbohydrates': 'الكربوهيدرات',
  'nutrition.fat': 'الدهون',
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOptions?: string | Record<string, unknown>) => {
      const fallback =
        typeof fallbackOrOptions === 'string'
          ? fallbackOrOptions
          : typeof fallbackOrOptions?.defaultValue === 'string'
            ? fallbackOrOptions.defaultValue
            : key;
      const options =
        typeof fallbackOrOptions === 'object' ? fallbackOrOptions : {};
      return (translations[key] ?? fallback).replace(
        /{{(\w+)}}/g,
        (_, token: string) => String(options[token] ?? '')
      );
    },
  }),
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
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
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('@/components/FoodSearch/FoodSearchDialog', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/FoodUnitSelector', () => ({
  __esModule: true,
  default: ({
    open,
    onSelect,
  }: {
    open: boolean;
    onSelect: (
      selectedFood: Food,
      quantity: number,
      unit: string,
      variant: Food['default_variant']
    ) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => onSelect(food, 2, 'piece', food.default_variant!)}
      >
        اختيار حبتين
      </button>
    ) : null,
}));

jest.mock('@/pages/Foods/MealUnitSelector', () => ({
  __esModule: true,
  default: () => null,
}));

const template = {
  id: 'plan-1',
  plan_name: 'وجبات الدوام',
  description: '',
  start_date: '2026-07-01',
  end_date: '2026-07-31',
  is_active: true,
  assignments: [
    {
      item_type: 'food',
      day_of_week: 0,
      meal_type: 'breakfast',
      food_id: 'food-1',
      food_name: 'بيض',
      variant_id: 'variant-1',
      quantity: 1,
      unit: 'piece',
    },
  ],
} as MealPlanTemplate;

describe('MealPlanTemplateForm', () => {
  it('updates an existing Arabic-visible assignment while preserving raw identifiers', async () => {
    const onSave = jest.fn();

    render(
      <MealPlanTemplateForm
        template={template}
        onSave={onSave}
        onClose={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('بيض')).toBeInTheDocument();
    });
    expect(screen.getAllByText('الفطور')).toHaveLength(7);

    fireEvent.click(screen.getByRole('button', { name: 'تعديل كمية بيض' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'اختيار حبتين' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الخطة' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        assignments: [
          expect.objectContaining({
            meal_type: 'breakfast',
            quantity: 2,
            unit: 'piece',
          }),
        ],
      })
    );
  });
});
