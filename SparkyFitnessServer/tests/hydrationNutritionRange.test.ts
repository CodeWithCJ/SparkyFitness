import { vi, beforeEach, describe, expect, it } from 'vitest';
import hydrationNutritionRangeService from '../services/hydrationNutritionRangeService.js';
import measurementRepository from '../models/measurementRepository.js';
import reportRepository from '../models/reportRepository.js';

vi.mock('../models/measurementRepository.js', () => ({
  default: {
    getWaterTotalsByDateRange: vi.fn(),
  },
}));

vi.mock('../models/reportRepository.js', () => ({
  default: {
    getDailyNutritionTotalsRange: vi.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const measurementRepo = measurementRepository as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reportRepo = reportRepository as any;

describe('hydrationNutritionRangeService.getHydrationNutritionRange (#2348)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('zero-pads days with no data', async () => {
    measurementRepo.getWaterTotalsByDateRange.mockResolvedValue([]);
    reportRepo.getDailyNutritionTotalsRange.mockResolvedValue([]);

    const result =
      await hydrationNutritionRangeService.getHydrationNutritionRange(
        'user-1',
        '2026-09-01',
        '2026-09-03'
      );

    expect(result.days).toEqual([
      { date: '2026-09-01', water_ml: 0, caffeine_mg: 0, alcohol_g: 0 },
      { date: '2026-09-02', water_ml: 0, caffeine_mg: 0, alcohol_g: 0 },
      { date: '2026-09-03', water_ml: 0, caffeine_mg: 0, alcohol_g: 0 },
    ]);
  });

  it('merges water totals (already honouring the Phase 4 preference) with caffeine/alcohol from RANGE_COLS', async () => {
    measurementRepo.getWaterTotalsByDateRange.mockResolvedValue([
      { entry_date: '2026-09-01', total_ml: '750' },
      { entry_date: '2026-09-02', total_ml: '500' },
    ]);
    reportRepo.getDailyNutritionTotalsRange.mockResolvedValue([
      { entry_date: '2026-09-01', caffeine_mg: '95', alcohol_g: '0' },
      { entry_date: '2026-09-03', caffeine_mg: '0', alcohol_g: '14' },
    ]);

    const result =
      await hydrationNutritionRangeService.getHydrationNutritionRange(
        'user-1',
        '2026-09-01',
        '2026-09-03'
      );

    expect(result.days).toEqual([
      { date: '2026-09-01', water_ml: 750, caffeine_mg: 95, alcohol_g: 0 },
      { date: '2026-09-02', water_ml: 500, caffeine_mg: 0, alcohol_g: 0 },
      { date: '2026-09-03', water_ml: 0, caffeine_mg: 0, alcohol_g: 14 },
    ]);
    expect(measurementRepo.getWaterTotalsByDateRange).toHaveBeenCalledWith(
      'user-1',
      '2026-09-01',
      '2026-09-03'
    );
    expect(reportRepo.getDailyNutritionTotalsRange).toHaveBeenCalledWith(
      'user-1',
      '2026-09-01',
      '2026-09-03'
    );
  });

  it('handles a Date object for entry_date the same as a plain string', async () => {
    measurementRepo.getWaterTotalsByDateRange.mockResolvedValue([
      { entry_date: new Date(Date.UTC(2026, 8, 1)), total_ml: 250 },
    ]);
    reportRepo.getDailyNutritionTotalsRange.mockResolvedValue([
      {
        entry_date: new Date(Date.UTC(2026, 8, 1)),
        caffeine_mg: 63,
        alcohol_g: 0,
      },
    ]);

    const result =
      await hydrationNutritionRangeService.getHydrationNutritionRange(
        'user-1',
        '2026-09-01',
        '2026-09-01'
      );

    expect(result.days).toEqual([
      { date: '2026-09-01', water_ml: 250, caffeine_mg: 63, alcohol_g: 0 },
    ]);
  });

  it('a single day in range still returns exactly one row, matching a single-day getDailyNutritionTotalsRange call', async () => {
    measurementRepo.getWaterTotalsByDateRange.mockResolvedValue([
      { entry_date: '2026-09-05', total_ml: '1200' },
    ]);
    reportRepo.getDailyNutritionTotalsRange.mockResolvedValue([
      { entry_date: '2026-09-05', caffeine_mg: '180', alcohol_g: '28' },
    ]);

    const result =
      await hydrationNutritionRangeService.getHydrationNutritionRange(
        'user-1',
        '2026-09-05',
        '2026-09-05'
      );

    expect(result.days).toHaveLength(1);
    expect(result.days[0]).toEqual({
      date: '2026-09-05',
      water_ml: 1200,
      caffeine_mg: 180,
      alcohol_g: 28,
    });
  });
});
