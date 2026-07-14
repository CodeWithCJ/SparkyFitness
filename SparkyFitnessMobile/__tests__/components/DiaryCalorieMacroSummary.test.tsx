import React from 'react';
import { render } from '@testing-library/react-native';
import DiaryCalorieMacroSummary from '../../src/components/DiaryCalorieMacroSummary';
import { useAppPreferencesStore, __resetAppPreferencesStoreForTests } from '../../src/stores/appPreferencesStore';
import type { DailySummary } from '../../src/types/dailySummary';
import type { UserCustomNutrient } from '../../src/hooks/useCustomNutrients';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}));

function buildSummary(overrides: Partial<DailySummary> = {}): DailySummary {
  return {
    date: '2026-07-10',
    calorieGoal: 2000,
    caloriesConsumed: 0,
    caloriesBurned: 0,
    activeCalories: 0,
    otherExerciseCalories: 0,
    netCalories: 0,
    remainingCalories: 2000,
    protein: { consumed: 0, goal: 100 },
    carbs: { consumed: 50, goal: 250 },
    fat: { consumed: 0, goal: 67 },
    fiber: { consumed: 15, goal: 30 },
    stepCalories: 0,
    exerciseMinutes: 0,
    exerciseMinutesGoal: 0,
    exerciseCaloriesGoal: 0,
    waterConsumed: 0,
    waterGoal: 2500,
    foodEntries: [],
    exerciseEntries: [],
    calorieBalance: {
      eaten: 0,
      burned: 0,
      remaining: 2000,
      goal: 2000,
      net: 0,
      progress: 0,
      bmr: 0,
      bmrSource: 'formula',
      exerciseSource: 'none',
      tdeeProjection: null,
    },
    customNutrientTotals: {},
    customNutrientGoals: {},
    ...overrides,
  };
}

function renderWidget(props: Partial<React.ComponentProps<typeof DiaryCalorieMacroSummary>> = {}) {
  return render(
    <DiaryCalorieMacroSummary
      summary={buildSummary()}
      showNetCarbs={false}
      customNutrientKeys={[]}
      customNutrients={[]}
      {...props}
    />,
  );
}

