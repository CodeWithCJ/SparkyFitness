import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import NutritionPeriodSummary from '@/pages/Reports/NutritionPeriodSummary';
import type { NutritionData } from '@/types/reports';
import type { ExpandedGoals } from '@/types/goals';
import type { DailyCalorieBalanceRow } from '@workspace/shared';

let mockAdjustmentMode:
  | 'dynamic'
  | 'adaptive'
  | 'fixed'
  | 'percentage'
  | 'tdee'
  | 'smart' = 'dynamic';

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
    // Interpolates `{{var}}` from the options object, as i18next does, so assertions can
    // read the rendered sentence rather than the raw template.
    t: (
      key: string,
      defaultValueOrOpts?: string | Record<string, unknown>,
      opts?: Record<string, unknown>
    ) => {
      const interpolate = (
        template: string,
        values?: Record<string, unknown>
      ) =>
        values
          ? template.replace(/\{\{(\w+)\}\}/g, (match, name) =>
              name in values ? String(values[name]) : match
            )
          : template;

      if (typeof defaultValueOrOpts === 'string') {
        return interpolate(defaultValueOrOpts, opts);
      }
      if (
        defaultValueOrOpts &&
        typeof defaultValueOrOpts === 'object' &&
        'defaultValue' in defaultValueOrOpts
      ) {
        return interpolate(
          defaultValueOrOpts['defaultValue'] as string,
          defaultValueOrOpts
        );
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

// Mock recharts responsive container to prevent jsdom SVG sizing issues
jest.mock('recharts', () => {
  const Original = jest.requireActual('recharts');
  return {
    ...Original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 500, height: 300 }}>{children}</div>
    ),
  };
});

const EMPTY_NUTRIENTS = {
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
};

const day = (date: string, calories: number): NutritionData => ({
  date,
  calories,
  ...EMPTY_NUTRIENTS,
});

const goalFor = (calories: number): ExpandedGoals =>
  ({ calories, protein: 140, carbs: 180, fat: 60 }) as ExpandedGoals;

/**
 * Builds one server-shaped balance row.
 *
 * `credit` is what the server decided the day's activity is worth *after*
 * `resolveExerciseCalories` picked max(active, logged + steps) and after the
 * "Include BMR in Net Calories" preference was applied. The component derives the
 * effective goal as `eaten + remaining`, so the row only has to be internally consistent.
 */
const balance = ({
  date,
  eaten,
  goal,
  credit = 0,
  stepCalories = 0,
}: {
  date: string;
  eaten: number;
  goal: number;
  credit?: number;
  stepCalories?: number;
}): DailyCalorieBalanceRow => ({
  date,
  eaten,
  goal,
  remaining: goal + credit - eaten,
  burned: credit,
  net: eaten - credit,
  progress: 0,
  bmr: 2000,
  bmrSource: 'formula',
  exerciseSource: credit > 0 ? 'logged' : 'none',
  tdeeProjection: null,
  stepCalories,
});

const byDate = (
  rows: DailyCalorieBalanceRow[]
): Record<string, DailyCalorieBalanceRow> =>
  Object.fromEntries(rows.map((row) => [row.date, row]));

