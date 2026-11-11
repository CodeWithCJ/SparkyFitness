import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  adaptiveTdeeResponseSchema,
  ADAPTIVE_TDEE_STABILITY_DAYS,
  ADAPTIVE_TDEE_STABILITY_MAX_DAILY_CHANGE_KCAL,
} from '@workspace/shared';
import {
  calculateAdaptiveTdee,
  calculateAdaptiveTdeeRange,
  clearUserTdeeCache,
  computeAdaptiveTdeeFromData,
} from '../services/AdaptiveTdeeService.js';
import calorieTargetReviewService from '../services/calorieTargetReviewService.js';

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  getUserPreferences: vi.fn(),
  getMeasurements: vi.fn(),
  getLatestMeasurement: vi.fn(),
  getNutritionData: vi.fn(),
  calculateBmr: vi.fn(),
}));

vi.mock('../models/userRepository.js', () => ({
  default: { getUserProfile: mocks.getUserProfile },
}));
vi.mock('../models/preferenceRepository.js', () => ({
  default: { getUserPreferences: mocks.getUserPreferences },
}));
vi.mock('../models/measurementRepository.js', () => ({
  default: {
    getCheckInMeasurementsByDateRange: mocks.getMeasurements,
    getLatestMeasurement: mocks.getLatestMeasurement,
  },
}));
vi.mock('../models/reportRepository.js', () => ({
  default: { getNutritionData: mocks.getNutritionData },
}));
vi.mock('../services/goalService.js', () => ({
  default: { getUserGoals: async () => ({ calories: 3000 }) },
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: async () => 'UTC',
}));

vi.mock('../models/calorieRuleHistoryRepository.js', () => ({
  default: { getCalorieRuleHistory: async () => [] },
}));
vi.mock('../services/bmrService.js', () => ({
  default: {
    calculateBmr: mocks.calculateBmr,
    ActivityMultiplier: { moderate: 1 },
  },
}));

const day = '2026-11-01';
beforeEach(() => mocks.calculateBmr.mockReturnValue(2500));
const dates = Array.from({ length: 140 }, (_, i) => addDays(day, i - 140));
type Weight = { entry_date: string; weight: number | null };
const dailyWeights = (weight: (index: number) => number): Weight[] =>
  dates.map((entry_date, i) => ({ entry_date, weight: weight(i) }));
const fixture = (weights: Weight[], calories = 3000) => ({
  profile: { date_of_birth: '1990-01-01', gender: 'male' },
  preferences: { activity_level: 'moderate' },
  latestMeasurement: { weight: 70, height: 180 },
  checkInMeasurements: weights,
  nutritionData: dates.map((date) => ({ date, calories })),
});

const mockData = (data: ReturnType<typeof fixture>) => {
  mocks.getUserProfile.mockResolvedValue(data.profile);
  mocks.getUserPreferences.mockResolvedValue(data.preferences);
  mocks.getMeasurements.mockResolvedValue(data.checkInMeasurements);
  mocks.getLatestMeasurement.mockResolvedValue(data.latestMeasurement);
  mocks.getNutritionData.mockResolvedValue(data.nutritionData);
};

