import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LogMealDialog from '@/pages/Diary/LogMealDialog';
import type { Meal } from '@/types/meal';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      if (key === 'mealLogging.title') {
        return `تسجيل وجبة «${options?.['name']}»`;
      }
      if (key === 'mealLogging.description') {
        return 'راجع الكمية والمكونات قبل ما تضيف الوجبة ليومياتك.';
      }
      return key;
    },
  }),
}));

jest.mock('@/components/MealBuilder', () => () => <div>meal builder</div>);

const meal = {
  id: 'meal-1',
  name: 'كبسة دجاج',
  foods: [],
} as unknown as Meal;

describe('LogMealDialog', () => {
  it('frames meal logging in natural Arabic', () => {
    render(
      <LogMealDialog
        mealTemplate={meal}
        open
        onOpenChange={jest.fn()}
        date="2026-07-10"
        mealType="lunch"
      />
    );

    expect(screen.getByText('تسجيل وجبة «كبسة دجاج»')).toBeInTheDocument();
    expect(
      screen.getByText('راجع الكمية والمكونات قبل ما تضيف الوجبة ليومياتك.')
    ).toBeInTheDocument();
  });
});
