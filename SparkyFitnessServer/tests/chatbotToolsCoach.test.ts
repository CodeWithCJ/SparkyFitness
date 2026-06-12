import { vi, beforeEach, describe, expect, it } from 'vitest';
import { todayInZone } from '@workspace/shared';
import { buildCoachTools } from '../ai/tools/coachTools.js';
import coachRepository from '../models/coachRepository.js';

vi.mock('../models/coachRepository', () => ({
  default: {
    getNutritionAggregates: vi.fn(),
    getExerciseAggregates: vi.fn(),
    getLatestWeightInRange: vi.fn(),
    getWaterIntakeTotal: vi.fn(),
    getWeightSeries: vi.fn(),
    getDailyCalorieSeries: vi.fn(),
    get30DayFoodAggregates: vi.fn(),
    get30DayExerciseAggregates: vi.fn(),
    get30DayMoodAggregates: vi.fn(),
    get30DaySleepAggregates: vi.fn(),
    get30DayWeightSeries: vi.fn(),
    getDailyCorrelationRows: vi.fn(),
    getFrequentHighProteinFoods: vi.fn(),
  },
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const opts = { toolCallId: 'tc-1', messages: [] };
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred. Please try again.\n\nSuggestion: If the issue persists, contact support.';

let tools: ReturnType<typeof buildCoachTools>;

beforeEach(() => {
  vi.clearAllMocks();
  tools = buildCoachTools('user-1', 'UTC');
});

describe('sparky_get_health_summary', () => {
  it('renders nutrition, fitness, vitals, and hydration as JSON', async () => {
    vi.mocked(coachRepository.getNutritionAggregates).mockResolvedValue({
      total_calories: '12450.5',
      avg_protein: '98.7654',
      avg_carbs: '210.1234',
      avg_fat: '65.4321',
      entry_count: 21,
    });
    vi.mocked(coachRepository.getExerciseAggregates).mockResolvedValue({
      total_calories_burned: '3200',
      workout_count: 5,
    });
    vi.mocked(coachRepository.getLatestWeightInRange).mockResolvedValue({
      weight: '81.5',
      entry_date: '2026-06-07',
    });
    vi.mocked(coachRepository.getWaterIntakeTotal).mockResolvedValue({
      total_water: '14000',
    });

    const result = await tools.sparky_get_health_summary.execute!(
      { start_date: '2026-06-01', end_date: '2026-06-07' },
      opts
    );

    expect(result).toBe(
      '# Health Summary\n\n' +
        JSON.stringify(
          {
            period: { start_date: '2026-06-01', end_date: '2026-06-07' },
            nutrition: {
              total_calories: 12450.5,
              avg_protein: 98.8,
              avg_carbs: 210.1,
              avg_fat: 65.4,
              entry_count: 21,
            },
            fitness: {
              total_calories_burned: 3200,
              workout_count: 5,
            },
            vitals: {
              latest_weight: { weight: 81.5, date: '2026-06-07' },
            },
            hydration: {
              total_water_ml: 14000,
            },
          },
          null,
          2
        )
    );
    expect(coachRepository.getNutritionAggregates).toHaveBeenCalledWith(
      'user-1',
      '2026-06-01',
      '2026-06-07'
    );
    expect(coachRepository.getWaterIntakeTotal).toHaveBeenCalledWith(
      'user-1',
      '2026-06-01',
      '2026-06-07'
    );
  });

  it('renders a pg local-midnight Date weight date as a calendar-day string', async () => {
    vi.mocked(coachRepository.getNutritionAggregates).mockResolvedValue({
      total_calories: '0',
      avg_protein: '0',
      avg_carbs: '0',
      avg_fat: '0',
      entry_count: 0,
    });
    vi.mocked(coachRepository.getExerciseAggregates).mockResolvedValue({
      total_calories_burned: '0',
      workout_count: 0,
    });
    vi.mocked(coachRepository.getLatestWeightInRange).mockResolvedValue({
      weight: '81.5',
      entry_date: new Date(2026, 5, 10),
    });
    vi.mocked(coachRepository.getWaterIntakeTotal).mockResolvedValue({
      total_water: '0',
    });

    const result = await tools.sparky_get_health_summary.execute!(
      { start_date: '2026-06-10' },
      opts
    );

    expect(result).toBe(
      '# Health Summary\n\n' +
        JSON.stringify(
          {
            period: { start_date: '2026-06-10', end_date: '2026-06-10' },
            nutrition: {
              total_calories: 0,
              avg_protein: 0,
              avg_carbs: 0,
              avg_fat: 0,
              entry_count: 0,
            },
            fitness: {
              total_calories_burned: 0,
              workout_count: 0,
            },
            vitals: {
              latest_weight: { weight: 81.5, date: '2026-06-10' },
            },
            hydration: {
              total_water_ml: 0,
            },
          },
          null,
          2
        )
    );
  });

  it('defaults end_date to start_date and renders a null latest weight', async () => {
    vi.mocked(coachRepository.getNutritionAggregates).mockResolvedValue({
      total_calories: '0',
      avg_protein: '0',
      avg_carbs: '0',
      avg_fat: '0',
      entry_count: 0,
    });
    vi.mocked(coachRepository.getExerciseAggregates).mockResolvedValue({
      total_calories_burned: '0',
      workout_count: 0,
    });
    vi.mocked(coachRepository.getLatestWeightInRange).mockResolvedValue(null);
    vi.mocked(coachRepository.getWaterIntakeTotal).mockResolvedValue({
      total_water: '0',
    });

    const result = await tools.sparky_get_health_summary.execute!(
      { start_date: '2026-06-10' },
      opts
    );

    expect(result).toBe(
      '# Health Summary\n\n' +
        JSON.stringify(
          {
            period: { start_date: '2026-06-10', end_date: '2026-06-10' },
            nutrition: {
              total_calories: 0,
              avg_protein: 0,
              avg_carbs: 0,
              avg_fat: 0,
              entry_count: 0,
            },
            fitness: {
              total_calories_burned: 0,
              workout_count: 0,
            },
            vitals: {
              latest_weight: null,
            },
            hydration: {
              total_water_ml: 0,
            },
          },
          null,
          2
        )
    );
    expect(coachRepository.getLatestWeightInRange).toHaveBeenCalledWith(
      'user-1',
      '2026-06-10',
      '2026-06-10'
    );
  });

  it('returns a validation error when start_date is missing', async () => {
    const result = await tools.sparky_get_health_summary.execute!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      opts
    );

    expect(result).toBe(
      'Error [VALIDATION]: start_date: Invalid input: expected string, received undefined'
    );
  });

  it('maps repository failures to DB_ERROR', async () => {
    vi.mocked(coachRepository.getNutritionAggregates).mockRejectedValue(
      new Error('boom')
    );

    const result = await tools.sparky_get_health_summary.execute!(
      { start_date: '2026-06-01' },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });
});

describe('sparky_analyze_trends', () => {
  it('classifies a small weight change as stable and averages calories', async () => {
    vi.mocked(coachRepository.getWeightSeries).mockResolvedValue([
      { entry_date: '2026-06-01', weight: '80.0' },
      { entry_date: '2026-06-07', weight: '80.3' },
    ]);
    vi.mocked(coachRepository.getDailyCalorieSeries).mockResolvedValue([
      { entry_date: '2026-06-01', daily_calories: '2000' },
      { entry_date: '2026-06-02', daily_calories: '2100' },
    ]);

    const result = await tools.sparky_analyze_trends.execute!(
      { days: 14 },
      opts
    );

    expect(result).toBe(
      '# Trend Analysis\n\n' +
        JSON.stringify(
          {
            period_days: 14,
            weight: {
              trend: 'stable',
              data_points: 2,
              entries: [
                { date: '2026-06-01', weight: 80 },
                { date: '2026-06-07', weight: 80.3 },
              ],
            },
            calories: {
              average_daily: 2050,
              data_points: 2,
              entries: [
                { date: '2026-06-01', calories: 2000 },
                { date: '2026-06-02', calories: 2100 },
              ],
            },
          },
          null,
          2
        )
    );
    expect(coachRepository.getWeightSeries).toHaveBeenCalledWith(
      'user-1',
      14,
      todayInZone('UTC')
    );
    expect(coachRepository.getDailyCalorieSeries).toHaveBeenCalledWith(
      'user-1',
      14,
      todayInZone('UTC')
    );
  });

  it('classifies a falling series as decreasing', async () => {
    vi.mocked(coachRepository.getWeightSeries).mockResolvedValue([
      { entry_date: '2026-06-01', weight: '82' },
      { entry_date: '2026-06-07', weight: '80.5' },
    ]);
    vi.mocked(coachRepository.getDailyCalorieSeries).mockResolvedValue([]);

    const result = await tools.sparky_analyze_trends.execute!(
      { days: 7 },
      opts
    );

    expect(result).toContain('"trend": "decreasing"');
  });

  it('defaults days to 7 and reports insufficient data with no entries', async () => {
    vi.mocked(coachRepository.getWeightSeries).mockResolvedValue([]);
    vi.mocked(coachRepository.getDailyCalorieSeries).mockResolvedValue([]);

    const result = await tools.sparky_analyze_trends.execute!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      opts
    );

    expect(result).toBe(
      '# Trend Analysis\n\n' +
        JSON.stringify(
          {
            period_days: 7,
            weight: {
              trend: 'insufficient_data',
              data_points: 0,
              entries: [],
            },
            calories: {
              average_daily: 0,
              data_points: 0,
              entries: [],
            },
          },
          null,
          2
        )
    );
    expect(coachRepository.getWeightSeries).toHaveBeenCalledWith(
      'user-1',
      7,
      todayInZone('UTC')
    );
  });

  it('maps repository failures to DB_ERROR', async () => {
    vi.mocked(coachRepository.getWeightSeries).mockRejectedValue(
      new Error('boom')
    );

    const result = await tools.sparky_analyze_trends.execute!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });
});

describe('sparky_get_30_day_trends', () => {
  it('renders all five trend sections with unit conversions', async () => {
    vi.mocked(coachRepository.get30DayFoodAggregates).mockResolvedValue({
      days_logged: 12,
      avg_daily_calories: '2150.6',
      avg_daily_protein: '95.25',
    });
    vi.mocked(coachRepository.get30DayExerciseAggregates).mockResolvedValue({
      total_workouts: 8,
      active_days: 6,
      total_calories_burned: '2400',
    });
    vi.mocked(coachRepository.get30DayMoodAggregates).mockResolvedValue({
      entries: 10,
      avg_mood: '7.44',
    });
    vi.mocked(coachRepository.get30DaySleepAggregates).mockResolvedValue({
      entries: 9,
      avg_duration_seconds: '27000',
      avg_sleep_score: '82.6',
    });
    vi.mocked(coachRepository.get30DayWeightSeries).mockResolvedValue([
      { entry_date: '2026-05-20', weight: '82' },
      { entry_date: '2026-06-05', weight: '81.2' },
    ]);

    const result = await tools.sparky_get_30_day_trends.execute!(
      { end_date: '2026-06-10' },
      opts
    );

    expect(result).toBe(
      '# 30-Day Trends\n\n' +
        JSON.stringify(
          {
            period: { end_date: '2026-06-10', days: 30 },
            food: {
              days_logged: 12,
              avg_daily_calories: 2151,
              avg_daily_protein: 95.3,
            },
            exercise: {
              total_workouts: 8,
              active_days: 6,
              total_calories_burned: 2400,
            },
            mood: {
              entries: 10,
              avg_mood: 7.4,
            },
            sleep: {
              entries: 9,
              avg_duration_hours: 7.5,
              avg_sleep_score: 83,
            },
            biometrics: {
              weight_entries: 2,
              weights: [
                { date: '2026-05-20', weight: 82 },
                { date: '2026-06-05', weight: 81.2 },
              ],
            },
          },
          null,
          2
        )
    );
    expect(coachRepository.get30DayFoodAggregates).toHaveBeenCalledWith(
      'user-1',
      '2026-06-10'
    );
  });

  it('defaults end_date to today (UTC)', async () => {
    vi.mocked(coachRepository.get30DayFoodAggregates).mockResolvedValue({
      days_logged: 0,
      avg_daily_calories: '0',
      avg_daily_protein: '0',
    });
    vi.mocked(coachRepository.get30DayExerciseAggregates).mockResolvedValue({
      total_workouts: 0,
      active_days: 0,
      total_calories_burned: '0',
    });
    vi.mocked(coachRepository.get30DayMoodAggregates).mockResolvedValue({
      entries: 0,
      avg_mood: '0',
    });
    vi.mocked(coachRepository.get30DaySleepAggregates).mockResolvedValue({
      entries: 0,
      avg_duration_seconds: '0',
      avg_sleep_score: '0',
    });
    vi.mocked(coachRepository.get30DayWeightSeries).mockResolvedValue([]);

    await tools.sparky_get_30_day_trends.execute!({}, opts);

    expect(coachRepository.get30DayFoodAggregates).toHaveBeenCalledWith(
      'user-1',
      todayInZone('UTC')
    );
  });

  it('maps repository failures to DB_ERROR', async () => {
    vi.mocked(coachRepository.get30DayFoodAggregates).mockRejectedValue(
      new Error('boom')
    );

    const result = await tools.sparky_get_30_day_trends.execute!({}, opts);

    expect(result).toBe(DB_ERROR_TEXT);
  });
});

// Full correlation row as returned by coachRepository.getDailyCorrelationRows.
function makeCorrelationRow(
  date: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    entry_date: date,
    calories: '2000',
    protein: '90',
    carbs: '250',
    fat: '70',
    sugars: '40',
    sodium: '1000',
    fiber: '30',
    sat_fat: '20',
    cholesterol: '300',
    potassium: '3500',
    vit_a: '700',
    vit_c: '60',
    calcium: '1000',
    iron: '8',
    duration_in_seconds: 28800,
    sleep_score: 80,
    mood_value: 6,
    ...overrides,
  };
}

// The nutrition projection detectPatterns emits for a default makeCorrelationRow.
function expectedCorrelation(
  date: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    date,
    nutrition: {
      calories: 2000,
      protein: 90,
      carbs: 250,
      fat: 70,
      sugars: 40,
      sodium: 1000,
      fiber: 30,
      saturated_fat: 20,
      cholesterol: 300,
      potassium: 3500,
      vitamin_a: 700,
      vitamin_c: 60,
      calcium: 1000,
      iron: 8,
      ...(overrides.nutrition as Record<string, unknown>),
    },
    sleep_score: 'sleep_score' in overrides ? overrides.sleep_score : 80,
    mood_value: 'mood_value' in overrides ? overrides.mood_value : 6,
  };
}

