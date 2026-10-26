import { vi, beforeEach, describe, expect, it } from 'vitest';
import {
  CALORIE_LINK_MATCH_SLACK_MS,
  distributeCountedCalories,
  isAppLoggedWorkoutSource,
  matchCalorieLink,
  resolveLinkedCalories,
} from '@workspace/shared';
import { getClient } from '../db/poolManager.js';
import {
  clearCalorieLink,
  clearCalorieLinkOfEntryWithClient,
  clearCalorieLinksOfEntriesWithClient,
  getCalorieLinkSuggestions,
  reapplyCalorieLinkWithClient,
  setCalorieLink,
} from '../services/exerciseCalorieLinkService.js';

vi.mock('../db/poolManager', () => ({ getClient: vi.fn() }));
vi.mock('../utils/timezoneLoader', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

describe('resolveLinkedCalories', () => {
  const base = { manualTotal: 475, syncedTotal: 425 };

  it('counts one side and zeroes the other', () => {
    expect(
      resolveLinkedCalories({ ...base, resolution: 'sparkyfitness' })
    ).toEqual({
      manualCounted: null,
      syncedCounted: 0,
    });
    expect(resolveLinkedCalories({ ...base, resolution: 'synced' })).toEqual({
      manualCounted: 0,
      syncedCounted: null,
    });
  });

  it('picks the higher or lower estimate', () => {
    expect(resolveLinkedCalories({ ...base, resolution: 'higher' })).toEqual({
      manualCounted: null,
      syncedCounted: 0,
    });
    expect(resolveLinkedCalories({ ...base, resolution: 'lower' })).toEqual({
      manualCounted: 0,
      syncedCounted: null,
    });
  });

  it('averages and accepts a custom total on the SparkyFitness side', () => {
    expect(resolveLinkedCalories({ ...base, resolution: 'average' })).toEqual({
      manualCounted: 450,
      syncedCounted: 0,
    });
    expect(
      resolveLinkedCalories({
        ...base,
        resolution: 'custom',
        customCalories: 430.26,
      })
    ).toEqual({ manualCounted: 430.3, syncedCounted: 0 });
  });
});

describe('distributeCountedCalories', () => {
  it('splits in proportion to the estimates and adds back up', () => {
    const parts = distributeCountedCalories([300, 100, 100], 450);
    expect(parts).toEqual([270, 90, 90]);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(450, 5);
  });

  it('settles rounding on the largest share', () => {
    const parts = distributeCountedCalories([1, 1, 1], 100);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
  });

  it('splits equally when every estimate is 0, and gives 0 for 0', () => {
    expect(distributeCountedCalories([0, 0], 10)).toEqual([5, 5]);
    expect(distributeCountedCalories([300, 100], 0)).toEqual([0, 0]);
  });
});

describe('matchCalorieLink', () => {
  const synced = { startMs: 1_000_000_000, endMs: 1_000_000_000 + 3_600_000 };
  const inside = synced.startMs + 600_000;

  it('matches when every set time falls in the window, with slack', () => {
    expect(
      matchCalorieLink(
        { setTimesMs: [inside, inside + 60_000], window: null },
        synced
      )
    ).toBe('sets_within');
    expect(
      matchCalorieLink(
        {
          setTimesMs: [synced.startMs - CALORIE_LINK_MATCH_SLACK_MS],
          window: null,
        },
        synced
      )
    ).toBe('sets_within');
  });

  it('does not match when a set time is outside, whatever the entry window says', () => {
    expect(
      matchCalorieLink(
        { setTimesMs: [inside, synced.endMs + 3_600_000], window: synced },
        synced
      )
    ).toBeNull();
  });

  it('falls back to window overlap when there are no set times', () => {
    expect(
      matchCalorieLink(
        { setTimesMs: [], window: { startMs: inside, endMs: inside + 1000 } },
        synced
      )
    ).toBe('overlap');
    expect(
      matchCalorieLink(
        {
          setTimesMs: [],
          window: {
            startMs: synced.endMs + 7_200_000,
            endMs: synced.endMs + 8_000_000,
          },
        },
        synced
      )
    ).toBeNull();
  });

  it('has no opinion without a synced window or any times', () => {
    expect(
      matchCalorieLink({ setTimesMs: [inside], window: null }, null)
    ).toBeNull();
    expect(
      matchCalorieLink({ setTimesMs: [], window: null }, synced)
    ).toBeNull();
  });
});

type Row = Record<string, unknown>;
const manualRow = (over: Row = {}): Row => ({
  id: 'm1',
  entry_date: '2026-10-23',
  entry_time: '10:00:00',
  record_timezone: null,
  duration_minutes: 50,
  elapsed_time_seconds: null,
  calories_burned: 475,
  calorie_link_id: null,
  calorie_link_resolution: null,
  source: 'manual',
  exercise_name: 'Bench Press',
  ...over,
});
const syncedRow = (over: Row = {}): Row => ({
  ...manualRow(),
  id: 's1',
  entry_time: '09:55:00',
  duration_minutes: 60,
  calories_burned: 425,
  source: 'Garmin',
  source_id: 'g-1',
  exercise_name: 'Other workout',
  ...over,
});

const client = { query: vi.fn(), release: vi.fn() };
const answer = (rules: Array<[RegExp, Row[]]>) =>
  client.query.mockImplementation(async (sql: string) => {
    const hit = rules.find(([re]) => re.test(String(sql)));
    return { rows: hit ? hit[1] : [] };
  });
const updates = () =>
  client.query.mock.calls.filter(([sql]) =>
    /^\s*UPDATE exercise_entries/.test(String(sql))
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue(client as never);
});

