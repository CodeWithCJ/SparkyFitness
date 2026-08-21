import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getDashboardStats } from '../services/DashboardService.js';
import goalService from '../services/goalService.js';
import reportRepository from '../models/reportRepository.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import measurementRepository from '../models/measurementRepository.js';
import userRepository from '../models/userRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';

vi.mock('../services/goalService.js', () => ({
  default: { getUserGoals: vi.fn() },
}));

vi.mock('../models/reportRepository.js', () => ({
  default: {
    getNutritionData: vi.fn(),
    getExerciseEntries: vi.fn(),
  },
}));

vi.mock('../models/exerciseEntry.js', () => ({
  default: { getDailyExerciseCalorieSplitRange: vi.fn() },
}));

vi.mock('../models/measurementRepository.js', () => ({
  default: {
    getLatestMeasurement: vi.fn(),
    getLatestCheckInMeasurementsOnOrBeforeDate: vi.fn(),
    getLatestWeightHeight: vi.fn(),
    getCheckInMeasurementsByDate: vi.fn(),
    getExternalBmrForDate: vi.fn(),
  },
}));

vi.mock('../models/userRepository.js', () => ({
  default: { getUserProfile: vi.fn() },
}));

vi.mock('../models/preferenceRepository.js', () => ({
  default: { getUserPreferences: vi.fn() },
}));

vi.mock('../services/bmrService.js', () => ({
  default: {
    calculateBmr: vi.fn().mockReturnValue(1800),
    ActivityMultiplier: {
      not_much: 1.2,
      sedentary: 1.2,
      light: 1.375,
      lightly_active: 1.375,
    },
  },
}));

const basePreferences = {
  activity_level: 'not_much',
  include_bmr_in_net_calories: false,
  calorie_goal_adjustment_mode: 'dynamic',
  use_external_bmr: false,
  timezone: 'UTC',
};

const baseProfile = { date_of_birth: '1990-01-01', gender: 'male' };
const baseMeasurements = {
  weight: '75',
  height: '175',
  body_fat_percentage: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(goalService.getUserGoals).mockResolvedValue({ calories: 2000 });
  vi.mocked(reportRepository.getNutritionData).mockResolvedValue([
    { calories: '1500' },
  ]);
  vi.mocked(reportRepository.getExerciseEntries).mockResolvedValue([]);
  vi.mocked(
    exerciseEntryRepository.getDailyExerciseCalorieSplitRange
  ).mockResolvedValue([]);
  vi.mocked(userRepository.getUserProfile).mockResolvedValue(baseProfile);
  vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue(
    basePreferences
  );
  vi.mocked(measurementRepository.getLatestMeasurement).mockResolvedValue(
    baseMeasurements
  );
  vi.mocked(
    measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
  ).mockResolvedValue(baseMeasurements);
  vi.mocked(measurementRepository.getLatestWeightHeight).mockResolvedValue({
    weightKg: 75,
    heightCm: 175,
  });
  vi.mocked(
    measurementRepository.getCheckInMeasurementsByDate
  ).mockResolvedValue({ steps: '5000' });
  vi.mocked(measurementRepository.getExternalBmrForDate).mockResolvedValue(
    null
  );
});

