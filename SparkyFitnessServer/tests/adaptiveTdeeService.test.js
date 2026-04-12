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
    userRepository.getUserProfile.mockResolvedValue({
      date_of_birth: '1990-01-01',
      gender: 'male',
    });
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
    measurementRepository.getCheckInMeasurementsByDateRange.mockResolvedValue(
      weightEntries
    );
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
    reportRepository.getNutritionData.mockResolvedValue(nutritionData);
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
    userRepository.getUserProfile.mockResolvedValue({});
    preferenceRepository.getUserPreferences.mockResolvedValue({});
    measurementRepository.getCheckInMeasurementsByDateRange.mockResolvedValue([
      { entry_date: calculationDateStr, weight: 80 },
    ]);
    measurementRepository.getLatestMeasurement.mockResolvedValue({
      weight: 80,
    });
    reportRepository.getNutritionData.mockResolvedValue([]);
    bmrService.calculateBmr.mockReturnValue(1800);
    const result = await calculateAdaptiveTdee(
      fallbackUserId,
      calculationDateStr
    );
    expect(result.isFallback).toBe(true);
    expect(result.fallbackReason).toContain('Insufficient weight entries');
  });
});
