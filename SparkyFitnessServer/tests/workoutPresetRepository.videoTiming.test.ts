import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { getClient } from '../db/poolManager.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

const USER_ID = '99999999-9999-4999-8999-999999999999';
const EXERCISE_ID = '11111111-1111-4111-8111-111111111111';

describe('workoutPresetRepository video timing', () => {
  it('preserves omitted video timings by effective preset order for repeated exercises', async () => {
    const query = vi.fn(async (sql: string, _params?: readonly unknown[]) => {
      if (/UPDATE workout_presets/.test(sql)) {
        return { rows: [{ id: 7, video_url: 'https://youtu.be/testVideo01' }] };
      }
      if (/SELECT exercise_id, video_start_seconds/.test(sql)) {
        return {
          rows: [
            {
              exercise_id: EXERCISE_ID,
              video_start_seconds: 10,
              video_end_seconds: 15,
            },
            {
              exercise_id: EXERCISE_ID,
              video_start_seconds: 20,
              video_end_seconds: 25,
            },
            {
              exercise_id: EXERCISE_ID,
              video_start_seconds: 30,
              video_end_seconds: 35,
            },
          ],
        };
      }
      if (/INSERT INTO workout_preset_exercises/.test(sql)) {
        return { rows: [{ id: 101 }] };
      }
      return { rows: [] };
    });
    vi.mocked(getClient).mockResolvedValue({
      query,
      release: vi.fn(),
    } as unknown as PoolClient);

    await workoutPresetRepository.updateWorkoutPreset(7, USER_ID, {
      exercises: [
        { exercise_id: EXERCISE_ID, sort_order: 1, sets: [] },
        { exercise_id: EXERCISE_ID, sets: [] },
        {
          exercise_id: EXERCISE_ID,
          sort_order: 0,
          sets: [],
          video_start_seconds: 40,
          video_end_seconds: 45,
        },
      ],
    });

    const inserts = query.mock.calls
      .filter(([sql]) => /INSERT INTO workout_preset_exercises/.test(sql))
      .map(([, params]) => [params?.[3], params?.[11], params?.[12]]);
    expect(inserts).toEqual([
      [1, 30, 35],
      [0, 10, 15],
      [0, 40, 45],
    ]);
  });
});
