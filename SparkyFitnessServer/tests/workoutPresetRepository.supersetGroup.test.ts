import { vi, beforeEach, describe, expect, it } from 'vitest';
import { getClient } from '../db/poolManager.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const USER_ID = '99999999-9999-4999-8999-999999999999';
const EXERCISE_ID = '11111111-1111-4111-8111-111111111111';

function makeClient() {
  const client = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: vi.fn(async (sql: string, _params?: any[]) => {
      if (/INSERT INTO workout_presets/.test(sql)) {
        return {
          rows: [
            {
              id: 7,
              user_id: USER_ID,
              name: 'Push Day',
              description: null,
              is_public: false,
            },
          ],
        };
      }
      if (/INSERT INTO workout_preset_exercises/.test(sql)) {
        return { rows: [{ id: 101 }] };
      }
      if (/UPDATE workout_presets/.test(sql)) {
        return { rows: [{ id: 7 }] };
      }
      if (/SELECT/.test(sql)) {
        return { rows: [{ id: 7, exercises: [] }] };
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  return client;
}

function exerciseInsertCalls(client: ReturnType<typeof makeClient>) {
  return client.query.mock.calls.filter(([sql]) =>
    /INSERT INTO workout_preset_exercises/.test(sql)
  );
}

describe('workoutPresetRepository superset_group', () => {
  let client: ReturnType<typeof makeClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client);
  });

  it('create inserts superset_group values and defaults absent to null', async () => {
    await workoutPresetRepository.createWorkoutPreset({
      user_id: USER_ID,
      name: 'Push Day',
      description: null,
      is_public: false,
      exercises: [
        {
          exercise_id: EXERCISE_ID,
          image_url: null,
          sort_order: 0,
          superset_group: 2,
          sets: [],
        },
        {
          exercise_id: EXERCISE_ID,
          image_url: null,
          sort_order: 1,
          sets: [],
        },
      ],
    });

    const inserts = exerciseInsertCalls(client);
    expect(inserts).toHaveLength(2);
    expect(inserts[0][0]).toContain('superset_group');
    expect(inserts[0][1]?.[4]).toBe(2);
    expect(inserts[1][1]?.[4]).toBeNull();
  });

  it('update round-trips superset_group through delete-and-recreate', async () => {
    await workoutPresetRepository.updateWorkoutPreset(7, USER_ID, {
      name: 'Push Day',
      exercises: [
        {
          exercise_id: EXERCISE_ID,
          image_url: null,
          sort_order: 0,
          superset_group: 3,
          sets: [],
        },
        {
          exercise_id: EXERCISE_ID,
          image_url: null,
          sort_order: 1,
          superset_group: null,
          sets: [],
        },
      ],
    });

    const inserts = exerciseInsertCalls(client);
    expect(inserts).toHaveLength(2);
    expect(inserts[0][1]?.[4]).toBe(3);
    expect(inserts[1][1]?.[4]).toBeNull();
  });

  it('selects superset_group in every nested exercise read', async () => {
    await workoutPresetRepository.getWorkoutPresetById(7, USER_ID);
    await workoutPresetRepository.getWorkoutPresets(USER_ID, 1, 10);
    await workoutPresetRepository.searchWorkoutPresets('push', USER_ID);
    await workoutPresetRepository.getWorkoutPresetByName(USER_ID, 'Push Day');

    const selects = client.query.mock.calls.filter(([sql]) =>
      /FROM workout_preset_exercises wpe/.test(sql)
    );
    expect(selects.length).toBeGreaterThanOrEqual(4);
    for (const [sql] of selects) {
      expect(sql).toContain('wpe.superset_group');
    }
  });
});
