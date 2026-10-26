import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, isAdaptiveEarnBackSuppressed } from '@workspace/shared';
import {
  calculateAdaptiveTdee,
  calculateAdaptiveTdeeRange,
  computeAdaptiveTdeeFromData,
} from '../services/AdaptiveTdeeService.js';
import { computeCalorieBalance } from '../services/calorieBalanceService.js';
import preferenceRepository from '../models/preferenceRepository.js';
import userRepository from '../models/userRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import reportRepository from '../models/reportRepository.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';

vi.mock('../models/calorieRuleHistoryRepository.js', () => ({
  default: { getCalorieRuleHistory: async () => [] },
}));
vi.mock('../models/userRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../models/measurementRepository.js');
vi.mock('../models/reportRepository.js');
vi.mock('../models/exerciseEntry.js');

vi.mock('../services/bmrService.js', () => ({
  default: {
    calculateBmr: vi.fn(() => 1700),
    ActivityMultiplier: { not_much: 1.2 },
  },
}));

const days = Array.from({ length: 91 }, (_, i) => addDays('2026-07-24', i));
const date = days[90];
const data = (enabled = true, mode = 'dynamic') => ({
  profile: { date_of_birth: '1990-01-01', gender: 'male' },
  preferences: {
    activity_level: 'not_much',
    calorie_goal_adjustment_mode: mode,
    goal_mode_calculation_method: 'adaptive',
    adaptive_activity_separate: enabled,
  },
  latestMeasurement: { weight: 80, height: 180 },
  checkInMeasurements: days.map((day) => ({ entry_date: day, weight: 80 })),
  nutritionData: days.map((day) => ({ date: day, calories: 2900 })),
  activityCaloriesByDate: new Map(days.map((day) => [day, 900])),
});

beforeEach(() => vi.clearAllMocks());

describe('adaptive activity separation', () => {
  it('deducts historical activity before capping the learned baseline', () => {
    const result = computeAdaptiveTdeeFromData(data(), date);
    // Full-day cap is 1700 * 1.2 + 500 = 2540. Subtracting from that
    // would wrongly learn 1640 instead of 2900 - 900 = 2000.
    expect(result.tdee).toBe(2540);
    expect(result.averageActivityCalories).toBe(900);
    expect(result.rawActivityAdjustedTdee).toBe(2000);
    expect(result.activityAdjustedTdee).toBe(2000);
    expect(result.activityDaysOfData).toBe(28);
  });

  it('uses the same qualifying food days for the activity average', () => {
    const inputs = data();
    // The last day of the window is the day before the calculation date.
    inputs.nutritionData[89].calories = 199;
    inputs.activityCaloriesByDate.set(days[89], 10000);
    const result = computeAdaptiveTdeeFromData(inputs, date);
    expect(result.averageActivityCalories).toBe(900);
    expect(result.activityDaysOfData).toBe(27);
    expect(result.activityAdjustedTdee).toBe(2000);
  });

  it.each(['adaptive', 'fixed', 'percentage', 'tdee'])(
    'leaves %s unchanged even when the preference is saved',
    (mode) => {
      const result = computeAdaptiveTdeeFromData(data(true, mode), date);
      expect(result.tdee).toBe(2540);
      expect(result.activityAdjustedTdee).toBeUndefined();
    }
  );

  it('preserves the existing full-day estimate by default', () => {
    const result = computeAdaptiveTdeeFromData(data(false), date);
    expect(result.tdee).toBe(2540);
    expect(result.activityAdjustedTdee).toBeUndefined();
  });

  it('enables earn-back only for dynamic adaptive targets with the opt-in', () => {
    expect(isAdaptiveEarnBackSuppressed('dynamic', 'adaptive', true)).toBe(
      false
    );
    expect(isAdaptiveEarnBackSuppressed('dynamic', 'adaptive', false)).toBe(
      true
    );
    expect(isAdaptiveEarnBackSuppressed('percentage', 'adaptive', true)).toBe(
      true
    );
  });

  it.each([false, true])(
    'credits daily activity once and never adds BMR again (include BMR: %s)',
    (includeBmr) => {
      const balance = computeCalorieBalance({
        date: '2026-10-01',
        eatenCalories: 2500,
        adjustedGoalCalories: 2000,
        exercise: { activeCalories: 800, otherCalories: 700, activitySteps: 0 },
        backgroundStepCalories: 200,
        userProfile: { gender: 'male', date_of_birth: '1990-01-01' },
        userPreferences: {
          calorie_goal_adjustment_mode: 'dynamic',
          goal_mode_calculation_method: 'adaptive',
          adaptive_activity_separate: true,
          include_bmr_in_net_calories: includeBmr,
        },
        measurements: { weight: 80, height: 180 },
        dayFraction: 1,
      });
      // Resolved activity = max(device 800, workout 700 + steps 200) = 900.
      expect(balance.remaining).toBe(400);
      expect(balance.eaten + balance.remaining).toBe(2900);
      expect(balance.burned).toBe(includeBmr ? 2600 : 900);
    }
  );

  it('uses resolved workouts/steps in both single-day and ranged estimates and refreshes activity edits', async () => {
    const fixture = data();
    vi.mocked(userRepository.getUserProfile).mockResolvedValue(fixture.profile);
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue(
      fixture.preferences
    );
    vi.mocked(measurementRepository.getLatestMeasurement).mockResolvedValue(
      fixture.latestMeasurement
    );
    vi.mocked(measurementRepository.getLatestWeightHeight).mockResolvedValue({
      weightKg: 80,
      heightCm: 180,
    });
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({ weight: 80, height: 180 });
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue(
      fixture.checkInMeasurements.map((row) => ({ ...row, steps: 5000 }))
    );
    vi.mocked(reportRepository.getNutritionData).mockResolvedValue(
      fixture.nutritionData
    );
    const splits = days.map((day) => ({
      entry_date: day,
      active_calories: 800,
      other_calories: 900,
      activity_steps: 5000,
    }));
    vi.mocked(
      exerciseEntryRepository.getDailyExerciseCalorieSplitRange
    ).mockResolvedValue(splits);
    const single = await calculateAdaptiveTdee(
      'separate-activity-single',
      date
    );
    const range = await calculateAdaptiveTdeeRange(
      'separate-activity-range',
      date,
      date
    );
    expect(single.averageActivityCalories).toBe(900);
    expect(single.activityAdjustedTdee).toBe(2000);
    expect(range[date].activityAdjustedTdee).toBe(2000);

    // Imported/edited activity is immediately reflected; no hour-old baseline.
    vi.mocked(
      exerciseEntryRepository.getDailyExerciseCalorieSplitRange
    ).mockResolvedValue(
      splits.map((row) => ({
        ...row,
        active_calories: 400,
        other_calories: 500,
      }))
    );
    const edited = await calculateAdaptiveTdee(
      'separate-activity-single',
      date
    );
    expect(edited.averageActivityCalories).toBe(500);
    expect(edited.activityAdjustedTdee).toBe(2400);
  });
});