describe('DiaryCalorieMacroSummary', () => {
  beforeEach(() => {
    __resetAppPreferencesStoreForTests();
  });

  it('renders nothing when diarySummaryVisible is off', () => {
    useAppPreferencesStore.setState({ diarySummaryVisible: false });
    const { toJSON } = renderWidget();
    expect(toJSON()).toBeNull();
  });

  it('renders only the calorie row when collapsed (default)', () => {
    useAppPreferencesStore.setState({ diarySummaryVisible: true, diarySummaryExpanded: false });
    const { getByText, queryByText } = renderWidget({
      summary: buildSummary({
        calorieBalance: { ...buildSummary().calorieBalance, eaten: 500, goal: 2000, remaining: 1500 },
      }),
    });
    expect(getByText(/500 \/ 2,000 kcal/)).toBeTruthy();
    expect(getByText(/1,500/)).toBeTruthy();
    expect(getByText(/remaining/)).toBeTruthy();
    expect(queryByText('Protein')).toBeNull();
  });

  it('reveals the macro pill grid when diarySummaryExpanded is true', () => {
    useAppPreferencesStore.setState({ diarySummaryVisible: true, diarySummaryExpanded: true });
    const { getByText } = renderWidget();
    expect(getByText('Protein')).toBeTruthy();
    expect(getByText('Carbs')).toBeTruthy();
    expect(getByText('Fat')).toBeTruthy();
    expect(getByText('Fiber')).toBeTruthy();
  });

  it('shows "over" instead of "remaining" when remaining is negative', () => {
    useAppPreferencesStore.setState({ diarySummaryVisible: true, diarySummaryExpanded: false });
    const { getByText } = renderWidget({
      summary: buildSummary({
        calorieBalance: { ...buildSummary().calorieBalance, eaten: 2500, goal: 2000, remaining: -500 },
      }),
    });
    expect(getByText(/over/)).toBeTruthy();
  });

  it('uses calorieBalance.remaining rather than deriving goal - eaten, so exercise/BMR-aware calorie modes stay correct', () => {
    // Simulates a dynamic/TDEE calorie mode where remaining includes an
    // exercise credit, so it diverges from a naive goal - eaten calculation
    // (2000 - 500 would be 1500, but the server-computed remaining is 1800).
    useAppPreferencesStore.setState({ diarySummaryVisible: true, diarySummaryExpanded: false });
    const { getByText, queryByText } = renderWidget({
      summary: buildSummary({
        calorieBalance: { ...buildSummary().calorieBalance, eaten: 500, goal: 2000, remaining: 1800 },
      }),
    });
    expect(getByText(/1,800/)).toBeTruthy();
    expect(queryByText(/1,500/)).toBeNull();
  });

  it('still renders the calorie row (without a goal bar/suffix) when no goal is configured', () => {
    useAppPreferencesStore.setState({ diarySummaryVisible: true, diarySummaryExpanded: false });
    const { getByText, queryByText, toJSON } = renderWidget({
      summary: buildSummary({
        calorieGoal: 0,
        calorieBalance: { ...buildSummary().calorieBalance, eaten: 300, goal: 0 },
      }),
    });
    expect(toJSON()).not.toBeNull();
    expect(getByText(/300/)).toBeTruthy();
    expect(queryByText(/2,000/)).toBeNull();
  });

  it('shows total carbs labeled "Carbs" when showNetCarbs is false', () => {
    useAppPreferencesStore.setState({ diarySummaryVisible: true, diarySummaryExpanded: true });
    const { getByText, queryByText } = renderWidget({
      summary: buildSummary({ carbs: { consumed: 50, goal: 250 }, fiber: { consumed: 15, goal: 30 } }),
      showNetCarbs: false,
    });
    expect(getByText('Carbs')).toBeTruthy();
    expect(queryByText('Net Carbs')).toBeNull();
  });

  it('swaps to Net Carbs (carbs - fiber) when showNetCarbs is true', () => {
    useAppPreferencesStore.setState({ diarySummaryVisible: true, diarySummaryExpanded: true });
    const { getByText, queryByText } = renderWidget({
      summary: buildSummary({ carbs: { consumed: 50, goal: 250 }, fiber: { consumed: 15, goal: 30 } }),
      showNetCarbs: true,
    });
    expect(getByText('Net Carbs')).toBeTruthy();
    expect(queryByText('Carbs')).toBeNull();
  });

  it('renders custom nutrient pills up to the provided customNutrientKeys list', () => {
    useAppPreferencesStore.setState({ diarySummaryVisible: true, diarySummaryExpanded: true });
    const customNutrients: UserCustomNutrient[] = [
      { id: '1', name: 'Omega-3', unit: 'mg' },
      { id: '2', name: 'Magnesium', unit: 'mg' },
    ];
    const { getByText } = renderWidget({
      summary: buildSummary({
        customNutrientTotals: { 'Omega-3': 200, Magnesium: 50 },
        customNutrientGoals: { 'Omega-3': 500, Magnesium: 400 },
      }),
      customNutrientKeys: ['Omega-3', 'Magnesium'],
      customNutrients,
    });
    expect(getByText('Omega-3')).toBeTruthy();
    expect(getByText('Magnesium')).toBeTruthy();
  });

  it('renders no custom nutrient pills when customNutrientKeys is empty', () => {
    useAppPreferencesStore.setState({ diarySummaryVisible: true, diarySummaryExpanded: true });
    const { queryByText } = renderWidget({ customNutrientKeys: [], customNutrients: [] });
    expect(queryByText('Omega-3')).toBeNull();
  });
});