describe('getDashboardStats includeCheckin gate', () => {
  test('includeCheckin=true reads measurements and steps', async () => {
    await getDashboardStats('user1', '2026-06-13', true);

    expect(goalService.getUserGoals).toHaveBeenCalledWith(
      'user1',
      '2026-06-13',
      undefined,
      true
    );
    expect(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).toHaveBeenCalledWith('user1', '2026-06-13');
    expect(
      measurementRepository.getCheckInMeasurementsByDate
    ).toHaveBeenCalledWith('user1', '2026-06-13');
  });

  // `adjust` stays true even here: /daily-summary and /daily-summary/range both pass
  // true for the same actor, so gating it only made this endpoint disagree with them.
  test('includeCheckin=false skips measurements and steps but still requests an adjusted goal', async () => {
    await getDashboardStats('user1', '2026-06-13', false);

    expect(goalService.getUserGoals).toHaveBeenCalledWith(
      'user1',
      '2026-06-13',
      undefined,
      true
    );
    expect(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).not.toHaveBeenCalled();
    expect(
      measurementRepository.getCheckInMeasurementsByDate
    ).not.toHaveBeenCalled();
  });

  test('includeCheckin=false zeroes out steps and step calories in response', async () => {
    const result = await getDashboardStats('user1', '2026-06-13', false);

    expect(result.steps).toBe(0);
    expect(result.stepCalories).toBe(0);
  });

  test('includeCheckin=false skips external BMR even when use_external_bmr=true', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      ...basePreferences,
      use_external_bmr: true,
    });

    await getDashboardStats('user1', '2026-06-13', false);

    expect(measurementRepository.getExternalBmrForDate).not.toHaveBeenCalled();
  });

  test('includeCheckin=true applies external BMR when use_external_bmr=true and value is in range', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      ...basePreferences,
      use_external_bmr: true,
    });
    vi.mocked(measurementRepository.getExternalBmrForDate).mockResolvedValue(
      1950
    );

    const result = await getDashboardStats('user1', '2026-06-13', true);

    expect(measurementRepository.getExternalBmrForDate).toHaveBeenCalledWith(
      'user1',
      '2026-06-13'
    );
    expect(result.bmr).toBe(1950);
  });
});

describe('getDashboardStats calorie arithmetic', () => {
  /**
   * The widget must show the number the Diary shows. Previously it summed the device
   * "Active Calories" row and logged workouts instead of taking the larger of the two,
   * the same defect as issue #2094 on the Reports page.
   */
  test('does not double-count device Active Calories on top of logged workouts', async () => {
    vi.mocked(
      exerciseEntryRepository.getDailyExerciseCalorieSplitRange
    ).mockResolvedValue([
      {
        entry_date: '2026-06-13',
        active_calories: 774,
        other_calories: 641,
        activity_steps: 0,
      },
    ]);
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDate
    ).mockResolvedValue({ steps: '0' });

    const result = await getDashboardStats('user1', '2026-06-13', true);

    // max(774, 641 + 0) = 774, not 1415.
    expect(result.burned).toBe(774);
  });

  /**
   * The old code read exercise rows from a query whose SELECT omits `steps`, so
   * `activitySteps` was always 0 and steps a logged workout already charged for were
   * billed again as background walking.
   */
  test('subtracts workout steps from the day total before crediting background steps', async () => {
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDate
    ).mockResolvedValue({ steps: '10000' });

    vi.mocked(
      exerciseEntryRepository.getDailyExerciseCalorieSplitRange
    ).mockResolvedValue([
      {
        entry_date: '2026-06-13',
        active_calories: 0,
        other_calories: 0,
        activity_steps: 0,
      },
    ]);
    const allBackground = await getDashboardStats('user1', '2026-06-13', true);

    vi.mocked(
      exerciseEntryRepository.getDailyExerciseCalorieSplitRange
    ).mockResolvedValue([
      {
        entry_date: '2026-06-13',
        active_calories: 0,
        other_calories: 0,
        activity_steps: 6000,
      },
    ]);
    const withWorkoutSteps = await getDashboardStats(
      'user1',
      '2026-06-13',
      true
    );

    // Same 10,000 check-in steps, but 6,000 of them belong to a logged workout.
    expect(allBackground.steps).toBe(10000);
    expect(withWorkoutSteps.steps).toBe(10000);
    expect(withWorkoutSteps.stepCalories).toBeLessThan(
      allBackground.stepCalories
    );
    expect(withWorkoutSteps.stepCalories).toBeGreaterThan(0);
  });

  /**
   * The Diary reports progress above 100% when the user eats over budget (the #2094
   * screenshots show 103%, 112%, 113%). The widget used to clamp at 100, so the two
   * disagreed on exactly the days a user most wants to notice.
   */
  test('reports progress above 100% instead of clamping, matching the Diary', async () => {
    vi.mocked(reportRepository.getNutritionData).mockResolvedValue([
      { calories: '3000' },
    ]);
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDate
    ).mockResolvedValue({ steps: '0' });

    const result = await getDashboardStats('user1', '2026-06-13', true);

    // Ate 3000 against a 2000 goal with nothing burned.
    expect(result.progress).toBe(150);
  });
});
