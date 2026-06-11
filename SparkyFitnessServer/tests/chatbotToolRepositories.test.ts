import { vi, beforeEach, describe, expect, it } from 'vitest';
import { getClient } from '../db/poolManager.js';
import coachRepository from '../models/coachRepository.js';
import engagementRepository from '../models/engagementRepository.js';
import habitRepository from '../models/habitRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import reportRepository from '../models/reportRepository.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import foodEntryRepository from '../models/foodEntry.js';
import goalRepository from '../models/goalRepository.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockClient: any;

beforeEach(() => {
  mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue(mockClient);
});

describe('coachRepository', () => {
  it('getNutritionAggregates scopes by user and date range and returns the aggregate row', async () => {
    const row = {
      total_calories: '2100',
      avg_protein: '80.1',
      avg_carbs: '210.5',
      avg_fat: '70.2',
      entry_count: 12,
    };
    mockClient.query.mockResolvedValue({ rows: [row] });

    const result = await coachRepository.getNutritionAggregates(
      'user-1',
      '2026-06-01',
      '2026-06-07'
    );

    expect(result).toBe(row);
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('FROM food_entries');
    expect(sql).toContain('NULLIF(serving_size, 0)');
    expect(params).toEqual(['user-1', '2026-06-01', '2026-06-07']);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('getLatestWeightInRange returns null when no weight is logged', async () => {
    const result = await coachRepository.getLatestWeightInRange(
      'user-1',
      '2026-06-01',
      '2026-06-07'
    );
    expect(result).toBeNull();
  });

  it('getDailyCalorieSeries uses a CURRENT_DATE window of N days', async () => {
    await coachRepository.getDailyCalorieSeries('user-1', 14);
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('CURRENT_DATE - $2::int');
    expect(params).toEqual(['user-1', 14]);
  });

  it('getDailyCorrelationRows joins food, sleep and mood by day', async () => {
    await coachRepository.getDailyCorrelationRows('user-1', 30);
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('daily_food');
    expect(sql).toContain('daily_sleep');
    expect(sql).toContain('daily_mood');
    expect(params).toEqual(['user-1', 30]);
  });

  it('releases the client when a query throws', async () => {
    mockClient.query.mockRejectedValue(new Error('boom'));
    await expect(
      coachRepository.getNutritionAggregates(
        'user-1',
        '2026-06-01',
        '2026-06-07'
      )
    ).rejects.toThrow('boom');
    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe('engagementRepository', () => {
  it('getLastExerciseDate returns the most recent entry_date or null', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ entry_date: '2026-06-09' }],
    });
    expect(await engagementRepository.getLastExerciseDate('user-1')).toBe(
      '2026-06-09'
    );

    mockClient.query.mockResolvedValueOnce({ rows: [] });
    expect(await engagementRepository.getLastExerciseDate('user-1')).toBeNull();
  });

  it('getRecentWeights defaults to a limit of 7', async () => {
    await engagementRepository.getRecentWeights('user-1');
    const [, params] = mockClient.query.mock.calls[0];
    expect(params).toEqual(['user-1', 7]);
  });

  it('getWeeklyLoggedDayCount returns 0 when there are no rows', async () => {
    expect(await engagementRepository.getWeeklyLoggedDayCount('user-1')).toBe(
      0
    );
  });

  it('getTodayActivityCounts maps the three count queries and defaults to 0', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ count: 3 }] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await engagementRepository.getTodayActivityCounts('user-1');

    expect(result).toEqual({
      food_count: 3,
      exercise_count: 1,
      checkin_count: 0,
    });
    expect(mockClient.query).toHaveBeenCalledTimes(3);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});

describe('habitRepository', () => {
  it('listHabits selects boolean custom categories for the user', async () => {
    const rows = [{ id: 'habit-1', name: 'meditate', data_type: 'boolean' }];
    mockClient.query.mockResolvedValue({ rows });

    const result = await habitRepository.listHabits('user-1');

    expect(result).toBe(rows);
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain("data_type = 'boolean'");
    expect(params).toEqual(['user-1']);
  });

  it('upsertHabitLog updates the existing row when one exists', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: 'cm-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    await habitRepository.upsertHabitLog(
      'user-1',
      'habit-1',
      '2026-06-11',
      'true'
    );

    expect(mockClient.query).toHaveBeenCalledTimes(2);
    const [updateSql, updateParams] = mockClient.query.mock.calls[1];
    expect(updateSql).toContain('UPDATE custom_measurements');
    expect(updateParams).toEqual(['true', 'cm-1']);
  });

  it('upsertHabitLog inserts when no row exists', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await habitRepository.upsertHabitLog(
      'user-1',
      'habit-1',
      '2026-06-11',
      'false'
    );

    const [insertSql, insertParams] = mockClient.query.mock.calls[1];
    expect(insertSql).toContain('INSERT INTO custom_measurements');
    expect(insertParams).toEqual(['user-1', 'habit-1', 'false', '2026-06-11']);
  });

  it('getHabitHistory adds range clauses only for provided bounds', async () => {
    await habitRepository.getHabitHistory('user-1', 'habit-1');
    let [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).not.toContain('entry_date >=');
    expect(sql).not.toContain('entry_date <=');
    expect(params).toEqual(['user-1', 'habit-1']);

    await habitRepository.getHabitHistory(
      'user-1',
      'habit-1',
      '2026-06-01',
      '2026-06-11'
    );
    [sql, params] = mockClient.query.mock.calls[1];
    expect(sql).toContain('entry_date >= $3');
    expect(sql).toContain('entry_date <= $4');
    expect(params).toEqual(['user-1', 'habit-1', '2026-06-01', '2026-06-11']);
  });
});