describe('NutritionPeriodSummary', () => {
  beforeEach(() => {
    mockAdjustmentMode = 'dynamic';
  });

  it('calculates Net Balance as Total Eaten - Total Goal when no exercise is logged', () => {
    render(
      <NutritionPeriodSummary
        nutritionData={[day('2026-08-03', 2000)]}
        customNutrients={[]}
        goals={{ '2026-08-03': goalFor(1800) }}
        calorieBalanceByDate={byDate([
          balance({ date: '2026-08-03', eaten: 2000, goal: 1800 }),
        ])}
      />
    );

    // Eaten: 2000, Goal: 1800 -> Net Balance and Avg Daily Variance: +200 kcal
    expect(screen.getAllByText('+200 kcal')).toHaveLength(2);
    expect(screen.getByText(/Total Eaten: 2000 kcal/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Goal: 1800 kcal/i)).toBeInTheDocument();
  });

  /**
   * The regression gate for the reopened #2094.
   *
   * Aug 11 from the reporter's screenshots: a 641 kcal logged workout, a 774 kcal device
   * "Active Calories" row, and 138 kcal of background steps. The Diary credits
   * max(774, 641 + 138) = 779. The old browser-side derivation summed the entries and
   * credited 641 + 774 = 1415, which is the "doubling" in the bug report.
   */
  it('does not double-count device Active Calories on top of logged workouts (Issue #2094)', () => {
    render(
      <NutritionPeriodSummary
        nutritionData={[day('2026-08-11', 2477)]}
        customNutrients={[]}
        goals={{ '2026-08-11': goalFor(1962) }}
        calorieBalanceByDate={byDate([
          balance({
            date: '2026-08-11',
            eaten: 2477,
            goal: 1962,
            credit: 779,
            stepCalories: 138,
          }),
        ])}
      />
    );

    // Effective goal = 1962 + 779 = 2741, NOT 1962 + 1415 = 3377.
    expect(screen.getByText(/Total Goal: 2741 kcal/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/Total Goal: 3377 kcal/i)
    ).not.toBeInTheDocument();
    // Net Balance = 2477 - 2741 = -264, i.e. the negation of the Diary's +264 remaining.
    expect(screen.getAllByText('-264 kcal')).toHaveLength(2);
  });

  /**
   * Aug 8 from the reporter's screenshots: no exercise entries at all, 5,781 steps worth
   * 174 kcal. Step calories come from `check_in_measurements`, which the browser-side
   * derivation could not see, so it credited exactly zero.
   */
  it('credits background step calories on a steps-only day (Issue #2094)', () => {
    render(
      <NutritionPeriodSummary
        nutritionData={[day('2026-08-08', 2198)]}
        customNutrients={[]}
        goals={{ '2026-08-08': goalFor(1962) }}
        calorieBalanceByDate={byDate([
          balance({
            date: '2026-08-08',
            eaten: 2198,
            goal: 1962,
            credit: 174,
            stepCalories: 174,
          }),
        ])}
      />
    );

    // Effective goal = 1962 + 174 = 2136, not the bare 1962 the old code showed.
    expect(screen.getByText(/Total Goal: 2136 kcal/i)).toBeInTheDocument();
    expect(screen.getAllByText('+62 kcal')).toHaveLength(2);
  });

  /**
   * With "Include BMR in Net Calories" on, the day's budget legitimately contains the
   * BMR as well. The old derivation ignored the preference entirely, understating the
   * goal by a whole BMR every day.
   */
  it('reflects BMR in the goal when Include BMR in Net Calories is enabled', () => {
    render(
      <NutritionPeriodSummary
        nutritionData={[day('2026-08-07', 2574)]}
        customNutrients={[]}
        goals={{ '2026-08-07': goalFor(1962) }}
        calorieBalanceByDate={byDate([
          // 683 exercise + 3 steps + 2001 BMR
          balance({
            date: '2026-08-07',
            eaten: 2574,
            goal: 1962,
            credit: 2687,
          }),
        ])}
      />
    );

    expect(screen.getByText(/Total Goal: 4649 kcal/i)).toBeInTheDocument();
  });

  it('falls back to the raw goal when no balance is available', () => {
    render(
      <NutritionPeriodSummary
        nutritionData={[day('2026-08-03', 2000)]}
        customNutrients={[]}
        goals={{ '2026-08-03': goalFor(1800) }}
        calorieBalanceByDate={undefined}
      />
    );

    expect(screen.getByText(/Total Goal: 1800 kcal/i)).toBeInTheDocument();
    expect(screen.getAllByText('+200 kcal')).toHaveLength(2);
  });

  /**
   * The component no longer knows that calorie adjustment modes exist -- the server
   * already applied the user's mode when it computed `remaining`. This pins that:
   * before the fix, four of these six modes silently credited zero.
   */
  it.each([
    'dynamic',
    'percentage',
    'tdee',
    'smart',
    'adaptive',
    'fixed',
  ] as const)(
    'renders identically regardless of calorieGoalAdjustmentMode (%s)',
    (mode) => {
      mockAdjustmentMode = mode;

      render(
        <NutritionPeriodSummary
          nutritionData={[day('2026-08-11', 2477)]}
          customNutrients={[]}
          goals={{ '2026-08-11': goalFor(1962) }}
          calorieBalanceByDate={byDate([
            balance({
              date: '2026-08-11',
              eaten: 2477,
              goal: 1962,
              credit: 779,
            }),
          ])}
        />
      );

      expect(screen.getByText(/Total Goal: 2741 kcal/i)).toBeInTheDocument();
    }
  );

  /**
   * The balance must not leak into other nutrients. Protein is promoted to the primary
   * nutrient (the KPI reads `selectedNutrients[0]`) so its Total Goal becomes assertable;
   * it must show the plain stored goal even though a calorie balance is supplied.
   */
  it('leaves non-calorie nutrients on their stored goals', async () => {
    render(
      <NutritionPeriodSummary
        nutritionData={[{ ...day('2026-08-11', 2477), protein: 150 }]}
        customNutrients={[]}
        goals={{ '2026-08-11': goalFor(1962) }}
        calorieBalanceByDate={byDate([
          balance({
            date: '2026-08-11',
            eaten: 2477,
            goal: 1962,
            credit: 779,
          }),
        ])}
      />
    );

    // Sanity: calories currently drive the KPI and carry the 779 credit.
    expect(screen.getByText(/Total Goal: 2741 kcal/i)).toBeInTheDocument();

    // Radix opens its trigger on pointerdown/keyboard, not a bare click in jsdom.
    fireEvent.keyDown(screen.getByRole('button', { name: /calories/i }), {
      key: 'Enter',
    });
    fireEvent.click(
      await screen.findByRole('menuitemcheckbox', { name: /protein/i })
    );
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: /calories/i })
    );

    // Protein's goal is the stored 140 — untouched by the calorie balance.
    expect(await screen.findByText(/Total Goal: 140/i)).toBeInTheDocument();
    expect(screen.queryByText(/Total Goal: 2741/i)).not.toBeInTheDocument();
  });

  /**
   * The original #2094 reproduction, kept as an 8-day dataset but fed server balances
   * instead of raw entries. Days 6-8 are steps-only days the old code credited at zero.
   */
  it('matches the sum of the Diary’s daily remaining over a range (Issue #2094)', () => {
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
    const eatenPerDay = [2523, 2230, 2579, 2179, 2574, 2198, 2095, 1942];
    const creditPerDay = [800, 444, 692, 374, 686, 174, 65, 793];

    render(
      <NutritionPeriodSummary
        nutritionData={dates.map((date, i) => day(date, eatenPerDay[i] ?? 0))}
        customNutrients={[]}
        goals={Object.fromEntries(dates.map((date) => [date, goalFor(1962)]))}
        calorieBalanceByDate={byDate(
          dates.map((date, i) =>
            balance({
              date,
              eaten: eatenPerDay[i] ?? 0,
              goal: 1962,
              credit: creditPerDay[i] ?? 0,
            })
          )
        )}
      />
    );

    // Total eaten 18,320. Total goal 1962*8 + 4,028 = 19,724.
    // Net Balance = 18,320 - 19,724 = -1,404, the negation of the summed remaining.
    expect(screen.getByText(/Total Eaten: 18320 kcal/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Goal: 19724 kcal/i)).toBeInTheDocument();
    expect(screen.getByText('-1404 kcal')).toBeInTheDocument();
  });

  /**
   * The server rounds `eaten` and `remaining` to whole kcal; `nutritionData` carries the
   * unrounded total from the same query. Deriving the budget from the row's rounded
   * `eaten` therefore left up to 0.5 kcal of residue per day, which the cumulative series
   * accumulated -- roughly 90 kcal across a year, in the one chart whose job is agreeing
   * with the Diary. Passing the caller's own unrounded figure makes `eaten - budget`
   * resolve to exactly `-remaining`.
   */
  it('reports the exact negation of the summed remaining, without rounding residue', () => {
    const dates = [
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ];

    render(
      <NutritionPeriodSummary
        nutritionData={dates.map((date) => day(date, 2000.49))}
        customNutrients={[]}
        goals={Object.fromEntries(dates.map((date) => [date, goalFor(1800)]))}
        calorieBalanceByDate={byDate(
          // `eaten: 2000` is the rounded figure the server actually sends, so
          // `remaining` here is the whole -200 the Diary displays for each day.
          dates.map((date) => balance({ date, eaten: 2000, goal: 1800 }))
        )}
      />
    );

    // Five days at -200 remaining each. The Diary total is -1000, so Reports must show
    // +1000 -- not the +1002 that accumulating five 0.49 kcal residues produces.
    expect(screen.getByText('+1000 kcal')).toBeInTheDocument();
    expect(screen.queryByText('+1002 kcal')).not.toBeInTheDocument();
    expect(screen.getByText(/Total Goal: 9002 kcal/i)).toBeInTheDocument();
  });

  /**
   * These totals sum only days that have entries, but the balance map spans every
   * calendar day requested. Naming the gap matters because #2094 was reported by someone
   * reconciling this card against the Diary by hand.
   */
  it('names how many days the totals cover when the window has untracked days', () => {
    render(
      <NutritionPeriodSummary
        nutritionData={[day('2026-08-01', 2000), day('2026-08-03', 2000)]}
        customNutrients={[]}
        goals={{
          '2026-08-01': goalFor(1800),
          '2026-08-03': goalFor(1800),
        }}
        calorieBalanceByDate={byDate([
          balance({ date: '2026-08-01', eaten: 2000, goal: 1800 }),
          balance({ date: '2026-08-02', eaten: 0, goal: 1800 }),
          balance({ date: '2026-08-03', eaten: 2000, goal: 1800 }),
        ])}
      />
    );

    expect(
      screen.getByText(
        /Counted 2 of 3 days . days with nothing logged are excluded/i
      )
    ).toBeInTheDocument();
  });

  it('states the day count plainly when every day in the window was logged', () => {
    render(
      <NutritionPeriodSummary
        nutritionData={[day('2026-08-01', 2000), day('2026-08-02', 2000)]}
        customNutrients={[]}
        goals={{
          '2026-08-01': goalFor(1800),
          '2026-08-02': goalFor(1800),
        }}
        calorieBalanceByDate={byDate([
          balance({ date: '2026-08-01', eaten: 2000, goal: 1800 }),
          balance({ date: '2026-08-02', eaten: 2000, goal: 1800 }),
        ])}
      />
    );

    expect(screen.getByText('Counted 2 days')).toBeInTheDocument();
  });
  /**
   * `validDaysCount` only counts days where the *primary* nutrient resolved a goal, so a
   * logged day with no goal for that nutrient drops out of the totals too. Blaming that
   * on "nothing logged" tells a hand-reconciling reader the opposite of what happened.
   */
  it('blames a missing nutrient goal, not missing entries, when days were logged', async () => {
    render(
      <NutritionPeriodSummary
        nutritionData={[day('2026-08-01', 2000), day('2026-08-02', 2000)]}
        customNutrients={[]}
        // No goals map at all: both days are logged, neither resolves a protein goal.
        goals={undefined}
        calorieBalanceByDate={byDate([
          balance({ date: '2026-08-01', eaten: 2000, goal: 1800 }),
          balance({ date: '2026-08-02', eaten: 2000, goal: 1800 }),
        ])}
      />
    );

    // Radix opens its trigger on pointerdown/keyboard, not a bare click in jsdom.
    fireEvent.keyDown(screen.getByRole('button', { name: /calories/i }), {
      key: 'Enter',
    });
    fireEvent.click(
      await screen.findByRole('menuitemcheckbox', { name: /protein/i })
    );
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: /calories/i })
    );

    // Both days were logged; they drop out because protein has no goal, so the caption
    // must not blame missing entries.
    expect(
      await screen.findByText(/days without a .*goal.*are excluded/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        /^Counted \d+ of \d+ days . days with nothing logged are excluded$/i
      )
    ).toBeNull();
  });

  it('does not claim days were unlogged when the window is fully tracked', () => {
    render(
      <NutritionPeriodSummary
        nutritionData={[day('2026-08-01', 2000)]}
        customNutrients={[]}
        goals={{ '2026-08-01': goalFor(1800) }}
        calorieBalanceByDate={byDate([
          balance({ date: '2026-08-01', eaten: 2000, goal: 1800 }),
        ])}
      />
    );

    expect(screen.getByText('Counted 1 days')).toBeInTheDocument();
    expect(screen.queryByText(/excluded/i)).toBeNull();
  });
});
