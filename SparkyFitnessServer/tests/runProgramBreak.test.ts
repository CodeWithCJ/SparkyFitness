import { describe, expect, it } from 'vitest';
import { suggestFromBreak, suggestFromLoad } from '@workspace/shared';

const base = { lastDoneDay: '2026-09-01', next: 5, total: 27 };

describe('suggestFromBreak', () => {
  it('stays quiet for a short break', () => {
    expect(suggestFromBreak({ ...base, today: '2026-09-14' })).toBeNull();
  });

  it('eases two workouts after two weeks', () => {
    expect(suggestFromBreak({ ...base, today: '2026-09-15' })).toEqual({
      daysAway: 14,
      percent: -15,
      count: 2,
    });
  });

  it('eases three workouts after four weeks', () => {
    expect(suggestFromBreak({ ...base, today: '2026-09-29' })).toEqual({
      daysAway: 28,
      percent: -25,
      count: 3,
    });
  });

  it('does nothing before the first workout or after the last', () => {
    expect(
      suggestFromBreak({ ...base, next: 0, today: '2026-10-30' })
    ).toBeNull();
    expect(
      suggestFromBreak({ ...base, next: 27, today: '2026-10-30' })
    ).toBeNull();
    expect(
      suggestFromBreak({ ...base, lastDoneDay: null, today: '2026-10-30' })
    ).toBeNull();
  });

  it('is not offered again once the plan was changed after the last workout', () => {
    expect(
      suggestFromBreak({
        ...base,
        today: '2026-10-01',
        lastAdjustedDay: '2026-09-20',
      })
    ).toBeNull();
    expect(
      suggestFromBreak({
        ...base,
        today: '2026-10-01',
        lastAdjustedDay: '2026-08-30',
      })
    ).not.toBeNull();
  });

  it('counts a change made the same local day as the last workout', () => {
    expect(
      suggestFromBreak({
        ...base,
        today: '2026-10-01',
        lastAdjustedDay: base.lastDoneDay,
      })
    ).toBeNull();
  });
});

describe('suggestFromLoad', () => {
  const NOW = Date.parse('2026-10-13T12:00:00Z');
  const base = { status: 'spike' as const, next: 5, total: 27, nowMs: NOW };

  it('offers to ease two workouts after a load spike', () => {
    expect(suggestFromLoad(base)).toEqual({ percent: -15, count: 2 });
  });

  it('stays quiet for every other status', () => {
    for (const status of [
      'noData',
      'learning',
      'low',
      'steady',
      'high',
    ] as const) {
      expect(suggestFromLoad({ ...base, status })).toBeNull();
    }
  });

  it('does not offer before the first workout or after the last', () => {
    expect(suggestFromLoad({ ...base, next: 0 })).toBeNull();
    expect(suggestFromLoad({ ...base, next: 27 })).toBeNull();
  });

  it('waits three days after the plan was changed', () => {
    expect(
      suggestFromLoad({ ...base, lastAdjustedAt: '2026-10-11T13:00:00Z' })
    ).toBeNull();
    expect(
      suggestFromLoad({ ...base, lastAdjustedAt: '2026-10-10T11:00:00Z' })
    ).not.toBeNull();
  });
});