describe('measurementRepository.getWaterTotalsByDateRange', () => {
  it('sums per day over the optional range', async () => {
    const rows = [{ entry_date: '2026-06-10', total_ml: '1500' }];
    mockClient.query.mockResolvedValue({ rows });

    const result = await measurementRepository.getWaterTotalsByDateRange(
      'user-1',
      '2026-06-01',
      '2026-06-11'
    );

    expect(result).toBe(rows);
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('SUM(water_ml)');
    expect(sql).toContain('GROUP BY entry_date');
    expect(params).toEqual(['user-1', '2026-06-01', '2026-06-11']);
  });

  it('omits range clauses when no bounds are given', async () => {
    await measurementRepository.getWaterTotalsByDateRange('user-1');
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).not.toContain('entry_date >=');
    expect(sql).not.toContain('entry_date <=');
    expect(params).toEqual(['user-1']);
  });
});

describe('reportRepository.getDailyNutritionTotalsRange', () => {
  it('returns per-day scaled totals including micros', async () => {
    const rows = [{ entry_date: '2026-06-10', calories: '1900', iron: '8' }];
    mockClient.query.mockResolvedValue({ rows });

    const result = await reportRepository.getDailyNutritionTotalsRange(
      'user-1',
      '2026-06-01',
      '2026-06-11'
    );

    expect(result).toBe(rows);
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain(
      'SUM(dietary_fiber * quantity / NULLIF(serving_size, 0)) as fiber'
    );
    expect(sql).toContain(
      'SUM(sugars * quantity / NULLIF(serving_size, 0)) as sugar'
    );
    expect(params).toEqual(['user-1', '2026-06-01', '2026-06-11']);
  });
});

describe('exerciseEntry range/usage queries', () => {
  it('getDailyExerciseTotalsRange groups totals by entry_date', async () => {
    await exerciseEntryRepository.getDailyExerciseTotalsRange(
      'user-1',
      '2026-06-01',
      '2026-06-11'
    );
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('GROUP BY entry_date');
    expect(sql).toContain('entry_date BETWEEN $2 AND $3');
    expect(params).toEqual(['user-1', '2026-06-01', '2026-06-11']);
  });

  it('getRecentExerciseEntries joins the exercise catalog', async () => {
    await exerciseEntryRepository.getRecentExerciseEntries('user-1', 50);
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('LEFT JOIN exercises e ON e.id = ee.exercise_id');
    expect(params).toEqual(['user-1', 50]);
  });

  it('getExerciseUsage returns rows with the total count', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ count: 9 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'entry-1' }] });

    const result = await exerciseEntryRepository.getExerciseUsage(
      'user-1',
      'exercise-1',
      '2026-06-01',
      '2026-06-11',
      20,
      0
    );

    expect(result).toEqual({ rows: [{ id: 'entry-1' }], totalCount: 9 });
    const [, dataParams] = mockClient.query.mock.calls[1];
    expect(dataParams).toEqual([
      'user-1',
      'exercise-1',
      '2026-06-01',
      '2026-06-11',
      20,
      0,
    ]);
  });
});

describe('foodEntry recent/usage queries', () => {
  it('getRecentFoodEntries joins meal types and the food catalog', async () => {
    await foodEntryRepository.getRecentFoodEntries('user-1', 25);
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('LEFT JOIN meal_types mt ON mt.id = fe.meal_type_id');
    expect(sql).toContain('LEFT JOIN foods f ON f.id = fe.food_id');
    expect(params).toEqual(['user-1', 25]);
  });

  it('getFoodUsage returns rows with the total count and defaults count to 0', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'entry-1' }] });

    const result = await foodEntryRepository.getFoodUsage(
      'user-1',
      'food-1',
      '2026-06-01',
      '2026-06-11',
      20,
      40
    );

    expect(result).toEqual({ rows: [{ id: 'entry-1' }], totalCount: 0 });
    const [, dataParams] = mockClient.query.mock.calls[1];
    expect(dataParams).toEqual([
      'user-1',
      'food-1',
      '2026-06-01',
      '2026-06-11',
      20,
      40,
    ]);
  });
});

describe('goalRepository.getGoalTimeline', () => {
  it('returns the compact goal history newest first', async () => {
    const rows = [{ id: 'goal-1', goal_date: '2026-06-01', calories: 2200 }];
    mockClient.query.mockResolvedValue({ rows });

    const result = await goalRepository.getGoalTimeline('user-1');

    expect(result).toBe(rows);
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain(
      'SELECT id, goal_date, calories, protein, carbs, fat, water_goal_ml'
    );
    expect(sql).toContain('ORDER BY goal_date DESC');
    expect(params).toEqual(['user-1']);
  });
});
