import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHARED_SCHEMA_FILE =
  '../../shared/src/schemas/api/ExerciseEntries.api.zod.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runSchema(schemaName: any, payload: any) {
  // ÄNDERUNG: import * as schemaModule verwenden
  const script = `
    import * as schemaModule from '${SHARED_SCHEMA_FILE}';
    const schema = schemaModule.${schemaName};
    const result = schema.safeParse(${JSON.stringify(payload)});
    const output = result.success
      ? { success: true, data: result.data }
      : { success: false, issues: result.error.issues.map((issue) => issue.message) };
    console.log(JSON.stringify(output));
  `;

  return JSON.parse(
    execFileSync(process.execPath, ['--import', 'tsx', '-e', script], {
      encoding: 'utf8',
      cwd: __dirname,
    }).trim()
  );
}

describe('Exercise entry API schemas', () => {
  const exerciseId = '11111111-1111-4111-8111-111111111111';

  it('accepts preset-based create payloads', () => {
    const result = runSchema('createPresetSessionRequestSchema', {
      workout_preset_id: 42,
      entry_date: '2026-03-12',
      notes: null,
    });
    expect(result).toEqual({
      success: true,
      data: {
        workout_preset_id: 42,
        entry_date: '2026-03-12',
        notes: null,
        source: 'manual',
      },
    });
  });

  it('accepts freeform inline create payloads', () => {
    const result = runSchema('createPresetSessionRequestSchema', {
      name: 'Morning Workout',
      entry_date: '2026-03-12',
      description: null,
      notes: null,
      source: 'sparky',
      exercises: [
        {
          exercise_id: exerciseId,
          sort_order: 0,
          duration_minutes: 0,
          notes: null,
          sets: [
            {
              set_number: 1,
              set_type: 'working',
              reps: 10,
              weight: 60,
              notes: null,
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data.name).toBe('Morning Workout');
    expect(result.data.exercises).toHaveLength(1);
  });

  it('rejects create payloads that provide both workout sources', () => {
    const result = runSchema('createPresetSessionRequestSchema', {
      workout_preset_id: 42,
      name: 'Morning Workout',
      entry_date: '2026-03-12',
      exercises: [
        {
          exercise_id: exerciseId,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects create payloads that provide neither workout source', () => {
    const result = runSchema('createPresetSessionRequestSchema', {
      entry_date: '2026-03-12',
      name: 'Morning Workout',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty exercise arrays', () => {
    const result = runSchema('createPresetSessionRequestSchema', {
      name: 'Morning Workout',
      entry_date: '2026-03-12',
      exercises: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts nullable fields in update payloads', () => {
    const result = runSchema('updatePresetSessionRequestSchema', {
      description: null,
      notes: null,
    });
    expect(result).toEqual({
      success: true,
      data: {
        description: null,
        notes: null,
      },
    });
  });

  it('rejects empty update payloads', () => {
    const result = runSchema('updatePresetSessionRequestSchema', {});
    expect(result.success).toBe(false);
  });

  it('accepts a stats payload with both bestSet and lastSet populated', () => {
    const result = runSchema('exerciseStatsResponseSchema', {
      bestSet: {
        entryDate: '2026-05-20',
        weight: 100,
        reps: 5,
        setNumber: 3,
      },
      lastSet: {
        entryDate: '2026-05-19',
        weight: 80,
        reps: 8,
        setNumber: 1,
      },
    });
    expect(result.success).toBe(true);
    expect(result.data.bestSet.weight).toBe(100);
    expect(result.data.lastSet.setNumber).toBe(1);
  });

  it('accepts a stats payload with both nulls (no history)', () => {
    const result = runSchema('exerciseStatsResponseSchema', {
      bestSet: null,
      lastSet: null,
    });
    expect(result).toEqual({
      success: true,
      data: { bestSet: null, lastSet: null },
    });
  });

  it('accepts lastSet with null weight (bodyweight exercise)', () => {
    const result = runSchema('exerciseStatsResponseSchema', {
      bestSet: null,
      lastSet: {
        entryDate: '2026-05-19',
        weight: null,
        reps: 10,
        setNumber: 2,
      },
    });
    expect(result.success).toBe(true);
    expect(result.data.lastSet.weight).toBeNull();
  });

  it('rejects stats payloads with non-YYYY-MM-DD entryDate', () => {
    const result = runSchema('exerciseStatsResponseSchema', {
      bestSet: {
        entryDate: '05/20/2026',
        weight: 100,
        reps: 5,
        setNumber: 1,
      },
      lastSet: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects stats payloads with unknown keys (strict)', () => {
    const result = runSchema('exerciseStatsResponseSchema', {
      bestSet: null,
      lastSet: null,
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer reps in a set stats row', () => {
    const result = runSchema('exerciseStatsResponseSchema', {
      bestSet: {
        entryDate: '2026-05-20',
        weight: 100,
        reps: 5.5,
        setNumber: 1,
      },
      lastSet: null,
    });
    expect(result.success).toBe(false);
  });

  describe('superset_group', () => {
    const baseExercise = {
      exercise_id: exerciseId,
      sort_order: 0,
      duration_minutes: 0,
      sets: [],
    };

    const baseEntryResponse = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      exercise_id: exerciseId,
      duration_minutes: 0,
      calories_burned: 0,
      entry_date: '2026-03-12',
      notes: null,
      distance: null,
      avg_heart_rate: null,
      source: 'manual',
      sets: [],
      exercise_snapshot: null,
      activity_details: [],
    };

    it('accepts an integer superset_group on session exercises', () => {
      const result = runSchema('createPresetSessionRequestSchema', {
        name: 'Morning Workout',
        entry_date: '2026-03-12',
        exercises: [{ ...baseExercise, superset_group: 1 }],
      });
      expect(result.success).toBe(true);
      expect(result.data.exercises[0].superset_group).toBe(1);
    });

    it('accepts null and omitted superset_group on session exercises', () => {
      const withNull = runSchema('createPresetSessionRequestSchema', {
        name: 'Morning Workout',
        entry_date: '2026-03-12',
        exercises: [{ ...baseExercise, superset_group: null }],
      });
      expect(withNull.success).toBe(true);
      expect(withNull.data.exercises[0].superset_group).toBeNull();

      const omitted = runSchema('createPresetSessionRequestSchema', {
        name: 'Morning Workout',
        entry_date: '2026-03-12',
        exercises: [baseExercise],
      });
      expect(omitted.success).toBe(true);
      expect(omitted.data.exercises[0]).not.toHaveProperty('superset_group');
    });

    it('rejects non-integer superset_group values', () => {
      const result = runSchema('createPresetSessionRequestSchema', {
        name: 'Morning Workout',
        entry_date: '2026-03-12',
        exercises: [{ ...baseExercise, superset_group: 1.5 }],
      });
      expect(result.success).toBe(false);
    });

    it('requires superset_group on entry responses', () => {
      const missing = runSchema(
        'exerciseEntryResponseSchema',
        baseEntryResponse
      );
      expect(missing.success).toBe(false);

      const withValue = runSchema('exerciseEntryResponseSchema', {
        ...baseEntryResponse,
        superset_group: 2,
      });
      expect(withValue.success).toBe(true);

      const withNull = runSchema('exerciseEntryResponseSchema', {
        ...baseEntryResponse,
        superset_group: null,
      });
      expect(withNull.success).toBe(true);
    });
  });

  describe('completed_at', () => {
    const baseSetRequest = {
      set_number: 1,
      set_type: 'working',
      reps: 10,
      weight: 60,
    };

    const baseSetResponse = {
      id: 7,
      set_number: 1,
      set_type: 'working',
      reps: 10,
      weight: 60,
      duration: null,
      rest_time: null,
      notes: null,
      rpe: null,
      is_pr: false,
    };

    it('accepts ISO, null, and omitted completed_at on set requests', () => {
      const withIso = runSchema('exerciseEntrySetRequestSchema', {
        ...baseSetRequest,
        completed_at: '2026-07-06T15:04:05.123Z',
      });
      expect(withIso.success).toBe(true);
      expect(withIso.data.completed_at).toBe('2026-07-06T15:04:05.123Z');

      const withNull = runSchema('exerciseEntrySetRequestSchema', {
        ...baseSetRequest,
        completed_at: null,
      });
      expect(withNull.success).toBe(true);
      expect(withNull.data.completed_at).toBeNull();

      const omitted = runSchema(
        'exerciseEntrySetRequestSchema',
        baseSetRequest
      );
      expect(omitted.success).toBe(true);
      expect(omitted.data).not.toHaveProperty('completed_at');
    });

    it('rejects non-ISO completed_at on set requests', () => {
      const result = runSchema('exerciseEntrySetRequestSchema', {
        ...baseSetRequest,
        completed_at: 'yesterday at noon',
      });
      expect(result.success).toBe(false);
    });

    it('requires completed_at on set responses', () => {
      const missing = runSchema(
        'exerciseEntrySetResponseSchema',
        baseSetResponse
      );
      expect(missing.success).toBe(false);

      const withValue = runSchema('exerciseEntrySetResponseSchema', {
        ...baseSetResponse,
        completed_at: '2026-07-06T15:04:05.123Z',
      });
      expect(withValue.success).toBe(true);

      const withNull = runSchema('exerciseEntrySetResponseSchema', {
        ...baseSetResponse,
        completed_at: null,
      });
      expect(withNull.success).toBe(true);
    });
  });

  describe('is_pr', () => {
    const baseSetRequest = {
      set_number: 1,
      set_type: 'working',
      reps: 10,
      weight: 60,
    };

    const baseSetResponse = {
      id: 7,
      set_number: 1,
      set_type: 'working',
      reps: 10,
      weight: 60,
      duration: null,
      rest_time: null,
      notes: null,
      rpe: null,
      completed_at: null,
    };

    it('accepts boolean and omitted is_pr on set requests', () => {
      const withTrue = runSchema('exerciseEntrySetRequestSchema', {
        ...baseSetRequest,
        is_pr: true,
      });
      expect(withTrue.success).toBe(true);
      expect(withTrue.data.is_pr).toBe(true);

      const omitted = runSchema(
        'exerciseEntrySetRequestSchema',
        baseSetRequest
      );
      expect(omitted.success).toBe(true);
      expect(omitted.data).not.toHaveProperty('is_pr');
    });

    it('requires is_pr on set responses', () => {
      const missing = runSchema(
        'exerciseEntrySetResponseSchema',
        baseSetResponse
      );
      expect(missing.success).toBe(false);

      const withValue = runSchema('exerciseEntrySetResponseSchema', {
        ...baseSetResponse,
        is_pr: true,
      });
      expect(withValue.success).toBe(true);
    });
  });

  // #1353: RN's whatwg-fetch appends `_=<timestamp>` to GET URLs when callers
  // pass `cache: 'no-store'`. The strict history query schema must tolerate it.
  it('accepts the whatwg-fetch `_` cache-buster param', () => {
    const result = runSchema('exerciseHistoryQuerySchema', {
      page: '2',
      _: '1733419200000',
    });
    expect(result.success).toBe(true);
  });

  // Keeping `.strict()` so genuine client typos still fail loudly.
  it('still rejects unknown keys like a misspelled param', () => {
    const result = runSchema('exerciseHistoryQuerySchema', { pageSzie: '50' });
    expect(result.success).toBe(false);
  });
});
