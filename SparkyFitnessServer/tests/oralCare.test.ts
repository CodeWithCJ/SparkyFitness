import { describe, expect, it } from 'vitest';
import {
  computeOralCareStreak,
  oralCareSessionsCoveredBySync,
  summarizeOralCareDay,
  type OralCareSessionLike,
} from '@workspace/shared';

function session(
  id: string,
  overrides: Partial<OralCareSessionLike> = {}
): OralCareSessionLike {
  return {
    id,
    care_type: 'brushing',
    provider: 'manual',
    start_time: '2026-11-08T08:00:00.000Z',
    end_time: null,
    duration_seconds: null,
    ...overrides,
  };
}

const synced = (id: string, start: string, seconds = 125) =>
  session(id, {
    provider: 'HealthKit',
    start_time: start,
    end_time: new Date(Date.parse(start) + seconds * 1000).toISOString(),
    duration_seconds: seconds,
  });

const settings = { daily_target: 2, target_seconds: 120 };

describe('oralCareSessionsCoveredBySync', () => {
  it('marks a manual brush next to a synced brush as covered', () => {
    const covered = oralCareSessionsCoveredBySync([
      session('manual', { start_time: '2026-11-08T08:00:00.000Z' }),
      synced('oralb', '2026-11-08T08:03:00.000Z'),
    ]);
    expect([...covered]).toEqual(['manual']);
  });

  it('covers at 10 minutes apart but not past it', () => {
    // The manual brush ends at 08:02 (120 s); the synced one starts 10 minutes later.
    const manual = session('manual', {
      provider: 'timer',
      start_time: '2026-11-08T08:00:00.000Z',
      end_time: '2026-11-08T08:02:00.000Z',
      duration_seconds: 120,
    });
    expect(
      oralCareSessionsCoveredBySync([
        manual,
        synced('oralb', '2026-11-08T08:12:00.000Z'),
      ]).has('manual')
    ).toBe(true);
    expect(
      oralCareSessionsCoveredBySync([
        manual,
        synced('oralb', '2026-11-08T08:12:01.000Z'),
      ]).has('manual')
    ).toBe(false);
  });

  it('never covers one synced brush with another', () => {
    const covered = oralCareSessionsCoveredBySync([
      synced('a', '2026-11-08T08:00:00.000Z'),
      synced('b', '2026-11-08T08:05:00.000Z'),
    ]);
    expect(covered.size).toBe(0);
  });

  it('lets one synced brush cover only the nearest manual brush', () => {
    const covered = oralCareSessionsCoveredBySync([
      session('early', { start_time: '2026-11-08T07:55:00.000Z' }),
      session('close', { start_time: '2026-11-08T08:01:00.000Z' }),
      synced('oralb', '2026-11-08T08:02:00.000Z'),
    ]);
    expect([...covered]).toEqual(['close']);
  });

  it('ignores flossing and sessions without a start time', () => {
    const covered = oralCareSessionsCoveredBySync([
      session('floss', { care_type: 'flossing' }),
      session('untimed', { start_time: null }),
      synced('oralb', '2026-11-08T08:01:00.000Z'),
    ]);
    expect(covered.size).toBe(0);
  });
});

describe('summarizeOralCareDay', () => {
  it('counts a manual and synced pair once with the synced duration', () => {
    const totals = summarizeOralCareDay(
      [
        session('manual', { duration_seconds: 60 }),
        synced('oralb', '2026-11-08T08:01:00.000Z', 130),
        session('evening', { start_time: '2026-11-08T21:00:00.000Z' }),
        session('floss', { care_type: 'flossing' }),
        session('irrigator', { care_type: 'other' }),
      ],
      settings
    );
    expect(totals).toEqual({
      brushing_count: 2,
      brushing_seconds: 130,
      brushes_at_target: 1,
      goal_met: true,
      counts_by_type: {
        brushing: 2,
        flossing: 1,
        mouthwash: 0,
        tongue_cleaning: 0,
        other: 1,
      },
    });
  });

  it('counts a brush without a duration toward the goal', () => {
    const totals = summarizeOralCareDay(
      [session('a', { start_time: null }), session('b', { start_time: null })],
      settings
    );
    expect(totals.goal_met).toBe(true);
    expect(totals.brushes_at_target).toBe(0);
  });
});

describe('computeOralCareStreak', () => {
  const days = (entries: [string, number][]) => new Map(entries);

  it('does not break the streak on a day that is still open', () => {
    const result = computeOralCareStreak(
      days([
        ['2026-11-06', 2],
        ['2026-11-07', 2],
        ['2026-11-08', 1],
      ]),
      2,
      '2026-11-08'
    );
    expect(result.current).toBe(2);
  });

  it('includes today once its goal is met', () => {
    const result = computeOralCareStreak(
      days([
        ['2026-11-07', 2],
        ['2026-11-08', 3],
      ]),
      2,
      '2026-11-08'
    );
    expect(result.current).toBe(2);
  });

  it('stops at a missed day and reports the best run', () => {
    const result = computeOralCareStreak(
      days([
        ['2026-10-30', 2],
        ['2026-10-31', 2],
        ['2026-11-01', 2],
        ['2026-11-02', 1],
        ['2026-11-07', 2],
      ]),
      2,
      '2026-11-08'
    );
    expect(result).toEqual({ current: 1, best: 3 });
  });

  it('treats a day with no entry as missed', () => {
    const result = computeOralCareStreak(
      days([
        ['2026-11-05', 1],
        ['2026-11-07', 1],
      ]),
      1,
      '2026-11-08'
    );
    expect(result).toEqual({ current: 1, best: 1 });
  });

  it.each([1, 2, 3])('uses the daily target of %i', (target) => {
    const result = computeOralCareStreak(
      days([
        ['2026-11-07', 2],
        ['2026-11-08', 2],
      ]),
      target,
      '2026-11-08'
    );
    expect(result.current).toBe(target <= 2 ? 2 : 0);
  });
});
