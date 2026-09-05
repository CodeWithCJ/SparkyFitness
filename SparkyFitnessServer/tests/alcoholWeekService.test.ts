import { vi, beforeEach, describe, expect, it } from 'vitest';
import alcoholWeekService from '../services/alcoholWeekService.js';
import preferenceRepository from '../models/preferenceRepository.js';
import reportRepository from '../models/reportRepository.js';

vi.mock('../models/preferenceRepository.js', () => ({
  default: {
    getUserPreferences: vi.fn(),
  },
}));

vi.mock('../models/reportRepository.js', () => ({
  default: {
    getDailyNutritionTotalsRange: vi.fn(),
  },
}));

const prefRepo = preferenceRepository as any;
const reportRepo = reportRepository as any;

describe('alcoholWeekService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes week boundaries for Sunday start (first_day_of_week = 0)', async () => {
    prefRepo.getUserPreferences.mockResolvedValue({
      first_day_of_week: 0,
      standard_drink_grams: 14,
      weekly_alcohol_limit_g: null,
    });
    reportRepo.getDailyNutritionTotalsRange.mockResolvedValue([]);

    // 2026-09-05 is Saturday
    const result = await alcoholWeekService.getAlcoholWeek(
      'user-1',
      '2026-09-05'
    );

    expect(reportRepo.getDailyNutritionTotalsRange).toHaveBeenCalledTimes(1);
    expect(reportRepo.getDailyNutritionTotalsRange).toHaveBeenCalledWith(
      'user-1',
      '2026-08-30',
      '2026-09-05'
    );
    expect(result.week_start).toBe('2026-08-30');
    expect(result.week_end).toBe('2026-09-05');
    expect(result.days).toHaveLength(7);
  });

  it('computes week boundaries for Monday start (first_day_of_week = 1)', async () => {
    prefRepo.getUserPreferences.mockResolvedValue({
      first_day_of_week: 1,
      standard_drink_grams: 14,
      weekly_alcohol_limit_g: 98,
    });
    reportRepo.getDailyNutritionTotalsRange.mockResolvedValue([
      { entry_date: '2026-08-31', alcohol_g: 28 },
      { entry_date: '2026-09-04', alcohol_g: 54.4 },
    ]);

    // 2026-09-05 is Saturday
    const result = await alcoholWeekService.getAlcoholWeek(
      'user-1',
      '2026-09-05'
    );

    expect(reportRepo.getDailyNutritionTotalsRange).toHaveBeenCalledTimes(1);
    expect(reportRepo.getDailyNutritionTotalsRange).toHaveBeenCalledWith(
      'user-1',
      '2026-08-31',
      '2026-09-06'
    );
    expect(result.week_start).toBe('2026-08-31');
    expect(result.week_end).toBe('2026-09-06');
    expect(result.total_g).toBe(82.4);
    expect(result.standard_drinks).toBe(5.89);
    expect(result.limit_g).toBe(98);
    expect(result.limit_standard_drinks).toBe(7);
    expect(result.over_limit).toBe(false);
    expect(result.days).toHaveLength(7);

    // Verify padding: 2026-09-01 should be 0
    const sep1 = result.days.find((d) => d.date === '2026-09-01');
    expect(sep1).toEqual({
      date: '2026-09-01',
      alcohol_g: 0,
      standard_drinks: 0,
    });

    // Verify day with data: 2026-08-31
    const aug31 = result.days.find((d) => d.date === '2026-08-31');
    expect(aug31).toEqual({
      date: '2026-08-31',
      alcohol_g: 28,
      standard_drinks: 2,
    });
  });

  it('over_limit is false when limit_g is NULL (never scold an unset goal)', async () => {
    prefRepo.getUserPreferences.mockResolvedValue({
      first_day_of_week: 1,
      standard_drink_grams: 14,
      weekly_alcohol_limit_g: null,
    });
    reportRepo.getDailyNutritionTotalsRange.mockResolvedValue([
      { entry_date: '2026-09-01', alcohol_g: 500 },
    ]);

    const result = await alcoholWeekService.getAlcoholWeek(
      'user-1',
      '2026-09-01'
    );

    expect(result.limit_g).toBeNull();
    expect(result.limit_standard_drinks).toBeNull();
    expect(result.over_limit).toBe(false);
  });

  it('correctly flags over_limit when total exceeds weekly_alcohol_limit_g', async () => {
    prefRepo.getUserPreferences.mockResolvedValue({
      first_day_of_week: 1,
      standard_drink_grams: 14,
      weekly_alcohol_limit_g: 28,
    });
    reportRepo.getDailyNutritionTotalsRange.mockResolvedValue([
      { entry_date: '2026-09-01', alcohol_g: 35 },
    ]);

    const result = await alcoholWeekService.getAlcoholWeek(
      'user-1',
      '2026-09-01'
    );

    expect(result.total_g).toBe(35);
    expect(result.limit_g).toBe(28);
    expect(result.over_limit).toBe(true);
  });

  it('calculates standard drinks according to standard_drink_grams (14 vs 8 grams)', async () => {
    reportRepo.getDailyNutritionTotalsRange.mockResolvedValue([
      { entry_date: '2026-09-01', alcohol_g: 56 },
    ]);

    // US standard drink (14g)
    prefRepo.getUserPreferences.mockResolvedValue({
      first_day_of_week: 1,
      standard_drink_grams: 14,
      weekly_alcohol_limit_g: 112,
    });
    const resultUS = await alcoholWeekService.getAlcoholWeek(
      'user-1',
      '2026-09-01'
    );
    expect(resultUS.standard_drinks).toBe(4);
    expect(resultUS.limit_standard_drinks).toBe(8);

    // UK unit (8g)
    prefRepo.getUserPreferences.mockResolvedValue({
      first_day_of_week: 1,
      standard_drink_grams: 8,
      weekly_alcohol_limit_g: 112,
    });
    const resultUK = await alcoholWeekService.getAlcoholWeek(
      'user-1',
      '2026-09-01'
    );
    expect(resultUK.standard_drinks).toBe(7);
    expect(resultUK.limit_standard_drinks).toBe(14);
  });
});
