import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import NutritionPeriodSummary from '@/pages/Reports/NutritionPeriodSummary';
import type { DailyExerciseEntry, NutritionData } from '@/types/reports';
import type { ExpandedGoals } from '@/types/goals';
import type { Exercise } from '@/types/exercises';

let mockAdjustmentMode: 'dynamic' | 'adaptive' | 'fixed' | 'percentage' =
  'dynamic';

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    t: (key: string, fallback?: string) => fallback || key,
    use: jest.fn().mockReturnThis(),
    init: jest.fn(),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValueOrOpts?: string | Record<string, unknown>) => {
      if (typeof defaultValueOrOpts === 'string') return defaultValueOrOpts;
      if (
        defaultValueOrOpts &&
        typeof defaultValueOrOpts === 'object' &&
        'defaultValue' in defaultValueOrOpts
      ) {
        return defaultValueOrOpts['defaultValue'] as string;
      }
      return key;
    },
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'ERROR',
    dateFormat: 'MMM dd, yyyy',
    formatDateInUserTimezone: (date: Date) => date.toISOString().slice(0, 10),
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    getEnergyUnitString: () => 'kcal',
    showNetCarbs: false,
    calorieGoalAdjustmentMode: mockAdjustmentMode,
    exerciseCaloriePercentage: 100,
  }),
}));

jest.mock('@/components/ZoomableChart', () => ({
  __esModule: true,
  default: ({
    children,
  }: {
    children: (isMaximized: boolean, zoomLevel: number) => React.ReactNode;
  }) => <div>{children(false, 1)}</div>,
}));

// Mock recharts responsive container and charts to prevent jsdom SVG sizing issues
jest.mock('recharts', () => {
  const Original = jest.requireActual('recharts');
  return {
    ...Original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 500, height: 300 }}>{children}</div>
    ),
  };
});

