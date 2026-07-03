import { vi, beforeEach, describe, expect, test } from 'vitest';
import {
  calculateAdaptiveTdee,
  calculateAdaptiveTdeeRange,
  computeAdaptiveTdeeFromData,
} from '../services/AdaptiveTdeeService.js';
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
    // Mock weight entries spanning 90 days
    const weightEntries = [];
    for (let i = 0; i < 90; i += 7) {
      weightEntries.push({
        entry_date: format(subDays(calculationDate, 90 - i), 'yyyy-MM-dd'),
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
    // Mock nutrition data for last 90 days
    const nutritionData = [];
    for (let i = 0; i < 90; i++) {
      nutritionData.push({
        date: format(subDays(calculationDate, i), 'yyyy-MM-dd'),
        calories: 2500,
      });
    }
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    reportRepository.getNutritionData.mockResolvedValue(nutritionData);
    // @ts-expect-error TS(2339): Property 'mockReturnValue' does not exist on type ... Remove this comment to see the full error message
    bmrService.calculateBmr.mockReturnValue(1800);
    bmrService.ActivityMultiplier = { moderate: 1.55 };

    const result = await calculateAdaptiveTdee(userId, calculationDateStr);
    expect(result).toBeDefined();
    expect(result.tdee).toBeGreaterThan(0);
    expect(result.isFallback).toBe(false);
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
    expect(result.isFallback).toBe(true);
    expect(result.fallbackReason).toContain('Insufficient weight entries');
  });

  test('should compute TDEE from data synchronously using computeAdaptiveTdeeFromData', () => {
    const data = {
      profile: { date_of_birth: '1990-01-01', gender: 'male' },
      preferences: {
        bmr_algorithm: 'Mifflin-St Jeor',
        activity_level: 'moderate',
      },
      latestMeasurement: { weight: 80, height: 180 },
      checkInMeasurements: [
        {
          entry_date: format(subDays(calculationDate, 47), 'yyyy-MM-dd'),
          weight: 80,
        },
        { entry_date: format(calculationDate, 'yyyy-MM-dd'), weight: 79 },
      ],
      nutritionData: Array.from({ length: 91 }, (_, i) => ({
        date: format(subDays(calculationDate, i), 'yyyy-MM-dd'),
        calories: 2500,
      })),
    };
    // @ts-expect-error
    bmrService.calculateBmr.mockReturnValue(1800);
    bmrService.ActivityMultiplier = { moderate: 1.55 };

    const result = computeAdaptiveTdeeFromData(data, calculationDateStr);
    expect(result).toBeDefined();
    expect(result.tdee).toBeGreaterThan(0);
    expect(result.isFallback).toBe(false);
  });

  test('should calculate TDEE range correctly with calculateAdaptiveTdeeRange', async () => {
    // @ts-expect-error
    userRepository.getUserProfile.mockResolvedValue({
      date_of_birth: '1990-01-01',
      gender: 'male',
    });
    // @ts-expect-error
    preferenceRepository.getUserPreferences.mockResolvedValue({
      bmr_algorithm: 'Mifflin-St Jeor',
      activity_level: 'moderate',
    });
    // Mock weight entries spanning 90 days
    const weightEntries = [];
    for (let i = 0; i < 90; i += 7) {
      weightEntries.push({
        entry_date: format(subDays(calculationDate, 90 - i), 'yyyy-MM-dd'),
        weight: 80 - i / 7,
      });
    }
    // @ts-expect-error
    measurementRepository.getCheckInMeasurementsByDateRange.mockResolvedValue(
      weightEntries
    );
    // @ts-expect-error
    measurementRepository.getLatestMeasurement.mockResolvedValue({
      weight: 80,
      height: 180,
    });
    // Mock nutrition data for last 90 days
    const nutritionData = [];
    for (let i = 0; i < 90; i++) {
      nutritionData.push({
        date: format(subDays(calculationDate, i), 'yyyy-MM-dd'),
        calories: 2500,
      });
    }
    // @ts-expect-error
    reportRepository.getNutritionData.mockResolvedValue(nutritionData);
    // @ts-expect-error
    bmrService.calculateBmr.mockReturnValue(1800);
    bmrService.ActivityMultiplier = { moderate: 1.55 };

    const startDateStr = format(subDays(calculationDate, 2), 'yyyy-MM-dd');
    const endDateStr = calculationDateStr;

    const results = await calculateAdaptiveTdeeRange(
      userId,
      startDateStr,
      endDateStr
    );
    expect(results).toBeDefined();
    expect(results[startDateStr]).toBeDefined();
    expect(results[endDateStr]).toBeDefined();
    expect(results[endDateStr].tdee).toBeGreaterThan(0);
    expect(results[endDateStr].isFallback).toBe(false);
  });

  test('should respect the +/- 500 kcal safety cap', () => {
    // @ts-expect-error
    bmrService.calculateBmr.mockReturnValue(1800);
    bmrService.ActivityMultiplier = { moderate: 1.55 };

    // BMR fallback: 1800 * 1.55 = 2790 kcal.
    // Set daily intake high so raw TDEE = 4000 kcal
    const highIntakeData = {
      profile: { date_of_birth: '1990-01-01', gender: 'male' },
      preferences: {
        bmr_algorithm: 'Mifflin-St Jeor',
        activity_level: 'moderate',
      },
      latestMeasurement: { weight: 80, height: 180 },
      checkInMeasurements: [
        {
          entry_date: format(subDays(calculationDate, 70), 'yyyy-MM-dd'),
          weight: 80,
        },
        { entry_date: format(calculationDate, 'yyyy-MM-dd'), weight: 80 },
      ],
      nutritionData: Array.from({ length: 91 }, (_, i) => ({
        date: format(subDays(calculationDate, i), 'yyyy-MM-dd'),
        calories: 4000,
      })),
    };

    const resultHigh = computeAdaptiveTdeeFromData(
      highIntakeData,
      calculationDateStr
    );
    // fallbackTdee = 2790. maxTdee = 2790 + 500 = 3290.
    expect(resultHigh.tdee).toBe(3290);

    // Set daily intake low so raw TDEE = 1000 kcal
    const lowIntakeData = {
      ...highIntakeData,
      nutritionData: Array.from({ length: 91 }, (_, i) => ({
        date: format(subDays(calculationDate, i), 'yyyy-MM-dd'),
        calories: 1000,
      })),
    };

    const resultLow = computeAdaptiveTdeeFromData(
      lowIntakeData,
      calculationDateStr
    );
    // fallbackTdee = 2790. minTdee = 2790 - 500 = 2290.
    expect(resultLow.tdee).toBe(2290);
  });

  test('should downgrade confidence for recent trackers (< 6 weeks)', () => {
    // @ts-expect-error
    bmrService.calculateBmr.mockReturnValue(1800);
    bmrService.ActivityMultiplier = { moderate: 1.55 };

    // User has logged daily for 4 weeks (28 days).
    // This satisfies calorieDays >= 21, weightEntriesCount >= 8, daySpan >= 21.
    // So base confidence would be HIGH.
    // But tracking age is 4 weeks (< 6 weeks), so it should be downgraded to MEDIUM.
    const recentTrackerData = {
      profile: { date_of_birth: '1990-01-01', gender: 'male' },
      preferences: {
        bmr_algorithm: 'Mifflin-St Jeor',
        activity_level: 'moderate',
      },
      latestMeasurement: { weight: 80, height: 180 },
      checkInMeasurements: Array.from({ length: 28 }, (_, i) => ({
        entry_date: format(subDays(calculationDate, 28 - i), 'yyyy-MM-dd'),
        weight: 80,
      })),
      nutritionData: Array.from({ length: 91 }, (_, i) => ({
        date: format(subDays(calculationDate, i), 'yyyy-MM-dd'),
        calories: 2500,
      })),
    };

    const result = computeAdaptiveTdeeFromData(
      recentTrackerData,
      calculationDateStr
    );
    expect(result.confidence).toBe('MEDIUM');
  });

  test('should downgrade confidence for consecutive weight gaps (>= 3 days) in the calculation window', () => {
    // @ts-expect-error
    bmrService.calculateBmr.mockReturnValue(1800);
    bmrService.ActivityMultiplier = { moderate: 1.55 };

    // User has tracked for 10 weeks (70 days) - no tracking age downgrade.
    // But has a 4-day weight log gap in the last 28 days.
    // Basic criteria met: calorieDays = 24 >= 21, weightEntriesCount = 20 >= 8, daySpan = 70 >= 21.
    // Base confidence is HIGH.
    // Due to the gap, confidence should be downgraded to MEDIUM.
    const checkInMeasurements = [
      {
        entry_date: format(subDays(calculationDate, 70), 'yyyy-MM-dd'),
        weight: 80,
      },
    ];
    for (let i = 0; i < 28; i++) {
      // Create a 4-day gap in the last 28 days (days 10, 11, 12, 13 of the 28-day window are skipped)
      if (i >= 10 && i <= 13) continue;
      checkInMeasurements.push({
        entry_date: format(subDays(calculationDate, i), 'yyyy-MM-dd'),
        weight: 80,
      });
    }

    const gapTrackerData = {
      profile: { date_of_birth: '1990-01-01', gender: 'male' },
      preferences: {
        bmr_algorithm: 'Mifflin-St Jeor',
        activity_level: 'moderate',
      },
      latestMeasurement: { weight: 80, height: 180 },
      checkInMeasurements,
      nutritionData: Array.from({ length: 91 }, (_, i) => ({
        date: format(subDays(calculationDate, i), 'yyyy-MM-dd'),
        calories: 2500,
      })),
    };

    const result = computeAdaptiveTdeeFromData(
      gapTrackerData,
      calculationDateStr
    );
    expect(result.confidence).toBe('MEDIUM');
  });

  test('should return HIGH confidence for seasoned user with consistent tracking', () => {
    // @ts-expect-error
    bmrService.calculateBmr.mockReturnValue(1800);
    bmrService.ActivityMultiplier = { moderate: 1.55 };

    // User tracked for 10 weeks (70 days).
    // Daily weights logged (gap = 0).
    // Daily calories logged.
    const seasonedTrackerData = {
      profile: { date_of_birth: '1990-01-01', gender: 'male' },
      preferences: {
        bmr_algorithm: 'Mifflin-St Jeor',
        activity_level: 'moderate',
      },
      latestMeasurement: { weight: 80, height: 180 },
      checkInMeasurements: Array.from({ length: 70 }, (_, i) => ({
        entry_date: format(subDays(calculationDate, 70 - i), 'yyyy-MM-dd'),
        weight: 80,
      })),
      nutritionData: Array.from({ length: 91 }, (_, i) => ({
        date: format(subDays(calculationDate, i), 'yyyy-MM-dd'),
        calories: 2500,
      })),
    };

    const result = computeAdaptiveTdeeFromData(
      seasonedTrackerData,
      calculationDateStr
    );
    expect(result.confidence).toBe('HIGH');
  });
});
