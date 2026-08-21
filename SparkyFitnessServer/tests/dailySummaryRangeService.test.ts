import { beforeEach, describe, expect, test, vi } from 'vitest';
import { addDays, format, isAfter, parseISO } from 'date-fns';
import type { ExerciseSessionResponse } from '@workspace/shared';
import {
  EMPTY_SUPPLEMENT_TOTALS,
  computeStepCalories,
} from '@workspace/shared';
import { getDailySummaryRange } from '../services/dailySummaryRangeService.js';
import { getDailySummary } from '../services/dailySummaryService.js';
import goalService from '../services/goalService.js';
import foodEntryService from '../services/foodEntryService.js';
import { getExerciseEntriesByDateV2 } from '../services/exerciseEntryHistoryService.js';
import reportRepository from '../models/reportRepository.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import measurementRepository from '../models/measurementRepository.js';
import userRepository from '../models/userRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import foodRepository from '../models/foodMisc.js';
import bmrService from '../services/bmrService.js';

vi.mock('../services/goalService.js', () => ({
  default: { getUserGoals: vi.fn(), getUserGoalsForRange: vi.fn() },
}));
vi.mock('../services/foodEntryService.js', () => ({
  default: { getFoodEntriesByDate: vi.fn() },
}));
vi.mock('../services/exerciseEntryHistoryService.js', () => ({
  getExerciseEntriesByDateV2: vi.fn(),
}));
vi.mock('../models/reportRepository.js', () => ({
  default: { getNutritionData: vi.fn() },
}));
vi.mock('../models/exerciseEntry.js', () => ({
  default: { getDailyExerciseCalorieSplitRange: vi.fn() },
}));
vi.mock('../models/measurementRepository.js', () => ({
  default: {
    getWaterIntakeByDate: vi.fn(),
    getLatestCheckInMeasurementsOnOrBeforeDate: vi.fn(),
    getCheckInMeasurementsByDateRange: vi.fn(),
    getStepCaloriesForDate: vi.fn(),
    getLatestWeightHeight: vi.fn(),
    getExternalBmrForDate: vi.fn(),
    getExternalBmrByDateRange: vi.fn(),
  },
}));
vi.mock('../models/userRepository.js', () => ({
  default: { getUserProfile: vi.fn() },
}));
vi.mock('../models/preferenceRepository.js', () => ({
  default: { getUserPreferences: vi.fn() },
}));
vi.mock('../models/foodMisc.js', () => ({
  default: { getDailySupplementTotals: vi.fn() },
}));
vi.mock('../services/bmrService.js', () => ({
  default: { calculateBmr: vi.fn() },
}));

const USER = 'user-1';
const GOAL = 1962;
const WEIGHT = 80;
const HEIGHT = 180;

const PREFERENCES = {
  timezone: 'UTC',
  activity_level: 'not_much',
  calorie_goal_adjustment_mode: 'dynamic',
  include_bmr_in_net_calories: false,
  use_external_bmr: false,
};
const PROFILE = { date_of_birth: '1990-01-01', gender: 'male' };
const MEASUREMENT = { weight: WEIGHT, height: HEIGHT };

/**
 * Three days chosen to cover the two shapes issue #2094 got wrong plus a control:
 *  - Aug 11: a logged workout AND a device "Active Calories" row AND background steps
 *  - Aug 08: steps only, no exercise entries at all
 *  - Aug 09: nothing logged
 */
const FIXTURE = {
  '2026-08-08': {
    eaten: 2198,
    active: 0,
    other: 0,
    activitySteps: 0,
    steps: 5781,
  },
  '2026-08-09': {
    eaten: 2095,
    active: 0,
    other: 0,
    activitySteps: 0,
    steps: 0,
  },
  // 5,786 steps at 80kg/180cm is 138 kcal, so logged + steps = 779 and just edges out
  // the 774 kcal device summary — exactly the reporter's Aug 11.
  '2026-08-11': {
    eaten: 2477,
    active: 774,
    other: 641,
    activitySteps: 0,
    steps: 5786,
  },
} as const;

type FixtureDate = keyof typeof FIXTURE;
const DATES = Object.keys(FIXTURE) as FixtureDate[];

