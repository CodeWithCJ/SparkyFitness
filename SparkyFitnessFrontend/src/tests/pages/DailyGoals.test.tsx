import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DailyGoals } from '@/pages/Goals/DailyGoals';
import { DEFAULT_GOALS } from '@/constants/goals';

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    energyUnit: 'kcal',
    convertEnergy: (val: number) => val,
    getEnergyUnitString: () => 'kcal',
  }),
}));

jest.mock('@/hooks/Foods/useCustomNutrients', () => ({
  useCustomNutrients: () => ({ data: [] }),
}));

jest.mock('@/hooks/Diary/useMealTypes', () => ({
  useMealTypes: () => ({ data: [] }),
}));

jest.mock('@/hooks/Goals/useGoals', () => ({
  useSaveGoalsMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

jest.mock('@/hooks/Goals/useNutrientAutoCalculate', () => ({
  useNutrientAutoCalculate: () => ({
    algorithms: {},
    autoCalculateUserData: null,
    goalTypePreferences: {},
    eligibleIds: [],
    selected: new Set(),
    toggleSelected: jest.fn(),
    selectAll: jest.fn(),
    selectNone: jest.fn(),
    applySelected: jest.fn(),
  }),
}));

describe('DailyGoals - Water Goal Exclusivity (Gate 3)', () => {
  it('does not render a generic nutrient input for water_ml even if present in visibleNutrients', () => {
    const goals = { ...DEFAULT_GOALS };
    const setGoals = jest.fn();

    render(
      <DailyGoals
        goals={goals}
        setGoals={setGoals}
        visibleNutrients={['water_ml', 'sodium', 'caffeine_mg', 'alcohol_g']}
        today="2026-09-05"
      />
    );

    // Standard nutrients in visible list should render
    expect(screen.getByText(/Sodium/i)).toBeInTheDocument();
    expect(screen.getByText(/Caffeine/i)).toBeInTheDocument();
    expect(screen.getByText(/Alcohol/i)).toBeInTheDocument();

    // water_ml generic nutrient input must NOT render (Gate 3)
    // Note: Water and Exercise section has Water Goal (ml), but generic grid does not render water_ml
    const nutrientInputContainers = document.querySelectorAll('.grid > div');
    const renderedIds = Array.from(nutrientInputContainers).map(
      (el) => el.textContent
    );
    expect(
      renderedIds.some(
        (text) => text?.includes('Water') && !text.includes('Water Goal')
      )
    ).toBe(false);
  });
});
