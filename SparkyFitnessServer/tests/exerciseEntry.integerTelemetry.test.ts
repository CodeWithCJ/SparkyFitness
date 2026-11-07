import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import exerciseEntryDb, {
  EXERCISE_ENTRY_INTEGER_TELEMETRY_COLUMNS,
  EXERCISE_ENTRY_TELEMETRY_COLUMNS,
  telemetryValueFor,
} from '../models/exerciseEntry.js';
import * as poolManager from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

// HealthKit sums stroke samples into doubles; this is the value from a real
// iOS history import that Postgres rejected as "invalid input syntax for type
// integer", failing the whole chunk.
const HEALTHKIT_STROKES = 120.99894867182387;

describe('integer telemetry columns', () => {
  it('match the integer and smallint telemetry columns in the schema', () => {
    const schema = readFileSync(
      new URL('../../db_schema_backup.sql', import.meta.url),
      'utf8'
    );
    const table = schema.match(
      /CREATE TABLE public\.exercise_entries \(([\s\S]*?)\n\);/
    );
    expect(table).not.toBeNull();
    const integerColumns = [
      ...table![1].matchAll(/^\s+([a-z_0-9]+) (?:integer|smallint|bigint)\b/gm),
    ].map((m) => m[1]);
    const expected = EXERCISE_ENTRY_TELEMETRY_COLUMNS.filter((c) =>
      integerColumns.includes(c)
    );
    expect([...EXERCISE_ENTRY_INTEGER_TELEMETRY_COLUMNS].sort()).toEqual(
      [...expected].sort()
    );
  });

  it('rounds fractional values only for integer columns', () => {
    expect(telemetryValueFor('stroke_count', HEALTHKIT_STROKES)).toBe(121);
    expect(telemetryValueFor('moving_time_seconds', '3600.6')).toBe(3601);
    expect(telemetryValueFor('avg_speed_mps', 5.57)).toBe(5.57);
    expect(telemetryValueFor('stroke_count', null)).toBeNull();
    expect(telemetryValueFor('stroke_count', undefined)).toBeNull();
    // Number('') is 0; an empty string must not become a zero stroke count.
    expect(telemetryValueFor('stroke_count', '')).toBe('');
    expect(telemetryValueFor('gear_name', 'bike')).toBe('bike');
  });
});

describe('exercise entry writes with fractional integer telemetry', () => {
  const mockClient = { query: vi.fn(), release: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(poolManager.getClient).mockResolvedValue(
      mockClient as unknown as Awaited<ReturnType<typeof poolManager.getClient>>
    );
    mockClient.query.mockImplementation((sql: string) => {
      if (/FROM exercises WHERE id/i.test(sql)) {
        return { rows: [{ name: 'Swimming', category: 'cardio' }] };
      }
      if (/INSERT INTO exercise_entries/i.test(sql)) {
        return { rows: [{ id: 'entry-1' }] };
      }
      if (/FROM exercise_entries/i.test(sql)) {
        return { rows: [{ id: 'entry-1', stroke_count: 121 }] };
      }
      return { rows: [] };
    });
  });

  it('inserts a rounded stroke_count', async () => {
    await expect(
      exerciseEntryDb.createExerciseEntry(
        'user-1',
        {
          exercise_id: 'ex-1',
          entry_date: '2020-07-12',
          duration_minutes: 40,
          stroke_count: HEALTHKIT_STROKES,
        },
        'user-1',
        'HealthKit',
        null,
        { skipDuplicateCheck: true }
      )
    ).resolves.toBeDefined();
    const statements = mockClient.query.mock.calls.map(([sql]) =>
      String(sql).trim()
    );
    expect(statements).toContain('COMMIT');
    expect(statements).not.toContain('ROLLBACK');

    const insert = mockClient.query.mock.calls.find(([sql]) =>
      /INSERT INTO exercise_entries/i.test(String(sql))
    );
    expect(insert).toBeDefined();
    const columns = (insert![0] as string)
      .match(/INSERT INTO exercise_entries \(([^)]*)\)/i)![1]
      .split(',')
      .map((c) => c.trim());
    expect(insert![1][columns.indexOf('stroke_count')]).toBe(121);
  });

  it('writes a rounded stroke_count in the telemetry-only update', async () => {
    const client = { query: vi.fn() };
    await exerciseEntryDb._updateExerciseEntryTelemetryOnlyWithClient(
      client,
      'entry-1',
      'user-1',
      { stroke_count: HEALTHKIT_STROKES, avg_speed_mps: 1.2 }
    );
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain('stroke_count = $2');
    expect(params).toEqual([1.2, 121, 'entry-1', 'user-1']);
  });
});
