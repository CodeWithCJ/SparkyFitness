import React from 'react';
import { render } from '@testing-library/react-native';
import DiaryCalorieMacroSummary from '../../src/components/DiaryCalorieMacroSummary';
import { useAppPreferencesStore, __resetAppPreferencesStoreForTests } from '../../src/stores/appPreferencesStore';
import type { DailySummary } from '../../src/types/dailySummary';

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

describe('DiaryCalorieMacroSummary', () => {
  beforeEach(() => {
    __resetAppPreferencesStoreForTests();
  });

  it('renders nothing when both toggles are off', () => {
    useAppPreferencesStore.setState({
      diaryCalorieSummaryVisible: false,
      diaryMacroSummaryVisible: false,
    });
    const { toJSON } = render(
      <DiaryCalorieMacroSummary summary={buildSummary()} showNetCarbs={false} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders only the calorie bar when macros are off', () => {
    useAppPreferencesStore.setState({
      diaryCalorieSummaryVisible: true,
      diaryMacroSummaryVisible: false,
    });
    const { getByText, queryByText } = render(
      <DiaryCalorieMacroSummary
        summary={buildSummary({
          calorieBalance: { ...buildSummary().calorieBalance, eaten: 500, goal: 2000, remaining: 1500 },
        })}
        showNetCarbs={false}
      />,
    );
    expect(getByText('Calories')).toBeTruthy();
    expect(getByText(/500 kcal/)).toBeTruthy();
    expect(getByText(/2,000/)).toBeTruthy();
    expect(getByText(/1,500/)).toBeTruthy();
    expect(getByText(/remaining/)).toBeTruthy();
    expect(queryByText('Carbs')).toBeNull();
  });

  it('shows "over" instead of "left" when remaining is negative', () => {
    useAppPreferencesStore.setState({
      diaryCalorieSummaryVisible: true,
      diaryMacroSummaryVisible: false,
    });
    const { getByText } = render(
      <DiaryCalorieMacroSummary
        summary={buildSummary({
          calorieBalance: { ...buildSummary().calorieBalance, eaten: 2500, goal: 2000, remaining: -500 },
        })}
        showNetCarbs={false}
      />,
    );
    expect(getByText(/over/)).toBeTruthy();
  });

  it('uses calorieBalance.remaining rather than deriving goal - eaten, so exercise/BMR-aware calorie modes stay correct', () => {
    // Simulates a dynamic/TDEE calorie mode where remaining includes an
    // exercise credit, so it diverges from a naive goal - eaten calculation
    // (2000 - 500 would be 1500, but the server-computed remaining is 1800).
    useAppPreferencesStore.setState({
      diaryCalorieSummaryVisible: true,
      diaryMacroSummaryVisible: false,
    });
    const { getByText, queryByText } = render(
      <DiaryCalorieMacroSummary
        summary={buildSummary({
          calorieBalance: { ...buildSummary().calorieBalance, eaten: 500, goal: 2000, remaining: 1800 },
        })}
        showNetCarbs={false}
      />,
    );
    expect(getByText(/1,800/)).toBeTruthy();
    expect(queryByText(/1,500/)).toBeNull();
  });

  it('renders the "Macronutrients" section label', () => {
    useAppPreferencesStore.setState({
      diaryCalorieSummaryVisible: false,
      diaryMacroSummaryVisible: true,
    });
    const { getByText } = render(
      <DiaryCalorieMacroSummary summary={buildSummary()} showNetCarbs={false} />,
    );
    expect(getByText('Macronutrients')).toBeTruthy();
  });

  it('shows the macro card on a day with no logged food when the toggle is on', () => {
    useAppPreferencesStore.setState({
      diaryCalorieSummaryVisible: false,
      diaryMacroSummaryVisible: true,
    });
    const { getByText } = render(
      <DiaryCalorieMacroSummary summary={buildSummary({ foodEntries: [] })} showNetCarbs={false} />,
    );
    expect(getByText('Macronutrients')).toBeTruthy();
  });

  it('renders only the macro row when calories are off', () => {
    useAppPreferencesStore.setState({
      diaryCalorieSummaryVisible: false,
      diaryMacroSummaryVisible: true,
    });
    const { getByText, queryByText } = render(
      <DiaryCalorieMacroSummary summary={buildSummary()} showNetCarbs={false} />,
    );
    expect(getByText('Carbs')).toBeTruthy();
    expect(getByText('Fat')).toBeTruthy();
    expect(getByText('Protein')).toBeTruthy();
    expect(queryByText(/cal$/)).toBeNull();
  });

  it('does not render a Fiber bar', () => {
    useAppPreferencesStore.setState({
      diaryCalorieSummaryVisible: false,
      diaryMacroSummaryVisible: true,
    });
    const { queryByText } = render(
      <DiaryCalorieMacroSummary summary={buildSummary()} showNetCarbs={false} />,
    );
    expect(queryByText('Fiber')).toBeNull();
  });

  it('shows total carbs labeled "Carbs" when showNetCarbs is false', () => {
    useAppPreferencesStore.setState({
      diaryCalorieSummaryVisible: false,
      diaryMacroSummaryVisible: true,
    });
    const { getByText, queryByText } = render(
      <DiaryCalorieMacroSummary
        summary={buildSummary({ carbs: { consumed: 50, goal: 250 }, fiber: { consumed: 15, goal: 30 } })}
        showNetCarbs={false}
      />,
    );
    expect(getByText('Carbs')).toBeTruthy();
    expect(getByText('50g / 250g')).toBeTruthy();
    expect(queryByText('Net Carbs')).toBeNull();
  });

  it('swaps to Net Carbs (carbs - fiber) when showNetCarbs is true', () => {
    useAppPreferencesStore.setState({
      diaryCalorieSummaryVisible: false,
      diaryMacroSummaryVisible: true,
    });
    const { getByText, queryByText } = render(
      <DiaryCalorieMacroSummary
        summary={buildSummary({ carbs: { consumed: 50, goal: 250 }, fiber: { consumed: 15, goal: 30 } })}
        showNetCarbs
      />,
    );
    expect(getByText('Net Carbs')).toBeTruthy();
    expect(getByText('35g / 250g')).toBeTruthy();
    expect(queryByText('Carbs')).toBeNull();
  });

  it('still renders the calorie row (without a goal bar/suffix) when the toggle is on but no goal is configured', () => {
    useAppPreferencesStore.setState({
      diaryCalorieSummaryVisible: true,
      diaryMacroSummaryVisible: false,
    });
    const { getByText, queryByText, toJSON } = render(
      <DiaryCalorieMacroSummary
        summary={buildSummary({
          calorieGoal: 0,
          calorieBalance: { ...buildSummary().calorieBalance, eaten: 300, goal: 0 },
        })}
        showNetCarbs={false}
      />,
    );
    expect(toJSON()).not.toBeNull();
    expect(getByText(/300/)).toBeTruthy();
    expect(queryByText(/2,000/)).toBeNull();
  });

  it('renders the calorie row when there is no goal but macros are off, matching DiaryScreen showing the widget for logged days without a configured goal', () => {
    useAppPreferencesStore.setState({
      diaryCalorieSummaryVisible: true,
      diaryMacroSummaryVisible: false,
    });
    const { toJSON } = render(
      <DiaryCalorieMacroSummary
        summary={buildSummary({ calorieGoal: 0, calorieBalance: { ...buildSummary().calorieBalance, goal: 0 } })}
        showNetCarbs={false}
      />,
    );
    expect(toJSON()).not.toBeNull();
  });
});
