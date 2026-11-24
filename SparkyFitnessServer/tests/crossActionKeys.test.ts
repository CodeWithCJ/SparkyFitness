import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { addDays } from '@workspace/shared';
import {
  acceptedActionKeys,
  changedKeys,
  dropTodayDates,
  formatActionZodError,
  rangeToWindow,
  windowToRange,
} from '../ai/tools/crossActionKeys.js';

// Pinned so a run that straddles midnight cannot flake.
const NOW = new Date('2026-06-15T12:00:00Z');
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});
const today = '2026-06-15';

const union = z.discriminatedUnion('action', [
  z.object({ action: z.literal('a') }).strict(),
  z
    .object({ action: z.literal('b'), window_days: z.number().optional() })
    .strict(),
]);

describe('acceptedActionKeys', () => {
  it('lists the keys an action accepts besides action', () => {
    expect(acceptedActionKeys(union, 'a')).toEqual([]);
    expect(acceptedActionKeys(union, 'b')).toEqual(['window_days']);
  });

  it('returns null for an unknown action', () => {
    expect(acceptedActionKeys(union, 'zzz')).toBeNull();
  });

  it('returns null rather than throwing for an option without a shape', () => {
    expect(acceptedActionKeys({ options: [z.string()] }, 'a')).toBeNull();
  });
});

describe('formatActionZodError', () => {
  it('adds the accepted keys only for unrecognized-key errors', () => {
    const stray = union.safeParse({ action: 'b', date: today });
    expect(stray.success).toBe(false);
    expect(formatActionZodError(stray.error!, union, 'b', 'UTC')).toContain(
      "Suggestion: Action 'b' accepts only: window_days."
    );
    // A rejected date key also tells the model the user's day.
    expect(formatActionZodError(stray.error!, union, 'b', 'UTC')).toContain(
      "Today is 2026-06-15 in the user's timezone."
    );
    // Never a bare "drop the keys": that could turn a ranged question into
    // an all-time answer.
    expect(formatActionZodError(stray.error!, union, 'b', 'UTC')).toContain(
      'only if the answer still fits what the user asked'
    );

    const wrongType = union.safeParse({ action: 'b', window_days: 'x' });
    expect(
      formatActionZodError(wrongType.error!, union, 'b', 'UTC')
    ).not.toContain('Suggestion');
  });

  it('falls back to the plain error for an unknown action', () => {
    const bad = union.safeParse({ action: 'zzz' });
    expect(formatActionZodError(bad.error!, union, 'zzz', 'UTC')).not.toContain(
      'Suggestion'
    );
  });
});

describe('dropTodayDates', () => {
  it('drops only keys equal to today', () => {
    const args: Record<string, unknown> = {
      date: today,
      end_date: addDays(today, -1),
    };
    dropTodayDates(args, ['date', 'end_date'], 'UTC');
    expect(args).toEqual({ end_date: addDays(today, -1) });
  });
});

describe('rangeToWindow', () => {
  const bounds = { min: 7, max: 90 };

  it('turns a range ending today into a window', () => {
    const args: Record<string, unknown> = {
      start_date: addDays(today, -13),
      end_date: today,
    };
    rangeToWindow(args, 'UTC', bounds);
    expect(args).toEqual({ window_days: 14 });
  });

  it('treats a missing end_date as today', () => {
    const args: Record<string, unknown> = { start_date: addDays(today, -6) };
    rangeToWindow(args, 'UTC', bounds);
    expect(args).toEqual({ window_days: 7 });
  });

  it('drops an end_date of today given alone', () => {
    const args: Record<string, unknown> = { end_date: today, window_days: 30 };
    rangeToWindow(args, 'UTC', bounds);
    expect(args).toEqual({ window_days: 30 });
  });

  it('leaves a range outside the allowed window untouched', () => {
    const args = { start_date: addDays(today, -1), end_date: today };
    rangeToWindow(args, 'UTC', bounds);
    expect(args).toEqual({ start_date: addDays(today, -1), end_date: today });
  });

  it('leaves an impossible calendar date untouched', () => {
    for (const start of ['2026-13-45', '2026-02-31']) {
      const args = { start_date: start, end_date: today };
      rangeToWindow(args, 'UTC', bounds);
      expect(args).toEqual({ start_date: start, end_date: today });
    }
  });

  it('uses the user timezone for today', () => {
    // 12:00 UTC is already the next day in Kiritimati (UTC+14).
    const args: Record<string, unknown> = {
      start_date: '2026-06-03',
      end_date: '2026-06-16',
    };
    rangeToWindow(args, 'Pacific/Kiritimati', bounds);
    expect(args).toEqual({ window_days: 14 });
  });

  it('leaves a range that does not end today untouched', () => {
    const args = {
      start_date: addDays(today, -20),
      end_date: addDays(today, -1),
    };
    rangeToWindow(args, 'UTC', bounds);
    expect(args.start_date).toBe(addDays(today, -20));
  });

  it('leaves a range that disagrees with window_days untouched', () => {
    const args = {
      start_date: addDays(today, -27),
      end_date: today,
      window_days: 7,
    };
    rangeToWindow(args, 'UTC', bounds);
    expect(args).toHaveProperty('start_date');
  });
});

describe('windowToRange', () => {
  it('turns a window into a range ending today', () => {
    const args: Record<string, unknown> = { window_days: 30 };
    windowToRange(args, 'UTC');
    expect(args).toEqual({ start_date: addDays(today, -29), end_date: today });
  });

  it('drops a window that matches the given range', () => {
    const args: Record<string, unknown> = {
      window_days: 7,
      start_date: addDays(today, -6),
      end_date: today,
    };
    windowToRange(args, 'UTC');
    expect(args).not.toHaveProperty('window_days');
  });

  it('treats a missing end_date as today', () => {
    const args: Record<string, unknown> = {
      window_days: 7,
      start_date: addDays(today, -6),
    };
    windowToRange(args, 'UTC');
    expect(args).toEqual({ start_date: addDays(today, -6) });
  });

  it('leaves a huge window for validation instead of expanding it', () => {
    const args = { window_days: 1_000_000 };
    windowToRange(args, 'UTC');
    expect(args).toEqual({ window_days: 1_000_000 });
  });

  it('leaves a window that disagrees with the range, or is not a whole number', () => {
    const disagrees = { window_days: 7, start_date: addDays(today, -29) };
    windowToRange(disagrees, 'UTC');
    expect(disagrees).toHaveProperty('window_days');

    const fractional = { window_days: 2.5 };
    windowToRange(fractional, 'UTC');
    expect(fractional).toEqual({ window_days: 2.5 });
  });
});

describe('changedKeys', () => {
  it('names added, removed and changed keys without their values', () => {
    expect(
      changedKeys(
        { action: 'x', window_days: 30, search_keyword: 'run' },
        { action: 'x', start_date: '2026-05-17', search_keyword: 'run' }
      )
    ).toEqual(['window_days', 'start_date']);
  });
});
