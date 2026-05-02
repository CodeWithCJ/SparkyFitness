import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

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
    };
    const result = runSchema('exerciseLibraryItemSchema', item);
    expect(result).toEqual({ success: true, data: item });
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
