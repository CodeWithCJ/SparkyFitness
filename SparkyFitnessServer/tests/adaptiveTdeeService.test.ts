import { vi, beforeEach, describe, expect, test } from 'vitest';
import { calculateAdaptiveTdee } from '../services/AdaptiveTdeeService.js';
import userRepository from '../models/userRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import reportRepository from '../models/reportRepository.js';
import bmrService from '../services/bmrService.js';
import { subDays, format, startOfDay } from 'date-fns';
vi.mock('../models/userRepository');
vi.mock('../models/preferenceRepository');
vi.mock('../models/measurementRepository');
vi.mock('../models/reportRepository');
vi.mock('../services/bmrService');
vi.mock('../config/logging');
describe('AdaptiveTdeeService', () => {
  const userId = 'test-user-123';
  const calculationDate = startOfDay(new Date());
  const calculationDateStr = format(calculationDate, 'yyyy-MM-dd');
  beforeEach(() => {
    vi.clearAllMocks();
  });
  test('should calculate TDEE correctly without ReferenceError', async () => {
    // Mock data
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    userRepository.getUserProfile.mockResolvedValue({
      date_of_birth: '1990-01-01',
      gender: 'male',
    });
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    preferenceRepository.getUserPreferences.mockResolvedValue({
      bmr_algorithm: 'Mifflin-St Jeor',
      activity_level: 'moderate',
    });
    // Mock weight entries spanning 35 days
    const weightEntries = [];
    for (let i = 0; i < 35; i += 7) {
      weightEntries.push({
        entry_date: format(subDays(calculationDate, 35 - i), 'yyyy-MM-dd'),
        weight: 80 - i / 7, // Slight weight loss
      });
    }
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    measurementRepository.getCheckInMeasurementsByDateRange.mockResolvedValue(
      weightEntries
    );
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    measurementRepository.getLatestMeasurement.mockResolvedValue({
      weight: 80,
      height: 180,
    });
    // Mock nutrition data for last 35 days
    const nutritionData = [];
    for (let i = 0; i < 35; i++) {
      nutritionData.push({
        date: format(subDays(calculationDate, i), 'yyyy-MM-dd'),
        calories: 2500,
      });
    }
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    reportRepository.getNutritionData.mockResolvedValue(nutritionData);
    // @ts-expect-error TS(2339): Property 'mockReturnValue' does not exist on type ... Remove this comment to see the full error message
    bmrService.calculateBmr.mockReturnValue(1800);
    // @ts-expect-error TS(2322): Type '{ moderate: number; }' is not assignable to ... Remove this comment to see the full error message
    bmrService.ActivityMultiplier = { moderate: 1.55 };
    const result = await calculateAdaptiveTdee(userId, calculationDateStr);
    expect(result).toBeDefined();
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    expect(result.tdee).toBeGreaterThan(0);
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    expect(result.isFallback).toBe(false);
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    expect(result.daysOfData).toBeGreaterThanOrEqual(28);
  });
  test('should return fallback if insufficient weight data', async () => {
    const fallbackUserId = 'test-user-fallback';
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    userRepository.getUserProfile.mockResolvedValue({});
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    preferenceRepository.getUserPreferences.mockResolvedValue({});
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    measurementRepository.getCheckInMeasurementsByDateRange.mockResolvedValue([
      { entry_date: calculationDateStr, weight: 80 },
    ]);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    measurementRepository.getLatestMeasurement.mockResolvedValue({
      weight: 80,
    });
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    reportRepository.getNutritionData.mockResolvedValue([]);
    // @ts-expect-error TS(2339): Property 'mockReturnValue' does not exist on type ... Remove this comment to see the full error message
    bmrService.calculateBmr.mockReturnValue(1800);
    const result = await calculateAdaptiveTdee(
      fallbackUserId,
      calculationDateStr
    );
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    expect(result.isFallback).toBe(true);
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    expect(result.fallbackReason).toContain('Insufficient weight entries');
  });
});