const stepCaloriesFor = (date: FixtureDate): number =>
  computeStepCalories({
    backgroundSteps: Math.max(
      0,
      FIXTURE[date].steps - FIXTURE[date].activitySteps
    ),
    weightKg: WEIGHT,
    heightCm: HEIGHT,
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(bmrService.calculateBmr).mockReturnValue(2000);

  // ── ranged path ──
  vi.mocked(reportRepository.getNutritionData).mockResolvedValue(
    DATES.map((date) => ({ date, calories: FIXTURE[date].eaten }))
  );
  vi.mocked(goalService.getUserGoalsForRange).mockImplementation(
    async (_userId: string, startDate: string, endDate: string) => {
      const goals: Record<string, { calories: number }> = {};
      let cursor = parseISO(startDate);
      const end = parseISO(endDate);
      while (!isAfter(cursor, end)) {
        goals[format(cursor, 'yyyy-MM-dd')] = { calories: GOAL };
        cursor = addDays(cursor, 1);
      }
      return goals;
    }
  );
  vi.mocked(
    exerciseEntryRepository.getDailyExerciseCalorieSplitRange
  ).mockResolvedValue(
    DATES.map((date) => ({
      entry_date: date,
      active_calories: FIXTURE[date].active,
      other_calories: FIXTURE[date].other,
      activity_steps: FIXTURE[date].activitySteps,
    }))
  );
  vi.mocked(
    measurementRepository.getCheckInMeasurementsByDateRange
  ).mockResolvedValue(
    DATES.map((date) => ({
      entry_date: date,
      steps: FIXTURE[date].steps,
      ...MEASUREMENT,
    }))
  );
  vi.mocked(measurementRepository.getLatestWeightHeight).mockResolvedValue({
    weightKg: WEIGHT,
    heightCm: HEIGHT,
  });
  vi.mocked(measurementRepository.getExternalBmrByDateRange).mockResolvedValue(
    new Map()
  );

  // ── per-date path ──
  vi.mocked(goalService.getUserGoals).mockResolvedValue({ calories: GOAL });
  vi.mocked(measurementRepository.getWaterIntakeByDate).mockResolvedValue(null);
  vi.mocked(foodRepository.getDailySupplementTotals).mockResolvedValue(
    EMPTY_SUPPLEMENT_TOTALS
  );
  vi.mocked(measurementRepository.getExternalBmrForDate).mockResolvedValue(
    null
  );

  // ── shared ──
  vi.mocked(
    measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
  ).mockResolvedValue(MEASUREMENT);
  vi.mocked(userRepository.getUserProfile).mockResolvedValue(PROFILE);
  vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue(
    PREFERENCES
  );
});

const runRange = () =>
  getDailySummaryRange({
    targetUserId: USER,
    startDate: '2026-08-08',
    endDate: '2026-08-11',
    includeCheckin: true,
  });

describe('parity with the per-date Diary path', () => {
  /**
   * The structural guard for issue #2094.
   *
   * If anyone ever reintroduces a second implementation of the calorie balance, this
   * fails. The bug was reopened precisely because Reports and the Diary each had their
   * own idea of a day's balance, and nothing asserted they agreed.
   */
  test.each(DATES)(
    'the ranged row for %s deep-equals the Diary calorieBalance',
    async (date) => {
      const fixture = FIXTURE[date];

      vi.mocked(foodEntryService.getFoodEntriesByDate).mockResolvedValue([
        { calories: fixture.eaten, quantity: 1, serving_size: 1 },
      ]);
      vi.mocked(getExerciseEntriesByDateV2).mockResolvedValue([
        ...(fixture.active
          ? [
              {
                type: 'individual',
                name: 'Active Calories',
                calories_burned: fixture.active,
                steps: 0,
              },
            ]
          : []),
        ...(fixture.other
          ? [
              {
                type: 'individual',
                name: 'Run',
                calories_burned: fixture.other,
                steps: fixture.activitySteps,
              },
            ]
          : []),
      ] as unknown as ExerciseSessionResponse[]);
      vi.mocked(measurementRepository.getStepCaloriesForDate).mockResolvedValue(
        stepCaloriesFor(date)
      );

      const [{ days }, summary] = await Promise.all([
        runRange(),
        getDailySummary({
          actorUserId: USER,
          targetUserId: USER,
          date,
          includeCheckin: true,
        }),
      ]);

      const row = days.find((entry) => entry.date === date);
      expect(row).toBeDefined();

      const { date: _date, stepCalories: _steps, ...balance } = row!;
      expect(balance).toEqual(summary.calorieBalance);
    }
  );

  test('the Aug 11 row credits 779, not 1415', async () => {
    const { days } = await runRange();
    const row = days.find((entry) => entry.date === '2026-08-11');

    // max(774, 641 + steps), never 641 + 774.
    expect(row?.burned).toBe(779);
    expect(row?.burned).not.toBe(1415);
    // The identity the Reports chart uses to turn `remaining` back into a goal.
    expect(row!.eaten + row!.remaining).toBe(GOAL + 779);
  });

  test('the steps-only day is credited rather than zeroed', async () => {
    const { days } = await runRange();
    const row = days.find((entry) => entry.date === '2026-08-08');

    expect(row?.stepCalories).toBe(stepCaloriesFor('2026-08-08'));
    expect(row?.burned).toBeGreaterThan(0);
    expect(row!.eaten + row!.remaining).toBe(GOAL + row!.burned);
  });
});

