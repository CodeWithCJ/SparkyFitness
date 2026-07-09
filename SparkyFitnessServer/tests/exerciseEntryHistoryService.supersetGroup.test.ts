import { vi, beforeEach, describe, expect, it } from 'vitest';
import { getGroupedExerciseSessionByIdWithClient } from '../services/exerciseEntryHistoryService.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const PRESET_ENTRY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = '99999999-9999-4999-8999-999999999999';
const EXERCISE_ID = '11111111-1111-4111-8111-111111111111';

function makeChildRow(
  id: string,
  sortOrder: number,
  supersetGroup: number | null | undefined
) {
  const row: Record<string, unknown> = {
    id,
    user_id: USER_ID,
    exercise_id: EXERCISE_ID,
    duration_minutes: 10,
    calories_burned: 50,
    entry_date: '2026-03-12',
    notes: null,
    distance: null,
    avg_heart_rate: null,
    steps: null,
    source: 'manual',
    image_url: null,
    exercise_preset_entry_id: PRESET_ENTRY_ID,
    sort_order: sortOrder,
    created_at: '2026-03-12T10:00:00Z',
    exercise_name: 'Bench Press',
    category: 'Strength',
    images: null,
    primary_muscles: null,
    secondary_muscles: null,
    equipment: null,
    instructions: null,
    force: null,
    level: null,
    mechanic: null,
    sets: [],
  };
  if (supersetGroup !== undefined) {
    row.superset_group = supersetGroup;
  }
  return row;
}

function makeClient(childRows: Record<string, unknown>[]) {
  return {
    query: vi.fn((sql: string) => {
      if (/FROM exercise_preset_entries/.test(sql)) {
        return Promise.resolve({
          rows: [
            {
              id: PRESET_ENTRY_ID,
              workout_preset_id: null,
              name: 'Superset Day',
              description: null,
              notes: null,
              source: 'manual',
              entry_date: '2026-03-12',
            },
          ],
        });
      }
      if (/FROM exercise_entries ee/.test(sql)) {
        return Promise.resolve({ rows: childRows });
      }
      return Promise.resolve({ rows: [] });
    }),
  };
}

describe('getGroupedExerciseSessionByIdWithClient superset_group', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('surfaces superset_group values and passes the strict response parse', async () => {
    const client = makeClient([
      makeChildRow('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 0, 1),
      makeChildRow('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1, 1),
      makeChildRow('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 2, null),
    ]);

    // The function ends in a presetSessionResponseSchema.parse, so a
    // resolved value proves the strict schema accepts the built response.
    const session = await getGroupedExerciseSessionByIdWithClient(
      client,
      USER_ID,
      PRESET_ENTRY_ID
    );

    expect(session).not.toBeNull();
    expect(session!.exercises.map((e) => e.superset_group)).toEqual([
      1,
      1,
      null,
    ]);
  });

  it('maps rows without the column to superset_group null', async () => {
    const client = makeClient([
      makeChildRow('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 0, undefined),
    ]);

    const session = await getGroupedExerciseSessionByIdWithClient(
      client,
      USER_ID,
      PRESET_ENTRY_ID
    );

    expect(session!.exercises[0].superset_group).toBeNull();
  });
});
