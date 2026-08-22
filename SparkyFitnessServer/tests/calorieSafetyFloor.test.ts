import { beforeEach, describe, expect, it, vi } from 'vitest';
import goalService from '../services/goalService.js';
import goalRepository from '../models/goalRepository.js';
import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import userRepository from '../models/userRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import bmrService from '../services/bmrService.js';
import adaptiveTdeeService from '../services/AdaptiveTdeeService.js';

vi.mock('../models/goalRepository.js');
vi.mock('../models/weeklyGoalPlanRepository.js');
vi.mock('../models/goalPresetRepository.js');
vi.mock('../models/userRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../models/measurementRepository.js');
vi.mock('../models/exerciseEntry.js');
vi.mock('../services/bmrService.js');
vi.mock('../services/AdaptiveTdeeService.js');

const userId = 'user-1';
const date = '2026-08-21';

describe('goalService calorie safety floor preference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlan
    ).mockResolvedValue(null);
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([]);
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      calories: 2000,
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
    });
    vi.mocked(userRepository.getUserProfile).mockResolvedValue({
      date_of_birth: '1990-01-01',
      gender: 'female',
    });
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({
      entry_date: date,
      weight: 88,
      height: 175,
    });
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([]);
    vi.mocked(bmrService.calculateBmr).mockReturnValue(1642);
    vi.mocked(adaptiveTdeeService.calculateAdaptiveTdeeRange).mockResolvedValue(
      {
        [date]: {
          tdee: 1606,
          confidence: 'HIGH',
          isFallback: false,
          daysOfData: 60,
          lastCalculated: date,
        },
      }
    );
  });

  const prefs = (
    mode: string,
    adjustmentMode = 'fixed',
    method = 'adaptive'
  ) => ({
    calorie_goal_adjustment_mode: adjustmentMode,
    goal_mode: 'maintain',
    goal_mode_calculation_method: method,
    goal_mode_custom_percentage: 0,
    activity_level: 'not_much',
    bmr_algorithm: 'Mifflin-St Jeor',
    calorie_safety_floor_mode: mode,
    timezone: 'Europe/Berlin',
  });

  const caloriesFor = async (
    mode: string,
    adjustmentMode?: string,
    method?: string
  ) => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue(
      prefs(mode, adjustmentMode, method)
    );
    const result = await goalService.getUserGoalsForRange(
      userId,
      date,
      date,
      true
    );
    return (result[date] as { calories: number }).calories;
  };

  // The scenario from #2124: RMR 1642, measured adaptive TDEE 1606. Under
  // `standard` the RMR half of the floor overrides the measured target by 36 kcal
  // and the user is pinned there permanently, because both sides scale with body
  // size. `clinical_minimum` drops that half and lets the measurement through.
  it('clamps the measured target up to RMR under the standard floor', async () => {
    expect(await caloriesFor('standard')).toBe(1642);
  });

  it('allows a measured target below RMR under the clinical minimum floor', async () => {
    expect(await caloriesFor('clinical_minimum')).toBe(1606);
  });

  it('never allows a target below the clinical minimum, whatever the mode', async () => {
    vi.mocked(adaptiveTdeeService.calculateAdaptiveTdeeRange).mockResolvedValue(
      {
        [date]: {
          tdee: 900,
          confidence: 'HIGH',
          isFallback: false,
          daysOfData: 60,
          lastCalculated: date,
        },
      }
    );
    expect(await caloriesFor('clinical_minimum')).toBe(1200);
  });

  // The adaptive *adjustment* path keeps its own fixed 1200 bound, which predates
  // the safety-floor preference and is deliberately not governed by it. Pinned in
  // both modes so a future change there is a decision rather than an accident.
  it('leaves the adaptive adjustment path on its own fixed 1200 bound', async () => {
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      calories: 1000,
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
    });
    expect(await caloriesFor('standard', 'adaptive', 'manual')).toBe(1200);
    expect(await caloriesFor('clinical_minimum', 'adaptive', 'manual')).toBe(
      1200
    );
  });
});
