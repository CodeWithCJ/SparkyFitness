import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CALORIE_RULE_DEFAULTS } from '@workspace/shared';
import reportService from '../services/reportService.js';
import reportRepository from '../models/reportRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import userRepository from '../models/userRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import calorieRuleHistoryRepository from '../models/calorieRuleHistoryRepository.js';
import bmrService from '../services/bmrService.js';
import sleepAnalyticsService from '../services/sleepAnalyticsService.js';
import customNutrientService from '../services/customNutrientService.js';
import medicationRepository from '../models/medicationRepository.js';
import medicationEntryRepository from '../models/medicationEntryRepository.js';
import symptomRepository from '../models/symptomRepository.js';
import injectionRepository from '../models/injectionRepository.js';
import titrationRepository from '../models/titrationRepository.js';

vi.mock('../models/reportRepository.js');
vi.mock('../models/measurementRepository.js');
vi.mock('../models/userRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../models/calorieRuleHistoryRepository.js');
vi.mock('../services/goalService.js');
vi.mock('../services/bmrService.js');
vi.mock('../services/sleepAnalyticsService.js');
vi.mock('../services/customNutrientService.js');
vi.mock('../models/medicationRepository.js');
vi.mock('../models/medicationEntryRepository.js');
vi.mock('../models/symptomRepository.js');
vi.mock('../models/injectionRepository.js');
vi.mock('../models/titrationRepository.js');

describe('the BMR of each day in Reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(customNutrientService.getCustomNutrients).mockResolvedValue([]);
    vi.mocked(reportRepository.getNutritionData).mockResolvedValue([
      { date: '2026-10-19', calories: 1800 },
      { date: '2026-10-20', calories: 1800 },
    ]);
    vi.mocked(reportRepository.getTabularFoodData).mockResolvedValue([]);
    vi.mocked(reportRepository.getExerciseEntries).mockResolvedValue([]);
    vi.mocked(reportRepository.getMeasurementData).mockResolvedValue([
      { entry_date: '2026-10-01', weight: 80, height: 180 },
    ]);
    vi.mocked(measurementRepository.getCustomCategories).mockResolvedValue([]);
    vi.mocked(
      measurementRepository.getWaterTotalsByDateRange
    ).mockResolvedValue([]);
    vi.mocked(userRepository.getUserProfile).mockResolvedValue({
      date_of_birth: '1990-10-20',
      gender: 'male',
    });
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      ...CALORIE_RULE_DEFAULTS,
      timezone: 'UTC',
    });
    vi.mocked(sleepAnalyticsService.getSleepAnalytics).mockResolvedValue([]);
    vi.mocked(medicationRepository.listMedications).mockResolvedValue([]);
    vi.mocked(medicationEntryRepository.listEntries).mockResolvedValue([]);
    vi.mocked(symptomRepository.listSymptomEntries).mockResolvedValue([]);
    vi.mocked(injectionRepository.listInjections).mockResolvedValue([]);
    vi.mocked(titrationRepository.listStepsForUser).mockResolvedValue([]);
    vi.mocked(bmrService.calculateBmr).mockImplementation(
      (algorithm, _weight, _height, age) =>
        (algorithm === 'Oxford' ? 1000 : 2000) + (age ?? 0)
    );
  });

  it('uses the settings in force and the age on that day', async () => {
    // Oxford until a switch to Mifflin-St Jeor on the 20th, the birthday.
    vi.mocked(
      calorieRuleHistoryRepository.getCalorieRuleHistory
    ).mockResolvedValue([
      {
        ...CALORIE_RULE_DEFAULTS,
        bmr_algorithm: 'Oxford',
        effective_date: '-infinity',
      },
      { ...CALORIE_RULE_DEFAULTS, effective_date: '2026-10-20' },
    ]);

    const { nutritionData } = await reportService.getReportsData(
      'user-1',
      'user-1',
      '2026-10-19',
      '2026-10-20'
    );

    expect(
      nutritionData.map((day: Record<string, unknown>) => [day.date, day.bmr])
    ).toEqual([
      ['2026-10-19', 1035],
      ['2026-10-20', 2036],
    ]);
  });
});