describe('range mechanics', () => {
  test('emits one row per calendar day, including days with nothing logged', async () => {
    const { days } = await runRange();

    // 2026-08-10 has no fixture at all and must still appear.
    expect(days.map((day) => day.date)).toEqual([
      '2026-08-08',
      '2026-08-09',
      '2026-08-10',
      '2026-08-11',
    ]);

    const empty = days.find((day) => day.date === '2026-08-10');
    expect(empty?.eaten).toBe(0);
    expect(empty?.burned).toBe(0);
    expect(empty?.goal).toBe(GOAL);
  });

  /**
   * Guards the O(1) property against a future "just call getStepCaloriesForDate in the
   * loop" edit. The per-day alternative is ~13 queries a day, i.e. over a thousand for a
   * 90-day report.
   */
  test('issues a fixed number of queries regardless of range length', async () => {
    await getDailySummaryRange({
      targetUserId: USER,
      startDate: '2026-01-01',
      endDate: '2026-03-31', // 90 days
      includeCheckin: true,
    });

    expect(reportRepository.getNutritionData).toHaveBeenCalledTimes(1);
    expect(goalService.getUserGoalsForRange).toHaveBeenCalledTimes(1);
    expect(
      exerciseEntryRepository.getDailyExerciseCalorieSplitRange
    ).toHaveBeenCalledTimes(1);
    expect(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).toHaveBeenCalledTimes(1);
    expect(measurementRepository.getLatestWeightHeight).toHaveBeenCalledTimes(
      1
    );
    expect(userRepository.getUserProfile).toHaveBeenCalledTimes(1);
    expect(preferenceRepository.getUserPreferences).toHaveBeenCalledTimes(1);
    // The per-date step query must never be reached from the ranged path.
    expect(measurementRepository.getStepCaloriesForDate).not.toHaveBeenCalled();
  });

  test('withholds check-in derived data when the caller lacks permission', async () => {
    const { days } = await getDailySummaryRange({
      targetUserId: USER,
      startDate: '2026-08-08',
      endDate: '2026-08-11',
      includeCheckin: false,
    });

    expect(days.every((day) => day.stepCalories === 0)).toBe(true);
    expect(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).not.toHaveBeenCalled();
    expect(
      measurementRepository.getExternalBmrByDateRange
    ).not.toHaveBeenCalled();
    // The Aug 8 day was steps-only, so with no checkin access it credits nothing.
    expect(days.find((day) => day.date === '2026-08-08')?.burned).toBe(0);
  });

  test('returns the calendar days requested, unshifted', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      ...PREFERENCES,
      timezone: 'Pacific/Kiritimati', // UTC+14, the worst case for naive UTC slicing
    });

    const { days } = await getDailySummaryRange({
      targetUserId: USER,
      startDate: '2026-08-08',
      endDate: '2026-08-09',
      includeCheckin: true,
    });

    expect(days.map((day) => day.date)).toEqual(['2026-08-08', '2026-08-09']);
  });

  /**
   * Caught by an end-to-end run against real data, not by a mock: the Diary's
   * `getLatestCheckInMeasurementsOnOrBeforeDate` resolves each body-composition column
   * to its own latest non-null, positive value. Walking whole rows instead meant a
   * check-in row recording only `steps` blanked weight and height for that day and every
   * day after it, quietly dropping BMR to the 70kg/175cm defaults.
   */
  test('carries body composition forward per field across steps-only check-in rows', async () => {
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({ weight: 80, height: 180 });

    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([
      // A steps-only sync: no weight, no height.
      { entry_date: '2026-08-09', steps: 4000, weight: null, height: null },
      // A zero is as meaningless as a null here, matching the SQL's `> 0` guard.
      { entry_date: '2026-08-10', steps: 4000, weight: 0, height: 0 },
    ]);

    await getDailySummaryRange({
      targetUserId: USER,
      startDate: '2026-08-08',
      endDate: '2026-08-11',
      includeCheckin: true,
    });

    // Every day must still see the seeded 80kg / 180cm, never the defaults.
    for (const call of vi.mocked(bmrService.calculateBmr).mock.calls) {
      expect(call[1]).toBe(80);
      expect(call[2]).toBe(180);
    }
  });
});
