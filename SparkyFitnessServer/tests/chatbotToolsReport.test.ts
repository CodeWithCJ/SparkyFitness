import { vi, beforeEach, describe, expect, it } from 'vitest';
import { addDays, todayInZone } from '@workspace/shared';
import { buildReportTools } from '../ai/tools/reportTools.js';
import preferenceService from '../services/preferenceService.js';
import measurementService from '../services/measurementService.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import measurementRepository from '../models/measurementRepository.js';
import reportRepository from '../models/reportRepository.js';

// Stubs for foodTools/checkinTools imports the report tools never call;
// loading the real services trips on deep '@workspace/shared' subpath imports.
vi.mock('../services/foodCoreService', () => ({ default: {} }));
vi.mock('../services/foodEntryService', () => ({ default: {} }));
vi.mock('../services/mealService', () => ({ default: {} }));
vi.mock('../services/externalFoodSearchService', () => ({
  searchProviderFoods: vi.fn(),
}));
vi.mock('../services/preferenceService', () => ({
  default: {
    getUserPreferences: vi.fn(),
  },
}));
vi.mock('../services/measurementService', () => ({
  default: {
    getCheckInMeasurementsByDateRange: vi.fn(),
  },
}));
vi.mock('../models/exerciseEntry', () => ({
  default: {
    getDailyExerciseTotalsRange: vi.fn(),
  },
}));
vi.mock('../models/measurementRepository', () => ({
  default: {
    getWaterTotalsByDateRange: vi.fn(),
  },
}));
vi.mock('../models/reportRepository', () => ({
  default: {
    getDailyNutritionTotalsRange: vi.fn(),
  },
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const opts = { toolCallId: 'tc-1', messages: [] };
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

const PREFS = {
  energy_unit: 'kcal',
  water_display_unit: 'ml',
  default_weight_unit: 'kg',
  default_measurement_unit: 'cm',
};

let tools: ReturnType<typeof buildReportTools>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(preferenceService.getUserPreferences).mockResolvedValue(PREFS);
  tools = buildReportTools('user-1', 'UTC');
});

describe('sparky_get_report (get_weekly_report)', () => {
  it('renders the three weekly sections from the trailing 7-day window', async () => {
    vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockResolvedValue([
      {
        entry_date: '2026-06-08',
        calories: '2100.5',
        protein: '95',
        carbs: '240',
        fat: '70',
      },
    ]);
    vi.mocked(
      measurementRepository.getWaterTotalsByDateRange
    ).mockResolvedValue([
      { entry_date: '2026-06-08', total_ml: '1500' },
      { entry_date: '2026-06-09', total_ml: '2000' },
    ]);
    vi.mocked(
      measurementService.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([
      {
        entry_date: '2026-06-09',
        weight: '81.5',
        body_fat_percentage: '22.5',
        steps: 9000,
      },
      {
        entry_date: '2026-06-08',
        weight: '82',
        body_fat_percentage: null,
        steps: null,
      },
    ]);

    const result = await tools.sparky_get_report.execute!(
      { action: 'get_weekly_report', end_date: '2026-06-10' },
      opts
    );

    expect(result).toBe(
      '# Weekly Performance Report (2026-06-04 to 2026-06-10)\n\n' +
        '## Nutrition & Energy\n' +
        '| Date | Calories (kcal) | P (g) | C (g) | F (g) |\n' +
        '| :--- | :--- | :--- | :--- | :--- |\n' +
        '| 2026-06-08 | 2100.5 | 95 | 240 | 70 |\n' +
        '\n' +
        '## Water Intake\n' +
        '| Date | Amount (ml) |\n' +
        '| :--- | :--- |\n' +
        '| 2026-06-08 | 1500 |\n' +
        '| 2026-06-09 | 2000 |\n' +
        '\n' +
        '## Biometrics Trend\n' +
        '| Date | Weight (kg) | BF % | Steps |\n' +
        '| :--- | :--- | :--- | :--- |\n' +
        '| 2026-06-08 | 82 | - | - |\n' +
        '| 2026-06-09 | 81.5 | 22.5 | 9000 |\n'
    );
    expect(reportRepository.getDailyNutritionTotalsRange).toHaveBeenCalledWith(
      'user-1',
      '2026-06-04',
      '2026-06-10'
    );
    expect(
      measurementRepository.getWaterTotalsByDateRange
    ).toHaveBeenCalledWith('user-1', '2026-06-04', '2026-06-10');
    expect(
      measurementService.getCheckInMeasurementsByDateRange
    ).toHaveBeenCalledWith('user-1', 'user-1', '2026-06-04', '2026-06-10');
  });

  it('defaults the window to today (UTC) and renders empty-section placeholders', async () => {
    vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockResolvedValue(
      []
    );
    vi.mocked(
      measurementRepository.getWaterTotalsByDateRange
    ).mockResolvedValue([]);
    vi.mocked(
      measurementService.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([]);

    const result = await tools.sparky_get_report.execute!(
      { action: 'get_weekly_report' },
      opts
    );

    const end = todayInZone('UTC');
    const start = addDays(end, -6);
    expect(result).toBe(
      `# Weekly Performance Report (${start} to ${end})\n\n` +
        '## Nutrition & Energy\n' +
        '_No nutrition data logged this week._\n' +
        '\n' +
        '## Water Intake\n' +
        '_No water intake logged this week._\n' +
        '\n' +
        '## Biometrics Trend\n' +
        '_No biometric data logged this week._\n'
    );
    expect(reportRepository.getDailyNutritionTotalsRange).toHaveBeenCalledWith(
      'user-1',
      start,
      end
    );
  });

  it('returns a validation error for a malformed end_date', async () => {
    const result = await tools.sparky_get_report.execute!(
      { action: 'get_weekly_report', end_date: 'June 10' },
      opts
    );

    expect(result).toBe(
      'Error [VALIDATION]: end_date: Date must be in YYYY-MM-DD format (or "today", "yesterday", "tomorrow")'
    );
  });

  it('maps repository failures to DB_ERROR', async () => {
    vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockRejectedValue(
      new Error('boom')
    );

    const result = await tools.sparky_get_report.execute!(
      { action: 'get_weekly_report' },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });
});

describe('sparky_get_daily_report', () => {
  it('returns nutrition, exercise, and water rows projected to MCP columns', async () => {
    vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockResolvedValue([
      {
        entry_date: '2026-06-10',
        calories: 2100.5,
        protein: 95,
        carbs: 240,
        fat: 70,
        fiber: 28,
        sugar: 40,
        sodium: 1500,
      },
    ]);
    vi.mocked(exerciseEntryDb.getDailyExerciseTotalsRange).mockResolvedValue([
      {
        entry_date: '2026-06-10',
        entry_count: 2,
        duration_minutes: 45,
        calories_burned: 400,
        distance: 5,
        steps: 8000,
      },
    ]);
    vi.mocked(
      measurementRepository.getWaterTotalsByDateRange
    ).mockResolvedValue([{ entry_date: '2026-06-10', total_ml: 1500 }]);

    const result = await tools.sparky_get_daily_report.execute!(
      { date: '2026-06-10' },
      opts
    );

    expect(result).toBe(
      JSON.stringify({
        start_date: '2026-06-10',
        end_date: '2026-06-10',
        nutrition: [
          {
            entry_date: '2026-06-10',
            calories: 2100.5,
            protein: 95,
            carbs: 240,
            fat: 70,
            fiber: 28,
          },
        ],
        exercise: [
          {
            entry_date: '2026-06-10',
            exercise_calories: 400,
            exercise_minutes: 45,
            steps: 8000,
          },
        ],
        water: [{ entry_date: '2026-06-10', water_ml: 1500 }],
      })
    );
    expect(exerciseEntryDb.getDailyExerciseTotalsRange).toHaveBeenCalledWith(
      'user-1',
      '2026-06-10',
      '2026-06-10'
    );
  });

  it('renders pg local-midnight Date rows as calendar-day strings in all three sets', async () => {
    vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockResolvedValue([
      {
        entry_date: new Date(2026, 5, 10),
        calories: 2100.5,
        protein: 95,
        carbs: 240,
        fat: 70,
        fiber: 28,
      },
    ]);
    vi.mocked(exerciseEntryDb.getDailyExerciseTotalsRange).mockResolvedValue([
      {
        entry_date: new Date(2026, 5, 10),
        entry_count: 2,
        duration_minutes: 45,
        calories_burned: 400,
        distance: 5,
        steps: 8000,
      },
    ]);
    vi.mocked(
      measurementRepository.getWaterTotalsByDateRange
    ).mockResolvedValue([
      { entry_date: new Date(2026, 5, 10), total_ml: 1500 },
    ]);

    const result = await tools.sparky_get_daily_report.execute!(
      { date: '2026-06-10' },
      opts
    );

    expect(result).toBe(
      JSON.stringify({
        start_date: '2026-06-10',
        end_date: '2026-06-10',
        nutrition: [
          {
            entry_date: '2026-06-10',
            calories: 2100.5,
            protein: 95,
            carbs: 240,
            fat: 70,
            fiber: 28,
          },
        ],
        exercise: [
          {
            entry_date: '2026-06-10',
            exercise_calories: 400,
            exercise_minutes: 45,
            steps: 8000,
          },
        ],
        water: [{ entry_date: '2026-06-10', water_ml: 1500 }],
      })
    );
  });

  it('lets date override start/end and defaults the range to today (UTC)', async () => {
    vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockResolvedValue(
      []
    );
    vi.mocked(exerciseEntryDb.getDailyExerciseTotalsRange).mockResolvedValue(
      []
    );
    vi.mocked(
      measurementRepository.getWaterTotalsByDateRange
    ).mockResolvedValue([]);

    await tools.sparky_get_daily_report.execute!(
      {
        date: '2026-06-01',
        start_date: '2026-05-01',
        end_date: '2026-05-31',
      },
      opts
    );
    expect(reportRepository.getDailyNutritionTotalsRange).toHaveBeenCalledWith(
      'user-1',
      '2026-06-01',
      '2026-06-01'
    );

    await tools.sparky_get_daily_report.execute!({}, opts);
    const today = todayInZone('UTC');
    expect(reportRepository.getDailyNutritionTotalsRange).toHaveBeenCalledWith(
      'user-1',
      today,
      today
    );
  });

  it("computes the default range in the user's timezone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T20:00:00Z'));
    try {
      vi.mocked(
        reportRepository.getDailyNutritionTotalsRange
      ).mockResolvedValue([]);
      vi.mocked(exerciseEntryDb.getDailyExerciseTotalsRange).mockResolvedValue(
        []
      );
      vi.mocked(
        measurementRepository.getWaterTotalsByDateRange
      ).mockResolvedValue([]);

      const tokyoTools = buildReportTools('user-1', 'Asia/Tokyo');
      await tokyoTools.sparky_get_daily_report.execute!({}, opts);
      expect(
        reportRepository.getDailyNutritionTotalsRange
      ).toHaveBeenLastCalledWith('user-1', '2026-06-11', '2026-06-11');

      const utcTools = buildReportTools('user-1', 'UTC');
      await utcTools.sparky_get_daily_report.execute!({}, opts);
      expect(
        reportRepository.getDailyNutritionTotalsRange
      ).toHaveBeenLastCalledWith('user-1', '2026-06-10', '2026-06-10');
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps a 'not found' failure to NOT_FOUND keyed by the requested date", async () => {
    vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockRejectedValue(
      new Error('Daily report not found')
    );

    const result = await tools.sparky_get_daily_report.execute!(
      { date: '2026-06-10' },
      opts
    );

    expect(result).toBe(
      "Error [NOT_FOUND]: Daily report with ID '2026-06-10' not found.\n\nSuggestion: Check the ID and try again."
    );
  });

  it('maps other failures to DB_ERROR', async () => {
    vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockRejectedValue(
      new Error('boom')
    );

    const result = await tools.sparky_get_daily_report.execute!({}, opts);

    expect(result).toBe(DB_ERROR_TEXT);
  });
});
