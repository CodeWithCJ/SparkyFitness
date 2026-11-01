import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CalculationSettings from '@/pages/Settings/CalculationSettings';
import DailyProgress from '@/pages/Diary/DailyProgress';
import { MemoryRouter } from 'react-router-dom';
import { CALORIE_RULE_DEFAULTS } from '@workspace/shared';
import type { CalorieInputs } from '@workspace/shared';

const mockSave = jest.fn().mockResolvedValue(undefined);
const mockConvert = (value: number) => value;
let mockMode = 'dynamic';
let mockMethod = 'adaptive';
let mockSeparate = false;
let mockExerciseMacros = false;
const defaultCalorieInputs: CalorieInputs = {
  rules: CALORIE_RULE_DEFAULTS,
  age: 36,
  gender: 'male',
  weightKg: 80,
  heightCm: 180,
  bodyFatPercentage: null,
  waistCm: null,
  neckCm: null,
  hipsCm: null,
};
let mockCalorieInputs: CalorieInputs | undefined = defaultCalorieInputs;

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    energyUnit: 'kcal',
    setEnergyUnit: jest.fn(),
    bmrAlgorithm: 'Mifflin-St Jeor',
    bodyFatAlgorithm: 'U.S. Navy',
    useExternalBmr: false,
    calorieGoalAdjustmentMode: mockMode,
    goalMode: 'maintain',
    goalModeCalculationMethod: mockMethod,
    adaptiveActivitySeparate: mockSeparate,
    adjustMacrosWithExercise: mockExerciseMacros,
    activityLevel: 'not_much',
    weightUnit: 'kg',
    timezone: 'UTC',
    loggingLevel: 'SILENT',
    saveAllPreferences: mockSave,
    convertEnergy: mockConvert,
    convertWeight: mockConvert,
    getEnergyUnitString: () => 'kcal',
  }),
}));
jest.mock('@/hooks/useInvalidateKeys', () => ({
  useDiaryInvalidation: () => jest.fn(),
  useDailyProgressInvalidation: () => jest.fn(),
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));
jest.mock('@/hooks/Settings/useProfile', () => ({
  useProfileQuery: () => ({ data: { gender: 'male' } }),
}));
jest.mock('@/hooks/Diary/useDailyProgress', () => ({
  useCalculatedBMR: () => ({ bmr: 1800, weight: 80, height: 180 }),
  useAdaptiveTdee: () => ({
    data: {
      tdee: 2800,
      activityAdjustedTdee: 2300,
      rawActivityAdjustedTdee: 2300,
      rawTdee: 2800,
      averageActivityCalories: 500,
      activityDaysOfData: 28,
      isFallback: false,
      daysOfData: 28,
    },
  }),
  useMostRecentBodyFatQuery: () => ({ data: undefined }),
  useMostRecentWeightQuery: () => ({ data: { weight: 80 } }),
  useMostRecentHeightQuery: () => ({ data: { height: 180 } }),
  useDailyExerciseStats: () => ({
    data: { otherCalories: 0, activeCalories: 0, activitySteps: 0 },
    isLoading: false,
  }),
  useDailySteps: () => ({ data: { steps: 0 }, isLoading: false }),
  useDailySummary: () => ({
    data: {
      goals: { calories: 2000 },
      stepCalories: 0,
      calorieBalance: {
        bmr: 1800,
        goal: 2300,
        eaten: 1000,
        burned: 0,
        net: 1000,
        remaining: 1300,
        progress: 43,
        exerciseSource: 'none',
      },
      calorieInputs: mockCalorieInputs,
    },
    isLoading: false,
    isError: false,
  }),
}));
jest.mock('@/hooks/Settings/useNutrientGoalPreferences', () => ({
  useNutrientGoalPreferences: () => ({ data: {} }),
}));
jest.mock('@/hooks/Diary/useFoodEntries', () => ({
  useDiaryGoals: () => ({ data: { calories: 2000 } }),
}));
jest.mock('@/hooks/CheckIn/useCheckIn', () => ({
  useMostRecentMeasurement: () => ({ data: undefined }),
}));

beforeEach(() => {
  mockSave.mockClear();
  mockMode = 'dynamic';
  mockMethod = 'adaptive';
  mockSeparate = false;
  mockCalorieInputs = defaultCalorieInputs;
  mockExerciseMacros = false;
});

it('keeps exercise macro adjustment off by default and saves the explicit choice', async () => {
  render(<CalculationSettings />);
  const toggle = screen.getByRole('switch', {
    name: 'Adjust percentage macro goals with exercise calories',
  });
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  expect(toggle).toBeChecked();
  expect(mockSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Save Preferences/ }));
  await waitFor(() =>
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ adjustMacrosWithExercise: true })
    )
  );
});

it('loads and allows disabling saved exercise macro adjustment', async () => {
  mockExerciseMacros = true;
  render(<CalculationSettings />);
  const toggle = screen.getByRole('switch', {
    name: 'Adjust percentage macro goals with exercise calories',
  });
  expect(toggle).toBeChecked();
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole('button', { name: /Save Preferences/ }));
  await waitFor(() =>
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ adjustMacrosWithExercise: false })
    )
  );
});