describe('getCalorieLinkSuggestions', () => {
  it('ranks a candidate whose window holds every set time first', async () => {
    const at = new Date('2026-10-23T10:20:00Z');
    answer([
      [/FROM exercise_entry_sets/, [{ completed_at: at }]],
      [
        /NOT IN \('manual', 'sparky'\)/,
        [
          syncedRow({
            id: 's-early',
            entry_time: '06:00:00',
            duration_minutes: 30,
          }),
          syncedRow({ id: 's-match' }),
        ],
      ],
      [/WHERE user_id = \$2/, [manualRow()]],
    ]);

    const result = await getCalorieLinkSuggestions('u1', 'u1', 'm1');

    expect(result.manual_total_calories).toBe(475);
    expect(result.link).toBeNull();
    expect(result.candidates.map((c) => [c.id, c.match])).toEqual([
      ['s-match', 'sets_within'],
      ['s-early', null],
    ]);
    expect(result.candidates[0]).toMatchObject({
      start_time: '09:55',
      source: 'Garmin',
    });
  });

  it('refuses a synced entry as the anchor', async () => {
    answer([[/WHERE user_id = \$2/, [syncedRow()]]]);
    await expect(
      getCalorieLinkSuggestions('u1', 'u1', 's1')
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it('is a 404 for an entry that is not there', async () => {
    answer([]);
    await expect(
      getCalorieLinkSuggestions('u1', 'u1', 'nope')
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('setCalorieLink', () => {
  const body = (resolution: string, extra: Row = {}) =>
    ({ synced_entry_id: 's1', resolution, ...extra }) as never;

  it('counts the SparkyFitness estimate and zeroes the synced side', async () => {
    answer([
      [/id = \$1 AND user_id = \$2 FOR UPDATE/, [syncedRow()]],
      [/WHERE user_id = \$2/, [manualRow()]],
    ]);

    const result = await setCalorieLink(
      'u1',
      'u1',
      'm1',
      body('sparkyfitness')
    );
    expect(result).toEqual({
      applied: [{ entry_id: 'm1', calories_applied: null }],
    });

    const calls = updates();
    expect(calls).toHaveLength(2);
    // [entry id, user, applied, link id, resolution]
    expect(calls[0]![1]).toEqual([
      'm1',
      'u1',
      null,
      expect.any(String),
      'sparkyfitness',
    ]);
    expect(calls[1]![1]).toEqual([
      's1',
      'u1',
      0,
      calls[0]![1][3],
      'sparkyfitness',
    ]);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('spreads an averaged total over a strength session', async () => {
    answer([
      [/id = \$1 AND user_id = \$2 FOR UPDATE/, [syncedRow()]],
      [
        /WHERE user_id = \$2/,
        [
          manualRow({ id: 'a', calories_burned: 300 }),
          manualRow({ id: 'b', calories_burned: 175 }),
        ],
      ],
    ]);

    await setCalorieLink('u1', 'u1', 'a', body('average'));

    const calls = updates();
    expect(calls.map((c) => [c[1][0], c[1][2]])).toEqual([
      ['a', 284.2],
      ['b', 165.8],
      ['s1', 0],
    ]);
  });

  it('clears the earlier link of the workout before relinking', async () => {
    answer([
      [/id = \$1 AND user_id = \$2 FOR UPDATE/, [syncedRow()]],
      [
        /WHERE user_id = \$2/,
        [
          manualRow({
            calorie_link_id: 'old',
            calorie_link_resolution: 'synced',
          }),
        ],
      ],
    ]);

    await setCalorieLink('u1', 'u1', 'm1', body('lower'));

    expect(updates()[0]![1]).toEqual(['u1', 'old']);
  });

  it.each([
    ['a manual entry', syncedRow({ source: 'manual' }), 400],
    ['an entry with no source_id', syncedRow({ source_id: null }), 400],
    [
      'one linked to another workout',
      syncedRow({ calorie_link_id: 'other' }),
      409,
    ],
  ])('refuses %s and rolls back', async (_name, row, status) => {
    answer([
      [/id = \$1 AND user_id = \$2 FOR UPDATE/, [row as Row]],
      [/WHERE user_id = \$2/, [manualRow()]],
    ]);

    await expect(
      setCalorieLink('u1', 'u1', 'm1', body('synced'))
    ).rejects.toMatchObject({
      status,
    });
    expect(updates()).toHaveLength(0);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});

describe('clearCalorieLink', () => {
  it('resets both sides through the shared link id', async () => {
    answer([
      [
        /WHERE user_id = \$2/,
        [
          manualRow({
            calorie_link_id: 'link-1',
            calorie_link_resolution: 'higher',
          }),
        ],
      ],
    ]);

    await clearCalorieLink('u1', 'u1', 'm1');

    const calls = updates();
    expect(calls).toHaveLength(1);
    expect(String(calls[0]![0])).toContain('calories_applied = NULL');
    expect(calls[0]![1]).toEqual(['u1', 'link-1']);
  });

  it('is a 404 when the workout is not linked', async () => {
    answer([[/WHERE user_id = \$2/, [manualRow()]]]);
    await expect(clearCalorieLink('u1', 'u1', 'm1')).rejects.toMatchObject({
      status: 404,
    });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
});

describe('reapplyCalorieLinkWithClient', () => {
  const fakeClient = (rows: Row[]) => {
    const calls: unknown[][] = [];
    return {
      calls,
      client: {
        query: vi.fn(async (sql: string, params?: unknown[]) => {
          calls.push([String(sql), params]);
          return String(sql).includes('SELECT') ? { rows } : { rows: [] };
        }),
      },
    };
  };

  it('recomputes both sides from the stored resolution after estimates change', async () => {
    const { client: fake, calls } = fakeClient([
      {
        id: 'a',
        source: 'manual',
        calories_burned: 200,
        calories_applied: 100,
        calorie_link_resolution: 'average',
      },
      {
        id: 'b',
        source: 'manual',
        calories_burned: 200,
        calories_applied: 100,
        calorie_link_resolution: 'average',
      },
      {
        id: 's1',
        source: 'Garmin',
        calories_burned: 500,
        calories_applied: 0,
        calorie_link_resolution: 'average',
      },
    ]);

    await reapplyCalorieLinkWithClient(fake as never, 'u1', 'link-1');

    const writes = calls.filter(([sql]) =>
      String(sql).trimStart().startsWith('UPDATE')
    );
    expect(writes.map((call) => call[1])).toEqual([
      ['a', 'u1', 225],
      ['b', 'u1', 225],
      ['s1', 'u1', 0],
    ]);
  });

  it('keeps a custom total and redistributes it across the new estimates', async () => {
    const { client: fake, calls } = fakeClient([
      {
        id: 'a',
        source: 'manual',
        calories_burned: 100,
        calories_applied: 90,
        calorie_link_resolution: 'custom',
      },
      {
        id: 'b',
        source: 'manual',
        calories_burned: 100,
        calories_applied: 30,
        calorie_link_resolution: 'custom',
      },
      {
        id: 's1',
        source: 'Garmin',
        calories_burned: 400,
        calories_applied: 0,
        calorie_link_resolution: 'custom',
      },
    ]);

    await reapplyCalorieLinkWithClient(fake as never, 'u1', 'link-1');

    const writes = calls.filter(([sql]) =>
      String(sql).trimStart().startsWith('UPDATE')
    );
    expect(writes.map((call) => call[1])).toEqual([
      ['a', 'u1', 60],
      ['b', 'u1', 60],
      ['s1', 'u1', 0],
    ]);
  });
});

describe('clearCalorieLinkOfEntryWithClient', () => {
  it('clears every row that shares the entry link before that entry is deleted', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({
      rows: [],
    }));
    await clearCalorieLinkOfEntryWithClient({ query } as never, 'u1', 'm1');
    expect(String(query.mock.calls[0]![0])).toContain(
      'calories_applied = NULL'
    );
    expect(query.mock.calls[0]![1]).toEqual(['u1', 'm1']);
  });
});

describe('clearCalorieLinksOfEntriesWithClient', () => {
  it('clears every link touched by a bulk delete', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({
      rows: [],
    }));
    await clearCalorieLinksOfEntriesWithClient({ query } as never, 'u1', [
      's1',
      's2',
    ]);
    expect(String(query.mock.calls[0]![0])).toContain(
      'calories_applied = NULL'
    );
    expect(query.mock.calls[0]![1]).toEqual(['u1', ['s1', 's2']]);
  });
});

describe('isAppLoggedWorkoutSource', () => {
  it('treats manual and in-app workout flow entries as app-logged', () => {
    expect(isAppLoggedWorkoutSource('manual')).toBe(true);
    expect(isAppLoggedWorkoutSource('Sparky')).toBe(true);
    expect(isAppLoggedWorkoutSource(null)).toBe(true);
    expect(isAppLoggedWorkoutSource('')).toBe(true);
  });

  it('rejects provider-synced sources', () => {
    expect(isAppLoggedWorkoutSource('HealthKit')).toBe(false);
    expect(isAppLoggedWorkoutSource('garmin')).toBe(false);
  });
});
