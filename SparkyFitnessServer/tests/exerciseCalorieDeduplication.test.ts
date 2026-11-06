import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveExerciseCalories } from '@workspace/shared';
import { extractExerciseStats } from '../services/calorieBalanceService.js';
import { getExerciseEntriesByDateV2 } from '../services/exerciseEntryHistoryService.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import { getClient } from '../db/poolManager.js';
import { createMockDbClient } from './helpers/mockDbClient.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const day = '2026-01-10';
const garmin = {
  id: 'garmin-hike',
  exercise_id: 'hike',
  exercise_name: 'Afternoon Hiking',
  category: 'cardio',
  source: 'garmin',
  source_id: 'garmin-activity',
  entry_date: day,
  entry_time: '14:30:00',
  duration_minutes: 60.005,
  distance: 5.6789,
  calories_burned: 450,
  steps: 8000,
};
const healthkit = {
  ...garmin,
  id: 'healthkit-hike',
  exercise_name: 'Hiking',
  source: 'HealthKit',
  source_id: 'healthkit-activity',
  record_timezone: 'Europe/Prague',
  duration_minutes: 60,
  distance: 5.68,
  steps: null,
};
const active = {
  ...garmin,
  id: 'daily-active',
  exercise_name: 'Active Calories',
  source_id: null,
  duration_minutes: 0,
  calories_burned: 600,
  steps: 0,
};
type Entry = typeof garmin & {
  record_timezone?: string;
  calories_applied?: number | null;
  calorie_link_id?: string | null;
  exercise_preset_entry_id?: string | null;
};
type Row = Omit<Entry, 'steps' | 'source_id'> & {
  steps: number | null;
  source_id: string | null;
};

describe('calorie totals for the same imported workout', () => {
  const client = createMockDbClient();
  let rows: Row[];

  beforeEach(() => {
    vi.clearAllMocks();
    rows = [active, garmin, healthkit];
    vi.mocked(getClient).mockResolvedValue(client);
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM exercise_preset_entries')) {
        return {
          rows: rows
            .filter((row) => row.exercise_preset_entry_id)
            .map((row) => ({
              id: row.exercise_preset_entry_id,
              name: 'Imported session',
            })),
        };
      }
      if (sql.includes('FROM exercise_entries ee')) return { rows };
      if (sql.includes('FROM exercise_entries')) return { rows };
      return { rows: [] };
    });
  });

  async function expectBothPaths(expected: {
    activeCalories: number;
    otherCalories: number;
    activitySteps: number;
  }) {
    const sessions = await getExerciseEntriesByDateV2('user-1', day);
    expect(extractExerciseStats(sessions)).toEqual(expected);
    const splits =
      await exerciseEntryRepository.getDailyExerciseCalorieSplitRange(
        'user-1',
        day,
        day
      );
    expect(splits).toEqual([
      {
        entry_date: day,
        active_calories: expected.activeCalories,
        other_calories: expected.otherCalories,
        activity_steps: expected.activitySteps,
      },
    ]);
    return sessions;
  }

  it('counts matching Garmin and HealthKit copies once without removing diary rows', async () => {
    const sessions = await expectBothPaths({
      activeCalories: 600,
      otherCalories: 450,
      activitySteps: 8000,
    });
    expect(sessions).toHaveLength(3);
    const stats = extractExerciseStats(sessions);
    expect(
      resolveExerciseCalories(stats.otherCalories, stats.activeCalories, 50)
    ).toEqual({ calories: 600, source: 'active' });
  });

  it('is independent of sync order and does not add the same workout steps twice', async () => {
    rows = [{ ...healthkit, steps: 7900 }, garmin, active];
    await expectBothPaths({
      activeCalories: 600,
      otherCalories: 450,
      activitySteps: 8000,
    });
    rows.reverse();
    await expectBothPaths({
      activeCalories: 600,
      otherCalories: 450,
      activitySteps: 8000,
    });
  });

  it.each([
    ['different start', { entry_time: '16:30:00' }],
    ['different duration', { duration_minutes: 70 }],
    ['different distance', { distance: 6 }],
    ['different calories', { calories_burned: 400 }],
    ['different sport', { exercise_name: 'Cycling' }],
    ['missing start', { entry_time: null }],
    ['missing distance', { distance: null }],
    ['unknown sport', { exercise_name: 'Activity' }],
    ['manual entry', { source: 'manual' }],
    ['same provider', { source: 'garmin' }],
  ])('keeps workouts additive with %s', async (_label, changes) => {
    rows = [active, garmin, { ...healthkit, ...changes } as Row];
    await expectBothPaths({
      activeCalories: 600,
      otherCalories:
        450 + ('calories_burned' in changes ? changes.calories_burned : 450),
      activitySteps: 8000,
    });
  });

  it('does not guess which same-provider workout another import belongs to', async () => {
    rows.push({ ...garmin, id: 'second-garmin', source_id: 'second-activity' });
    await expectBothPaths({
      activeCalories: 600,
      otherCalories: 1350,
      activitySteps: 16000,
    });
  });

  it('does not collapse workouts recorded in different explicit timezones', async () => {
    rows = [active, { ...garmin, record_timezone: 'UTC' }, healthkit];
    await expectBothPaths({
      activeCalories: 600,
      otherCalories: 900,
      activitySteps: 8000,
    });
  });

  it.each([0, 120])(
    'honours an explicit counted-calorie value of %s',
    async (value) => {
      rows = [active, { ...garmin, calories_applied: value }, healthkit];
      const sessions = await expectBothPaths({
        activeCalories: 600,
        otherCalories: value + 450,
        activitySteps: 8000,
      });
      expect(
        sessions.find((session) => session.id === garmin.id)
      ).toHaveProperty('calories_applied', value);
    }
  );

  it('preserves explicit calorie links even when the two raw estimates match', async () => {
    rows = [active, { ...garmin, calorie_link_id: 'chosen-link' }, healthkit];
    await expectBothPaths({
      activeCalories: 600,
      otherCalories: 900,
      activitySteps: 8000,
    });
  });

  it('does not reconcile preset children against standalone imports', async () => {
    rows = [
      active,
      { ...garmin, exercise_preset_entry_id: 'imported-session' },
      healthkit,
    ];
    await expectBothPaths({
      activeCalories: 600,
      otherCalories: 900,
      activitySteps: 8000,
    });
  });

  it('keeps dates separate in a ranged read, with the original user-scoped query', async () => {
    rows = [garmin, { ...healthkit, entry_date: '2026-01-11' }];
    expect(
      await exerciseEntryRepository.getDailyExerciseCalorieSplitRange(
        'user-1',
        day,
        '2026-01-11'
      )
    ).toEqual([
      {
        entry_date: day,
        active_calories: 0,
        other_calories: 450,
        activity_steps: 8000,
      },
      {
        entry_date: '2026-01-11',
        active_calories: 0,
        other_calories: 450,
        activity_steps: 0,
      },
    ]);
    expect(getClient).toHaveBeenCalledWith('user-1');
    expect(client.query).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('user_id = $1 AND entry_date BETWEEN $2 AND $3'),
      ['user-1', day, '2026-01-11']
    );
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('returns no ranged split when there are no entries', async () => {
    rows = [];
    expect(
      await exerciseEntryRepository.getDailyExerciseCalorieSplitRange(
        'user-1',
        day,
        day
      )
    ).toEqual([]);
  });
});