describe('sparky_detect_patterns', () => {
  it('defaults days to 30 and reports no patterns for sparse data', async () => {
    vi.mocked(coachRepository.getDailyCorrelationRows).mockResolvedValue([
      makeCorrelationRow('2026-06-10'),
      makeCorrelationRow('2026-06-09', { sleep_score: null, mood_value: null }),
    ]);

    const result = await tools.sparky_detect_patterns.execute!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      opts
    );

    expect(result).toBe(
      '# Pattern Detection\n\n' +
        JSON.stringify(
          {
            period_days: 30,
            data_points: 2,
            detected_patterns: [
              'No strong patterns detected in the current data range.',
            ],
            raw_correlations: [
              expectedCorrelation('2026-06-10'),
              expectedCorrelation('2026-06-09', {
                sleep_score: null,
                mood_value: null,
              }),
            ],
          },
          null,
          2
        )
    );
    expect(coachRepository.getDailyCorrelationRows).toHaveBeenCalledWith(
      'user-1',
      30,
      todayInZone('UTC')
    );
  });

  it('detects sugar/sleep, calorie/mood, and sodium patterns and caps raw rows at 7', async () => {
    const highDays = ['2026-06-10', '2026-06-09', '2026-06-08'].map((d) =>
      makeCorrelationRow(d, {
        sugars: '60',
        sodium: '2400',
        calories: '2600',
        sleep_score: 60,
        mood_value: 8,
      })
    );
    const normalDays = [
      '2026-06-07',
      '2026-06-06',
      '2026-06-05',
      '2026-06-04',
      '2026-06-03',
    ].map((d) => makeCorrelationRow(d));
    vi.mocked(coachRepository.getDailyCorrelationRows).mockResolvedValue([
      ...highDays,
      ...normalDays,
    ]);

    const result = (await tools.sparky_detect_patterns.execute!(
      { days: 14 },
      opts
    )) as string;

    const parsed = JSON.parse(result.replace('# Pattern Detection\n\n', ''));
    expect(parsed.period_days).toBe(14);
    expect(parsed.data_points).toBe(8);
    expect(parsed.detected_patterns).toEqual([
      'High sugar intake (>50g) correlates with a lower sleep score.',
      'High calorie days (>2500) are associated with higher reported mood.',
      'Frequent high sodium intake (>2300mg) detected; this may impact morning weight fluctuations.',
    ]);
    expect(parsed.raw_correlations).toHaveLength(7);
    expect(parsed.raw_correlations[0]).toEqual(
      expectedCorrelation('2026-06-10', {
        nutrition: { sugars: 60, sodium: 2400, calories: 2600 },
        sleep_score: 60,
        mood_value: 8,
      })
    );
  });

  it('maps repository failures to DB_ERROR', async () => {
    vi.mocked(coachRepository.getDailyCorrelationRows).mockRejectedValue(
      new Error('boom')
    );

    const result = await tools.sparky_detect_patterns.execute!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });
});

