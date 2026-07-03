import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getDashboardStats } from '../services/DashboardService.js';
import goalService from '../services/goalService.js';
import reportRepository from '../models/reportRepository.js';
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

vi.mock('../models/measurementRepository.js', () => ({
  default: {
    getLatestMeasurement: vi.fn(),
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
  vi.mocked(userRepository.getUserProfile).mockResolvedValue(baseProfile);
  vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue(
    basePreferences
  );
  vi.mocked(measurementRepository.getLatestMeasurement).mockResolvedValue(
    baseMeasurements
  );
  vi.mocked(
    measurementRepository.getCheckInMeasurementsByDate
  ).mockResolvedValue({ steps: '5000' });
  vi.mocked(measurementRepository.getExternalBmrForDate).mockResolvedValue(
    null
  );
});

describe('getDashboardStats includeCheckin gate', () => {
  test('includeCheckin=true reads measurements, steps, and passes adjust=true to goalService', async () => {
    await getDashboardStats('user1', '2026-06-13', true);

    expect(goalService.getUserGoals).toHaveBeenCalledWith(
      'user1',
      '2026-06-13',
      undefined,
      true
    );
    expect(measurementRepository.getLatestMeasurement).toHaveBeenCalledWith(
      'user1'
    );
    expect(
      measurementRepository.getCheckInMeasurementsByDate
    ).toHaveBeenCalledWith('user1', '2026-06-13');
  });

  test('includeCheckin=false skips measurements, steps, and passes adjust=false to goalService', async () => {
    await getDashboardStats('user1', '2026-06-13', false);

    expect(goalService.getUserGoals).toHaveBeenCalledWith(
      'user1',
      '2026-06-13',
      undefined,
      false
    );
    expect(measurementRepository.getLatestMeasurement).not.toHaveBeenCalled();
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