describe('NutritionPeriodSummary', () => {
  beforeEach(() => {
    mockAdjustmentMode = 'dynamic';
  });

  it('calculates Net Balance as Total Eaten - Total Goal when no exercise is logged', () => {
    const nutritionData: NutritionData[] = [
      {
        date: '2026-08-03',
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 70,
        saturated_fat: 0,
        polyunsaturated_fat: 0,
        monounsaturated_fat: 0,
        trans_fat: 0,
        cholesterol: 0,
        sodium: 0,
        potassium: 0,
        dietary_fiber: 0,
        sugars: 0,
        vitamin_a: 0,
        vitamin_c: 0,
        calcium: 0,
        iron: 0,
      },
    ];

    const goals: Record<string, ExpandedGoals> = {
      '2026-08-03': {
        calories: 1800,
        protein: 140,
        carbs: 180,
        fat: 60,
      } as ExpandedGoals,
    };

    render(
      <NutritionPeriodSummary
        nutritionData={nutritionData}
        customNutrients={[]}
        goals={goals}
        exerciseEntries={[]}
      />
    );

    // Eaten: 2000, Goal: 1800 -> Net Balance and Avg Daily Variance: +200 kcal
    expect(screen.getAllByText('+200 kcal')).toHaveLength(2);
    expect(screen.getByText(/Total Eaten: 2000 kcal/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Goal: 1800 kcal/i)).toBeInTheDocument();
  });

  it('correctly includes exercise calories burned in dynamic mode (Issue #2094)', () => {
    mockAdjustmentMode = 'dynamic';

    // 8-day dataset matching issue #2094 exact reproduction
    const dates = [
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
      '2026-08-09',
      '2026-08-10',
    ];
    const eatenPerDay = [2523, 2230, 2579, 2179, 2574, 2198, 2095, 1942]; // sum = 18320
    const exerciseBurnedPerDay = [800, 444, 692, 374, 686, 175, 65, 793]; // sum = 4029

    const nutritionData: NutritionData[] = dates.map((date, i) => ({
      date,
      calories: eatenPerDay[i] ?? 0,
      protein: 150,
      carbs: 200,
      fat: 70,
      saturated_fat: 0,
      polyunsaturated_fat: 0,
      monounsaturated_fat: 0,
      trans_fat: 0,
      cholesterol: 0,
      sodium: 0,
      potassium: 0,
      dietary_fiber: 0,
      sugars: 0,
      vitamin_a: 0,
      vitamin_c: 0,
      calcium: 0,
      iron: 0,
    }));

    const goals: Record<string, ExpandedGoals> = {};
    dates.forEach((date) => {
      goals[date] = {
        calories: 1962,
        protein: 140,
        carbs: 180,
        fat: 60,
      } as ExpandedGoals;
    });

    const mockExercise: Exercise = {
      id: 'exercise-1',
      name: 'Workout',
      category: 'Strength',
      force: 'push',
      level: 'intermediate',
      mechanic: 'compound',
      equipment: ['barbell'],
      images: [],
      primary_muscles: ['Chest'],
      secondary_muscles: ['Triceps'],
      instructions: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const exerciseEntries: DailyExerciseEntry[] = dates.map((date, i) => ({
      id: `ex-${i}`,
      entry_date: date,
      duration_minutes: 45,
      calories_burned: exerciseBurnedPerDay[i] ?? 0,
      exercises: mockExercise,
      sets: [],
    }));

    render(
      <NutritionPeriodSummary
        nutritionData={nutritionData}
        customNutrients={[]}
        goals={goals}
        exerciseEntries={exerciseEntries}
      />
    );

    // Total Eaten = 18,320 kcal
    // Total Base Goal = 1962 * 8 = 15,696 kcal
    // Total Exercise Burned = 4,029 kcal
    // Total Effective Goal = 15,696 + 4,029 = 19,725 kcal
    // Net Balance = 18,320 - 19,725 = -1,405 kcal (matching journal sum of remaining calories)
    expect(screen.getByText('-1405 kcal')).toBeInTheDocument();
    expect(screen.getByText(/Total Eaten: 18320 kcal/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Goal: 19725 kcal/i)).toBeInTheDocument();
  });

  it('does not add exercise burned to calorie goal in adaptive mode', () => {
    mockAdjustmentMode = 'adaptive';

    const nutritionData: NutritionData[] = [
      {
        date: '2026-08-13',
        calories: 2254,
        protein: 11,
        carbs: 453,
        fat: 44,
        saturated_fat: 0,
        polyunsaturated_fat: 0,
        monounsaturated_fat: 0,
        trans_fat: 0,
        cholesterol: 0,
        sodium: 0,
        potassium: 0,
        dietary_fiber: 25,
        sugars: 0,
        vitamin_a: 0,
        vitamin_c: 0,
        calcium: 0,
        iron: 0,
      },
    ];

    const goals: Record<string, ExpandedGoals> = {
      '2026-08-13': {
        calories: 1872,
        protein: 91,
        carbs: 208,
        fat: 71,
      } as ExpandedGoals,
    };

    const mockExercise: Exercise = {
      id: 'exercise-1',
      name: 'Other Exercise',
      category: 'Cardio',
      force: null,
      level: null,
      mechanic: null,
      equipment: null,
      images: null,
      primary_muscles: null,
      secondary_muscles: null,
      instructions: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const exerciseEntries: DailyExerciseEntry[] = [
      {
        id: 'ex-1',
        entry_date: '2026-08-13',
        duration_minutes: 30,
        calories_burned: 450,
        exercises: mockExercise,
        sets: [],
      },
    ];

    render(
      <NutritionPeriodSummary
        nutritionData={nutritionData}
        customNutrients={[]}
        goals={goals}
        exerciseEntries={exerciseEntries}
      />
    );

    // In adaptive mode: Goal remains 1872 kcal (450 kcal exercise not added)
    // Eaten: 2254, Goal: 1872 -> Net Balance: +382 kcal (matching -382 remaining in Diary)
    expect(screen.getAllByText('+382 kcal')).toHaveLength(2);
    expect(screen.getByText(/Total Eaten: 2254 kcal/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Goal: 1872 kcal/i)).toBeInTheDocument();
  });
});
