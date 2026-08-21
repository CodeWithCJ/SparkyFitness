import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { deriveExerciseModality } from '@workspace/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHARED_SCHEMA_FILE = '../../shared/src/schemas/api/Exercises.api.zod.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runSchema(schemaName: any, payload: any) {
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

describe('Exercises API schemas', () => {
  it('coerces page and pageSize from string query params', () => {
    const result = runSchema('exerciseSearchQuerySchema', {
      page: '2',
      pageSize: '50',
    });
    expect(result).toEqual({
      success: true,
      data: { page: 2, pageSize: 50 },
    });
  });

  it('applies default page=1 and pageSize=20 when omitted', () => {
    const result = runSchema('exerciseSearchQuerySchema', {});
    expect(result).toEqual({
      success: true,
      data: { page: 1, pageSize: 20 },
    });
  });

  it('rejects pageSize > 100', () => {
    const result = runSchema('exerciseSearchQuerySchema', { pageSize: '999' });
    expect(result.success).toBe(false);
  });

  it('rejects page < 1', () => {
    const result = runSchema('exerciseSearchQuerySchema', { page: '0' });
    expect(result.success).toBe(false);
  });

  // #1353: RN's whatwg-fetch appends `_=<timestamp>` to GET URLs when callers
  // pass `cache: 'no-store'`. The strict schema must tolerate that one key.
  it('accepts the whatwg-fetch `_` cache-buster param', () => {
    const result = runSchema('exerciseSearchQuerySchema', {
      searchTerm: 'squat',
      _: '1733419200000',
    });
    expect(result.success).toBe(true);
  });

  // Keeping `.strict()` (rather than `.loose()`) so genuine client typos still
  // fail loudly instead of being silently dropped.
  it('still rejects unknown keys like a misspelled param', () => {
    const result = runSchema('exerciseSearchQuerySchema', { pageSzie: '50' });
    expect(result.success).toBe(false);
  });

  it('round-trips a fully populated library item', () => {
    const item = {
      id: 'ex-1',
      source: 'manual',
      source_id: null,
      name: 'Push Up',
      force: 'push',
      level: 'beginner',
      mechanic: 'compound',
      equipment: ['bodyweight'],
      primary_muscles: ['chest'],
      secondary_muscles: ['triceps'],
      instructions: ['Plank position.', 'Lower then push up.'],
      category: 'strength',
      images: [],
      calories_per_hour: 300,
      description: null,
      user_id: 'user-123',
      is_custom: true,
      shared_with_public: false,
      tags: ['private'],
      modality: 'weight_reps',
    };
    const result = runSchema('exerciseLibraryItemSchema', item);
    expect(result).toEqual({ success: true, data: item });
  });

  it('rejects a library item whose modality is outside the enum', () => {
    const result = runSchema('exerciseLibraryItemSchema', {
      id: 'ex-1',
      source: 'manual',
      source_id: null,
      name: 'Push Up',
      force: null,
      level: null,
      mechanic: null,
      equipment: [],
      primary_muscles: [],
      secondary_muscles: [],
      instructions: [],
      category: null,
      images: [],
      calories_per_hour: null,
      description: null,
      user_id: null,
      is_custom: null,
      shared_with_public: null,
      tags: [],
      modality: 'time_only',
    });
    expect(result.success).toBe(false);
  });

  it('rejects library items missing the tags field (column drift guard)', () => {
    const item = {
      id: 'ex-1',
      source: 'manual',
      source_id: null,
      name: 'Push Up',
      force: null,
      level: null,
      mechanic: null,
      equipment: [],
      primary_muscles: [],
      secondary_muscles: [],
      instructions: [],
      category: null,
      images: [],
      calories_per_hour: null,
      description: null,
      user_id: null,
      is_custom: null,
      shared_with_public: null,
      // tags omitted
    };
    const result = runSchema('exerciseLibraryItemSchema', item);
    expect(result.success).toBe(false);
  });

  describe('exerciseWriteArrayFieldsSchema', () => {
    it('passes an already-correct array through unchanged', () => {
      const result = runSchema('exerciseWriteArrayFieldsSchema', {
        equipment: ['Barbell', 'Dumbbell'],
      });
      expect(result).toEqual({
        success: true,
        data: { equipment: ['Barbell', 'Dumbbell'] },
      });
    });

    // Normalization
    it('wraps a bare string into a one-item array instead of rejecting it', () => {
      const result = runSchema('exerciseWriteArrayFieldsSchema', {
        equipment: 'Barbell',
        primary_muscles: 'chest',
        secondary_muscles: ['triceps'],
        instructions: 'Lie on the bench.',
      });
      expect(result).toEqual({
        success: true,
        data: {
          equipment: ['Barbell'],
          primary_muscles: ['chest'],
          secondary_muscles: ['triceps'],
          instructions: ['Lie on the bench.'],
        },
      });
    });

    it('leaves null and missing fields alone rather than coercing to []', () => {
      const result = runSchema('exerciseWriteArrayFieldsSchema', {
        equipment: null,
      });
      expect(result).toEqual({ success: true, data: { equipment: null } });
      expect(result.data).not.toHaveProperty('primary_muscles');
    });

    it('rejects a genuinely wrong type (not a string/array formatting quirk)', () => {
      expect(
        runSchema('exerciseWriteArrayFieldsSchema', { equipment: 5 }).success
      ).toBe(false);
      expect(
        runSchema('exerciseWriteArrayFieldsSchema', { equipment: true }).success
      ).toBe(false);
      expect(
        runSchema('exerciseWriteArrayFieldsSchema', {
          equipment: { not: 'valid' },
        }).success
      ).toBe(false);
    });

    it('rejects an array containing a non-string element', () => {
      const result = runSchema('exerciseWriteArrayFieldsSchema', {
        equipment: ['Barbell', 5],
      });
      expect(result.success).toBe(false);
    });

    it('lets unrelated fields through via passthrough', () => {
      const result = runSchema('exerciseWriteArrayFieldsSchema', {
        name: 'Bench Press',
        category: 'Strength',
        is_public: true,
      });
      expect(result).toEqual({
        success: true,
        data: { name: 'Bench Press', category: 'Strength', is_public: true },
      });
    });
  });

  it('round-trips the paginated response envelope', () => {
    const payload = {
      exercises: [],
      pagination: {
        page: 1,
        pageSize: 20,
        totalCount: 0,
        hasMore: false,
      },
    };
    const result = runSchema('paginatedExercisesResponseSchema', payload);
    expect(result).toEqual({ success: true, data: payload });
  });
});

// These rules are duplicated as a SQL CASE in the exercise_modality migration
// and as client-side fallbacks, so they are pinned here.
describe('deriveExerciseModality', () => {
  it('maps cardio categories to duration_distance regardless of case or padding', () => {
    expect(deriveExerciseModality('Cardio')).toBe('duration_distance');
    expect(deriveExerciseModality(' cardio ')).toBe('duration_distance');
  });

  it('maps both isometric spellings to duration', () => {
    expect(deriveExerciseModality('isometric')).toBe('duration');
    expect(deriveExerciseModality('Isometrics')).toBe('duration');
  });

  it('falls back to weight_reps for every other category', () => {
    expect(deriveExerciseModality('strength')).toBe('weight_reps');
    expect(deriveExerciseModality('custom')).toBe('weight_reps');
    expect(deriveExerciseModality('')).toBe('weight_reps');
    expect(deriveExerciseModality(null)).toBe('weight_reps');
    expect(deriveExerciseModality(undefined)).toBe('weight_reps');
  });
});