describe('bounded adaptive expenditure integration (#3485)', () => {
  it('does not fall to BMR when a sliding week loses its only reading', () => {
    const weights = [
      ...dates.slice(0, 112).map((entry_date) => ({ entry_date, weight: 70 })),
      ...[
        '2026-10-04',
        '2026-10-05',
        '2026-10-11',
        '2026-10-18',
        '2026-10-31',
      ].map((entry_date) => ({ entry_date, weight: 70 })),
    ];
    const data = fixture(weights);
    const before = computeAdaptiveTdeeFromData(data, day);
    const after = computeAdaptiveTdeeFromData(data, addDays(day, 1));
    expect(before.isFallback).toBe(false);
    expect(after.isFallback).toBe(false);
    expect(after.tdee).toBeGreaterThan(2750);
    expect(Math.abs(after.tdee - before.tdee)).toBeLessThanOrEqual(
      ADAPTIVE_TDEE_STABILITY_MAX_DAILY_CHANGE_KCAL
    );
  });

  it('fits actual dates instead of opposite one-day weekly representatives', () => {
    const weights = [
      ...dates.slice(0, 112).map((entry_date) => ({ entry_date, weight: 70 })),
      ...[
        ['2026-10-04', 70.6],
        ['2026-10-10', 70.2],
        ['2026-10-11', 69.6],
        ['2026-10-24', 70.7],
        ['2026-10-25', 70.1],
        ['2026-10-31', 71],
      ].map(([entry_date, weight]) => ({
        entry_date: String(entry_date),
        weight: Number(weight),
      })),
    ];
    const result = computeAdaptiveTdeeFromData(fixture(weights), day);
    expect(result.isFallback).toBe(false);
    expect(result.dailyWeightChangeKg).toBeGreaterThan(0);
    expect(result.dailyWeightChangeKg).toBeLessThan(0.05);
    expect(result.weightChangeCalories).toBeLessThan(0);
    expect(result.rawTdee).toBeLessThan(3000);
    expect(result.weightTrendMethod).toBe('bounded_daily');
    expect(result).not.toHaveProperty('weeklyMedianDailyWeightChangeKg');
  });

  it.each([1, -1])(
    'preserves an established %s quarter-kg/week trend',
    (sign) => {
      const weights = dailyWeights((i) => 70 + (sign * (i - 139)) / 28);
      const result = computeAdaptiveTdeeFromData(fixture(weights, 2600), day);
      expect(result.tdee).toBe(Math.round(2600 - (sign * 6000) / 28));
      expect(result.dailyWeightChangeKg).toBeCloseTo(sign / 28, 4);
      expect(result.stabilizationDays).toBe(ADAPTIVE_TDEE_STABILITY_DAYS);
      expect(result.stabilityAdjustmentKcal).toBe(0);
    }
  );

  it('gives an established weekly logger usable confidence', () => {
    const weights = dates
      .filter((_, i) => i % 7 === 0)
      .map((entry_date) => ({
        entry_date,
        weight: 70,
      }));
    const result = computeAdaptiveTdeeFromData(fixture(weights), day);
    expect(result.isFallback).toBe(false);
    expect(result.confidence).toBe('MEDIUM');
    expect(result.stabilizationDays).toBe(ADAPTIVE_TDEE_STABILITY_DAYS);
    expect(result.historyReliable).toBe(true);
    expect(result.tdee).toBe(3000);
  });

  it('retains the last complete evidence after a missed weekly reading', () => {
    const weights = dailyWeights(() => 70).filter(
      (w) => w.entry_date <= '2026-10-25'
    );
    const data = fixture(weights);
    const before = computeAdaptiveTdeeFromData(data, day);
    data.nutritionData = data.nutritionData.map((entry) => ({
      ...entry,
      calories: entry.date > '2026-10-25' ? 1000 : entry.calories,
    }));
    const after = computeAdaptiveTdeeFromData(data, addDays(day, 1));
    expect(before.tdee).toBe(3000);
    expect(after.tdee).toBe(3000);
    expect(after.isFallback).toBe(false);
    expect(after.avgIntake).toBe(3000);
    expect(after.estimateStatus).toBe('held');
    expect(after.candidateDate).toBe('2026-10-26');
    expect(after.daysSinceLastWeight).toBe(8);
  });

  it('releases the first mature goal gradually with reconcilable arithmetic', () => {
    const data = fixture(dailyWeights(() => 70).slice(-15));
    data.nutritionData = data.nutritionData.slice(-15, -1);
    const before = computeAdaptiveTdeeFromData(data, addDays(day, -1));
    const after = computeAdaptiveTdeeFromData(data, day);
    expect(before.isFallback).toBe(true);
    expect(before.tdee).toBe(2500);
    expect(after.isFallback).toBe(false);
    expect(after.daysOfData).toBe(14);
    expect(after.stabilizationDays).toBe(1);
    expect(after.estimateStatus).toBe('learning');
    expect(after.tdee).toBe(2518);
    expect(after.rawTdee).toBe(3000);
    expect(after.stabilityAdjustmentKcal).toBe(after.tdee - 3000);
    expect(adaptiveTdeeResponseSchema.safeParse(after).success).toBe(true);
  });

  it('excludes today/future data, then bounds a newly closed outlier', () => {
    const data = fixture(dailyWeights(() => 70));
    const before = computeAdaptiveTdeeFromData(data, day);
    data.checkInMeasurements.push(
      { entry_date: day, weight: 170 },
      { entry_date: addDays(day, 1), weight: 1 }
    );
    data.nutritionData.push({ date: day, calories: 3000 });
    expect(computeAdaptiveTdeeFromData(data, day).tdee).toBe(before.tdee);
    const after = computeAdaptiveTdeeFromData(data, addDays(day, 1));
    expect(Math.abs(after.tdee - before.tdee)).toBeLessThanOrEqual(
      ADAPTIVE_TDEE_STABILITY_MAX_DAILY_CHANGE_KCAL
    );
    expect(after.lastWeightDate).toBe(day);
  });

  it('subtracts activity from each raw candidate before its own cap/filter', () => {
    const data = {
      ...fixture(dailyWeights(() => 70)),
      preferences: {
        activity_level: 'moderate',
        calorie_goal_adjustment_mode: 'dynamic',
        goal_mode_calculation_method: 'adaptive',
        adaptive_activity_separate: true,
      },
      activityCaloriesByDate: new Map(dates.map((date) => [date, 600])),
    };
    const result = computeAdaptiveTdeeFromData(data, day);
    expect(result.tdee).toBe(3000);
    expect(result.rawActivityAdjustedTdee).toBe(2400);
    expect(result.activityAdjustedTdee).toBe(2400);
    expect(result.activityStabilityAdjustmentKcal).toBe(0);
  });

  it('agrees across range, reverse single-day calls and cache warmth', async () => {
    const userId = 'revision-range-parity';
    const data = fixture(
      dailyWeights((i) => 70 + 0.02 * i + 0.2 * Math.sin(i)),
      2700
    );
    // Repositories may supply a broader range; a later record never changes
    // an earlier calculation's canonical support.
    data.checkInMeasurements.push({ entry_date: addDays(day, 1), weight: 170 });
    mockData(data);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    try {
      clearUserTdeeCache(userId);
      const range = await calculateAdaptiveTdeeRange(
        userId,
        addDays(day, -6),
        day
      );
      for (let ago = 0; ago <= 6; ago++) {
        const calculationDay = addDays(day, -ago);
        // Clear first, so equality cannot be satisfied by the range cache.
        clearUserTdeeCache(userId);
        const cold = await calculateAdaptiveTdee(userId, calculationDay);
        expect(cold).toEqual(range[calculationDay]);
        expect(await calculateAdaptiveTdee(userId, calculationDay)).toEqual(
          cold
        );
      }
    } finally {
      clearUserTdeeCache(userId);
      vi.useRealTimers();
    }
  });

  it('lets the actual target review assess an established weekly logger', async () => {
    const userId = 'revision-weekly-review';
    mockData(
      fixture(
        dates
          .filter((_, i) => i % 7 === 0)
          .map((entry_date) => ({
            entry_date,
            weight: 70,
          }))
      )
    );
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    try {
      clearUserTdeeCache(userId);
      const estimate = await calculateAdaptiveTdee(userId, day);
      expect(estimate.confidence).toBe('MEDIUM');
      const review = await calorieTargetReviewService.getCalorieTargetReview(
        userId,
        0
      );
      expect(review.status).toBe('on_track');
      expect(review.observedKgPerWeek).toBe(0);
    } finally {
      clearUserTdeeCache(userId);
      vi.useRealTimers();
    }
  });

  it('does not blame incomplete food logging when every measured interval day was logged', async () => {
    const userId = 'revision-complete-irregular-review';
    mockData(
      fixture(
        dates
          .filter((_, index) => [0, 9, 19].includes(index % 28))
          .map((entry_date) => ({ entry_date, weight: 70 }))
      )
    );
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    try {
      clearUserTdeeCache(userId);
      const estimate = await calculateAdaptiveTdee(userId, day);
      expect(estimate.historyReliable).toBe(true);
      expect(estimate.confidence).toBe('MEDIUM');
      expect(estimate.daysOfData).toBe(19);
      expect(estimate.weightObservationSpanDays).toBe(19);
      const review = await calorieTargetReviewService.getCalorieTargetReview(
        userId,
        0
      );
      expect(review.status).toBe('on_track');
      expect(review.daysLogged).toBe(19);
      expect(review.windowDays).toBe(19);
    } finally {
      clearUserTdeeCache(userId);
      vi.useRealTimers();
    }
  });

  it.each([
    [2500.4996, 4000],
    [2500.4996, 400],
    [2500.5004, 4000],
    [2500.5004, 400],
  ])(
    'keeps rounded plausibility metadata coherent at baseline %s and intake %s',
    (formula, intake) => {
      mocks.calculateBmr.mockReturnValue(formula);
      const data = {
        ...fixture(
          dailyWeights(() => 70),
          intake
        ),
        preferences: {
          activity_level: 'moderate',
          calorie_goal_adjustment_mode: 'dynamic',
          goal_mode_calculation_method: 'adaptive',
          adaptive_activity_separate: true,
        },
        activityCaloriesByDate: new Map(dates.map((date) => [date, 600])),
      };
      const result = computeAdaptiveTdeeFromData(data, day);
      if (
        result.clampMin === undefined ||
        result.clampMax === undefined ||
        result.activityAdjustedTdee === undefined
      ) {
        throw new Error('Missing learned plausibility metadata');
      }
      expect(result.isFallback).toBe(false);
      for (const value of [result.tdee, result.activityAdjustedTdee]) {
        expect(value).toBeGreaterThanOrEqual(result.clampMin);
        expect(value).toBeLessThanOrEqual(result.clampMax);
      }
      // All daily inputs are the same capped candidate; there is no history
      // adjustment. Baseline precision must agree in fallback, cap and filter.
      expect(result.stabilityAdjustmentKcal).toBe(0);
      expect(result.activityStabilityAdjustmentKcal).toBe(0);
      const fallback = computeAdaptiveTdeeFromData(
        { ...data, checkInMeasurements: [], nutritionData: [] },
        day
      );
      expect(fallback.isFallback).toBe(true);
      expect(fallback.tdee).toBe((result.clampMin + result.clampMax) / 2);
    }
  );

  it.each([false, true])(
    'preserves the displayed bound for fractional step inputs (activity=%s)',
    (separateActivity) => {
      mocks.calculateBmr.mockReturnValue(2565.25);
      const traceDays = Array.from({ length: 130 }, (_, i) =>
        addDays('2026-11-22', i - 130)
      );
      const data = {
        ...fixture(traceDays.map((entry_date) => ({ entry_date, weight: 70 }))),
        preferences: {
          activity_level: 'moderate',
          calorie_goal_adjustment_mode: 'dynamic',
          goal_mode_calculation_method: 'adaptive',
          adaptive_activity_separate: separateActivity,
        },
        activityCaloriesByDate: new Map(traceDays.map((date) => [date, 600])),
      };
      data.nutritionData = traceDays.map((date) => ({
        date,
        calories:
          (date < '2026-11-01' ? 1700.235294117647 : 4000.2745098039227) +
          (separateActivity ? 600 : 0),
      }));
      // Independent closed-form OLS interval weights t*(28-t)/3654 produce
      // integer-input means2365.67425 and2401.388535714286 for this trace.
      // This retains the original fractional input vector under the new window.
      const before = computeAdaptiveTdeeFromData(data, '2026-11-21');
      const after = computeAdaptiveTdeeFromData(data, '2026-11-22');
      const priorValue = separateActivity
        ? before.activityAdjustedTdee
        : before.tdee;
      const nextValue = separateActivity
        ? after.activityAdjustedTdee
        : after.tdee;
      if (priorValue === undefined || nextValue === undefined)
        throw new Error('Missing filtered expenditure');
      expect(priorValue).toBe(2366);
      expect(nextValue).toBe(2401);
      expect(nextValue - priorValue).toBe(35);
      expect(Math.abs(after.tdee - before.tdee)).toBeLessThanOrEqual(
        ADAPTIVE_TDEE_STABILITY_MAX_DAILY_CHANGE_KCAL
      );
    }
  );
});
