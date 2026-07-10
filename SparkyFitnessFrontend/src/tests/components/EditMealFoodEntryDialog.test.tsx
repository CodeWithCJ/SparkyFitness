import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import EditMealFoodEntryDialog from '@/pages/Diary/EditMealFoodEntryDialog';
import type { FoodEntryMeal } from '@/types/meal';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      if (key === 'mealLogging.editTitle') {
        return `تعديل وجبة «${options?.['name']}»`;
      }
      if (key === 'mealLogging.editDescription') {
        return 'عدّل الكمية أو المكونات، وبعدها احفظ تغييراتك.';
      }
      if (key === 'mealLogging.editScopeNotice') {
        return 'التغييرات هنا تخص هالسجل فقط، وما تعدّل قالب الوجبة الأصلي.';
      }
      return key;
    },
  }),
}));

jest.mock('@/components/MealBuilder', () => () => <div>meal builder</div>);

const entry = {
  id: 'meal-entry-1',
  name: 'سلطة الدجاج',
  foods: [],
  entry_date: '2026-07-10',
  meal_type: 'dinner',
} as unknown as FoodEntryMeal;

describe('EditMealFoodEntryDialog', () => {
  it('localizes the logged-meal editing flow', () => {
    render(
      <EditMealFoodEntryDialog
        foodEntry={entry}
        open
        onOpenChange={jest.fn()}
      />
    );

    expect(screen.getByText('تعديل وجبة «سلطة الدجاج»')).toBeInTheDocument();
    expect(
      screen.getByText('عدّل الكمية أو المكونات، وبعدها احفظ تغييراتك.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'التغييرات هنا تخص هالسجل فقط، وما تعدّل قالب الوجبة الأصلي.'
      )
    ).toBeInTheDocument();
  });
});
