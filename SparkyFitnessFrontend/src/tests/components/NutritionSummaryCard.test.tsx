import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import NutritionSummaryCard from '@/pages/Diary/NutritionSummaryCard';
import { DEFAULT_GOALS } from '@/constants/goals';

let mockShowNetCarbs = false;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue ?? _key,
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'ERROR',
    nutrientDisplayPreferences: [
      {
        view_group: 'summary',
        platform: 'desktop',
        visible_nutrients: ['carbs'],
      },
    ],
    showNetCarbs: mockShowNetCarbs,
  }),
}));

jest.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

jest.mock('@/pages/Diary/MiniNutritionTrends', () => () => (
  <div data-testid="mini-nutrition-trends" />
));

jest.mock('@/pages/Goals/EditGoalsForToday', () => () => (
  <button type="button">Edit Goals</button>
));

jest.mock('@/pages/Diary/CopyFoodEntryDialog', () => () => null);

jest.mock('@/hooks/Diary/useFoodEntries', () => ({
  useCopyAllFoodEntriesMutation: () => ({ mutate: jest.fn() }),
  useCopyAllFoodEntriesFromYesterdayMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/Settings/useNutrientGoalPreferences', () => ({
  useNutrientGoalPreferences: () => ({ data: {} }),
}));

const renderSummary = () =>
  render(
    <NutritionSummaryCard
      selectedDate="2026-05-15"
      dayTotals={{
        calories: 0,
        protein: 0,
        carbs: 30,
        fat: 0,
        dietary_fiber: 8,
      }}
      goals={{ ...DEFAULT_GOALS, carbs: 50 }}
      energyUnit="kcal"
      convertEnergy={(value) => value}
    />
  );

describe('NutritionSummaryCard net carbs summary', () => {
  beforeEach(() => {
    mockShowNetCarbs = false;
  });

  it('shows total carbohydrates by default', () => {
    renderSummary();

    expect(screen.getByText('Carbohydrates')).toBeInTheDocument();
    expect(screen.getByText('30.0g')).toBeInTheDocument();
  });

  it('shows net carbs and subtracts fiber when enabled', () => {
    mockShowNetCarbs = true;
    renderSummary();

    expect(screen.getByText('Net Carbs')).toBeInTheDocument();
    expect(screen.getByText('22.0g')).toBeInTheDocument();
    expect(screen.getByText('of 50.0g')).toBeInTheDocument();
  });
});