it('saves the opt-in only when Save Preferences is pressed', async () => {
  render(<CalculationSettings />);
  const toggle = screen.getByRole('switch', {
    name: 'Count activity calories separately',
  });

  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  expect(toggle).toBeChecked();
  expect(mockSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Save Preferences/ }));

  await waitFor(() =>
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ adaptiveActivitySeparate: true })
    )
  );
});

it('previews the saved separate baseline while retaining full measured TDEE', () => {
  mockSeparate = true;
  render(<CalculationSettings />);

  expect(screen.getAllByText('2300 kcal').length).toBeGreaterThan(0);
  expect(screen.getByText(/Measured Adaptive TDEE:/)).toHaveTextContent(
    '2800 kcal'
  );
  expect(screen.getByText(/from your saved settings/)).toBeInTheDocument();
});

it('shows the separate baseline in the Diary target calculation', () => {
  mockCalorieInputs = {
    ...defaultCalorieInputs,
    rules: {
      ...CALORIE_RULE_DEFAULTS,
      goal_mode_calculation_method: 'adaptive',
      adaptive_activity_separate: true,
    },
  };
  render(
    <MemoryRouter>
      <DailyProgress selectedDate="2026-10-22" />
    </MemoryRouter>
  );
  fireEvent.click(
    screen.getByRole('button', { name: /How today's target is calculated/ })
  );

  expect(
    screen.getByText('Adaptive baseline (activity excluded):')
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Raw full-day TDEE − average activity/)
  ).toHaveTextContent('2800 − 500 = 2300 kcal');
  expect(screen.getByText('Adaptive baseline = 2300 kcal')).toBeInTheDocument();
});

it('explains a past day with the settings and weight it was calculated from', () => {
  const dayRules = {
    ...CALORIE_RULE_DEFAULTS,
    goal_mode: 'cut' as const,
    bmr_algorithm: 'Oxford',
  };
  mockCalorieInputs = {
    ...defaultCalorieInputs,
    rules: dayRules,
    weightKg: 92,
  };
  render(
    <MemoryRouter>
      <DailyProgress selectedDate="2026-10-01" />
    </MemoryRouter>
  );
  fireEvent.click(
    screen.getByRole('button', { name: /How today's target is calculated/ })
  );

  // Today's settings are Maintain with Mifflin-St Jeor at 80 kg.
  expect(screen.getByText(/14\.2 × 92 \+ 593/)).toBeInTheDocument();
  expect(screen.getByText(/Cut Deficit \(-15%\)/)).toBeInTheDocument();
  expect(screen.queryByText('Maintain (0% change)')).not.toBeInTheDocument();
});

it('explains an unset past setting with its default, not with today', () => {
  // Today: Percentage Earn-Back, which never separates activity.
  mockMode = 'percentage';
  mockSeparate = true;
  mockCalorieInputs = {
    ...defaultCalorieInputs,
    rules: {
      ...CALORIE_RULE_DEFAULTS,
      goal_mode_calculation_method: 'adaptive',
      adaptive_activity_separate: true,
      // Unset on that day, so the server used Dynamic, which does.
      calorie_goal_adjustment_mode: null,
    },
  };
  render(
    <MemoryRouter>
      <DailyProgress selectedDate="2026-10-01" />
    </MemoryRouter>
  );
  fireEvent.click(
    screen.getByRole('button', { name: /How today's target is calculated/ })
  );

  expect(
    screen.getByText('Adaptive baseline (activity excluded):')
  ).toBeInTheDocument();
});

it('shows the summary error, not a crash, when an older server sends no calorie inputs', () => {
  mockCalorieInputs = undefined;
  render(
    <MemoryRouter>
      <DailyProgress selectedDate="2026-10-22" />
    </MemoryRouter>
  );

  expect(screen.getByText('Daily summary unavailable')).toBeInTheDocument();
});

it('uses full-day TDEE for an unsaved move away from Dynamic while preserving the opt-in', async () => {
  mockSeparate = true;
  render(<CalculationSettings />);
  fireEvent.click(screen.getByRole('radio', { name: /Percentage Earn-Back:/ }));

  for (const label of screen.getAllByText('Adaptive TDEE (Expenditure):')) {
    expect(label.parentElement).toHaveTextContent('2800 kcal');
  }
  fireEvent.click(screen.getByRole('button', { name: /Save Preferences/ }));
  await waitFor(() =>
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        calorieGoalAdjustmentMode: 'percentage',
        adaptiveActivitySeparate: true,
      })
    )
  );
});

it.each([
  ['dynamic', 'manual'],
  ['percentage', 'adaptive'],
  ['adaptive', 'adaptive'],
  ['fixed', 'adaptive'],
  ['tdee', 'adaptive'],
])('keeps the stored option dormant for %s with %s', (mode, method) => {
  mockMode = mode;
  mockMethod = method;
  mockSeparate = true;
  render(<CalculationSettings />);

  expect(
    screen.queryByRole('switch', {
      name: 'Count activity calories separately',
    })
  ).not.toBeInTheDocument();
});