describe('sparky_generate_coaching_plan', () => {
  it('estimates TDEE from 14-day trends and applies the weight_loss deficit', async () => {
    vi.mocked(coachRepository.getWeightSeries).mockResolvedValue([
      { entry_date: '2026-05-28', weight: '80' },
      { entry_date: '2026-06-10', weight: '81' },
    ]);
    vi.mocked(coachRepository.getDailyCalorieSeries).mockResolvedValue(
      [
        '2026-06-04',
        '2026-06-05',
        '2026-06-06',
        '2026-06-07',
        '2026-06-08',
        '2026-06-09',
        '2026-06-10',
      ].map((d) => ({ entry_date: d, daily_calories: '2400' }))
    );
    vi.mocked(coachRepository.getFrequentHighProteinFoods).mockResolvedValue([
      { food_name: 'Chicken Breast', frequency: '12' },
      { food_name: 'Greek Yogurt', frequency: '8' },
    ]);

    const result = await tools.sparky_generate_coaching_plan.execute!(
      { goal: 'weight_loss', target_weight: 75 },
      opts
    );

    // avg 2400 kcal; +1kg over 14 days -> daily balance 550 -> TDEE 1850;
    // weight_loss deficit -> 1350 target.
    expect(result).toBe(
      '# Coaching Plan\n\n' +
        JSON.stringify(
          {
            goal: 'weight_loss',
            current_estimated_tdee: 1850,
            recommended_targets: {
              daily_calories: 1350,
              protein_grams: 101,
              carbs_grams: 135,
              fat_grams: 45,
            },
            shopping_list_suggestions: ['Chicken Breast', 'Greek Yogurt'],
            coaching_insight:
              'Your weight is currently trending up. To hit your weight loss goal, we need to bring daily calories down to 1350.',
          },
          null,
          2
        )
    );
    expect(coachRepository.getWeightSeries).toHaveBeenCalledWith(
      'user-1',
      14,
      todayInZone('UTC')
    );
    expect(coachRepository.getDailyCalorieSeries).toHaveBeenCalledWith(
      'user-1',
      14,
      todayInZone('UTC')
    );
  });

  it('falls back to a 2200 TDEE and the default maintenance goal', async () => {
    vi.mocked(coachRepository.getWeightSeries).mockResolvedValue([]);
    vi.mocked(coachRepository.getDailyCalorieSeries).mockResolvedValue([]);
    vi.mocked(coachRepository.getFrequentHighProteinFoods).mockResolvedValue(
      []
    );

    const result = await tools.sparky_generate_coaching_plan.execute!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      opts
    );

    expect(result).toBe(
      '# Coaching Plan\n\n' +
        JSON.stringify(
          {
            goal: 'maintenance',
            current_estimated_tdee: 2200,
            recommended_targets: {
              daily_calories: 2200,
              protein_grams: 165,
              carbs_grams: 220,
              fat_grams: 73,
            },
            shopping_list_suggestions: [],
            coaching_insight:
              'You are on the right track for your maintenance goal.',
          },
          null,
          2
        )
    );
  });

  it('maps repository failures to DB_ERROR', async () => {
    vi.mocked(coachRepository.getWeightSeries).mockRejectedValue(
      new Error('boom')
    );

    const result = await tools.sparky_generate_coaching_plan.execute!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });
});
