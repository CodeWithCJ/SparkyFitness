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
import fastingRepository from '../models/fastingRepository.js';
import foodEntryMealRepository from '../models/foodEntryMealRepository.js';
import externalProviderRepository from '../models/externalProviderRepository.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));
// externalProviderRepository imports the encryption module, which requires a
// key from the environment at import time.
vi.mock('../security/encryption', () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  ENCRYPTION_KEY: 'test-key',
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

  it("getWeightSeries anchors the window on the caller's today", async () => {
    await coachRepository.getWeightSeries('user-1', 14, '2026-06-11');
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('entry_date >= ($3::date - $2::int)');
    expect(sql).not.toContain('CURRENT_DATE');
    expect(params).toEqual(['user-1', 14, '2026-06-11']);
  });

  it("getDailyCalorieSeries anchors the window on the caller's today", async () => {
    await coachRepository.getDailyCalorieSeries('user-1', 14, '2026-06-11');
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('entry_date >= ($3::date - $2::int)');
    expect(sql).not.toContain('CURRENT_DATE');
    expect(params).toEqual(['user-1', 14, '2026-06-11']);
  });

  it("getDailyCorrelationRows joins food, sleep and mood by day, all anchored on the caller's today", async () => {
    await coachRepository.getDailyCorrelationRows('user-1', 30, '2026-06-11');
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('daily_food');
    expect(sql).toContain('daily_sleep');
    expect(sql).toContain('daily_mood');
    // All three CTEs must carry the anchor — a single toContain would pass
    // with a half-fixed query.
    expect(sql.match(/entry_date >= \$3::date - \$2::int/g)).toHaveLength(3);
    expect(sql).not.toContain('CURRENT_DATE');
    expect(params).toEqual(['user-1', 30, '2026-06-11']);
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
    expect(
      await engagementRepository.getWeeklyLoggedDayCount('user-1', '2026-06-11')
    ).toBe(0);
  });

  it("getWeeklyLoggedDayCount anchors all three UNION branches on the caller's today", async () => {
    await engagementRepository.getWeeklyLoggedDayCount('user-1', '2026-06-11');
    const [sql, params] = mockClient.query.mock.calls[0];
    // All three UNION branches must carry the anchor — a single toContain
    // would pass with a half-fixed query.
    expect(sql.match(/entry_date >= \(\$2::date - 7\)/g)).toHaveLength(3);
    expect(sql).not.toContain('CURRENT_DATE');
    expect(params).toEqual(['user-1', '2026-06-11']);
  });

  it('getTodayActivityCounts maps the three count queries and defaults to 0', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ count: 3 }] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await engagementRepository.getTodayActivityCounts(
      'user-1',
      '2026-06-11',
      'UTC'
    );

    expect(result).toEqual({
      food_count: 3,
      exercise_count: 1,
      checkin_count: 0,
    });
    expect(mockClient.query).toHaveBeenCalledTimes(3);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it("getTodayActivityCounts anchors every query on the caller's today, bucketing fasts in the user's timezone", async () => {
    await engagementRepository.getTodayActivityCounts(
      'user-1',
      '2026-06-11',
      'Asia/Tokyo'
    );

    const [foodSql, foodParams] = mockClient.query.mock.calls[0];
    expect(foodSql).toContain('entry_date = $2::date');
    expect(foodSql).not.toContain('CURRENT_DATE');
    expect(foodParams).toEqual(['user-1', '2026-06-11']);

    const [exerciseSql, exerciseParams] = mockClient.query.mock.calls[1];
    expect(exerciseSql).toContain('entry_date = $2::date');
    expect(exerciseSql).not.toContain('CURRENT_DATE');
    expect(exerciseParams).toEqual(['user-1', '2026-06-11']);

    const [checkinSql, checkinParams] = mockClient.query.mock.calls[2];
    // All three entry_date branches plus the fasting branch must carry the
    // anchor — a single toContain would pass with a half-fixed query.
    expect(checkinSql.match(/entry_date = \$2::date/g)).toHaveLength(3);
    expect(checkinSql).toContain(
      '(start_time AT TIME ZONE $3)::date = $2::date'
    );
    expect(checkinSql).not.toContain('CURRENT_DATE');
    expect(checkinParams).toEqual(['user-1', '2026-06-11', 'Asia/Tokyo']);
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

  it('getExerciseDiaryRange returns entries plus their sets', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: 'ee-1' }, { id: 'ee-2' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 's-1', exercise_entry_id: 'ee-1' }],
      });

    const result = await exerciseEntryRepository.getExerciseDiaryRange(
      'user-1',
      '2026-06-01',
      '2026-06-11'
    );

    expect(result).toEqual({
      entries: [{ id: 'ee-1' }, { id: 'ee-2' }],
      sets: [{ id: 's-1', exercise_entry_id: 'ee-1' }],
    });
    const [entriesSql, entriesParams] = mockClient.query.mock.calls[0];
    expect(entriesSql).toContain(
      'LEFT JOIN exercises e ON e.id = ee.exercise_id'
    );
    expect(entriesSql).toContain('ee.entry_date BETWEEN $2 AND $3');
    expect(entriesParams).toEqual(['user-1', '2026-06-01', '2026-06-11']);
    const [setsSql, setsParams] = mockClient.query.mock.calls[1];
    expect(setsSql).toContain('exercise_entry_id = ANY($1)');
    expect(setsParams).toEqual([['ee-1', 'ee-2']]);
  });

  it('getExerciseDiaryRange skips the sets query when there are no entries', async () => {
    const result = await exerciseEntryRepository.getExerciseDiaryRange(
      'user-1',
      '2026-06-01',
      '2026-06-11'
    );
    expect(result).toEqual({ entries: [], sets: [] });
    expect(mockClient.query).toHaveBeenCalledTimes(1);
  });

  // Answers the snapshot SELECT, the entry INSERT and the refetch so a
  // createExerciseEntry call can run end to end; the dedup lookup, when it
  // happens, finds nothing.
  function mockEntryCreateQueries() {
    mockClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM exercise_entries')) {
        return { rows: [] };
      }
      if (sql.includes('FROM exercises WHERE id')) {
        return {
          rows: [
            { name: 'Running', calories_per_hour: 300, category: 'custom' },
          ],
        };
      }
      return { rows: [{ id: 'ee-new' }] };
    });
  }

  function findQueryCall(snippet: string) {
    return mockClient.query.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes(snippet)
    );
  }

  it('createExerciseEntry dedupes manual same-exercise/same-date entries by default', async () => {
    mockEntryCreateQueries();
    await exerciseEntryRepository.createExerciseEntry(
      'user-1',
      { exercise_id: 'ex-1', entry_date: '2026-06-11' },
      'actor-1'
    );
    expect(findQueryCall('exercise_preset_entry_id IS NULL')).toBeDefined();
    expect(findQueryCall('INSERT INTO exercise_entries')).toBeDefined();
  });

  it('createExerciseEntry always inserts when skipDuplicateCheck is set', async () => {
    mockEntryCreateQueries();
    await exerciseEntryRepository.createExerciseEntry(
      'user-1',
      { exercise_id: 'ex-1', entry_date: '2026-06-11' },
      'actor-1',
      'Manual',
      null,
      { skipDuplicateCheck: true }
    );
    expect(findQueryCall('exercise_preset_entry_id IS NULL')).toBeUndefined();
    expect(findQueryCall('INSERT INTO exercise_entries')).toBeDefined();
  });

  it('updateExerciseEntry persists steps', async () => {
    await exerciseEntryRepository.updateExerciseEntry(
      'ee-1',
      'user-1',
      'actor-1',
      { steps: 1234 }
    );
    const updateCall = mockClient.query.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('UPDATE exercise_entries')
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;
    expect(sql).toContain('steps = $10');
    expect(params[9]).toBe(1234);
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

describe('foodEntryMealRepository.getFoodEntryMealsByDateRange', () => {
  it('returns flat meal-container rows for the range in diary order', async () => {
    const rows = [{ id: 'fem-1', name: 'Protein Shake' }];
    mockClient.query.mockResolvedValue({ rows });

    const result = await foodEntryMealRepository.getFoodEntryMealsByDateRange(
      'user-1',
      '2026-06-01',
      '2026-06-11'
    );

    expect(result).toBe(rows);
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('FROM food_entry_meals fem');
    expect(sql).toContain(
      'LEFT JOIN meal_types mt ON fem.meal_type_id = mt.id'
    );
    expect(sql).toContain('fem.entry_date BETWEEN $2 AND $3');
    expect(sql).toContain('ORDER BY fem.entry_date ASC, fem.created_at ASC');
    expect(params).toEqual(['user-1', '2026-06-01', '2026-06-11']);
    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe('externalProviderRepository.getActiveProvidersByTypes', () => {
  it('filters to active providers of the given types in cascade order', async () => {
    const rows = [
      { id: 'prov-1', provider_type: 'usda', provider_name: 'USDA' },
    ];
    mockClient.query.mockResolvedValue({ rows });

    const result = await externalProviderRepository.getActiveProvidersByTypes(
      'user-1',
      ['usda', 'openfoodfacts']
    );

    expect(result).toBe(rows);
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('FROM external_data_providers');
    expect(sql).toContain('is_active = TRUE');
    expect(sql).toContain('provider_type = ANY($2::text[])');
    expect(sql).toContain(
      'ORDER BY sort_order ASC NULLS LAST, created_at DESC'
    );
    expect(params).toEqual(['user-1', ['usda', 'openfoodfacts']]);
    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe('fastingRepository.getFastingLogsOverlappingDay', () => {
  it('matches windows overlapping the user-timezone day, including open-ended fasts', async () => {
    const rows = [{ id: 'f1', status: 'ACTIVE' }];
    mockClient.query.mockResolvedValue({ rows });

    const result = await fastingRepository.getFastingLogsOverlappingDay(
      'user-1',
      '2026-06-01',
      'Pacific/Auckland'
    );

    expect(result).toBe(rows);
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('(start_time AT TIME ZONE $3)::date <= $2::date');
    expect(sql).toContain(
      'end_time IS NULL OR (end_time AT TIME ZONE $3)::date >= $2::date'
    );
    // No bare ::date casts left — those bucket by the DB session timezone.
    expect(sql).not.toContain('start_time::date');
    expect(sql).not.toContain('end_time::date');
    expect(sql).toContain('ORDER BY start_time ASC');
    expect(params).toEqual(['user-1', '2026-06-01', 'Pacific/Auckland']);
    expect(mockClient.release).toHaveBeenCalled();
  });
});
