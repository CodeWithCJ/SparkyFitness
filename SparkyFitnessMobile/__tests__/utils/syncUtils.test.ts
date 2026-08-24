import {
  getSyncStartDate,
  alignToLocalDayStart,
  ceilToLocalDayStart,
  addLocalDays,
  countLocalDays,
  buildForegroundWindows,
  buildBackgroundWindows,
  buildBackfillWindows,
  enumerateDayAlignedWindows,
  SESSION_OVERLAP_MS,
  MAX_BACKGROUND_LOOKBACK_DAYS,
  SyncDuration,
} from '../../src/utils/syncUtils';

describe('alignToLocalDayStart', () => {
  test('rounds down to local midnight without mutating the input', () => {
    const input = new Date(2026, 6, 2, 15, 30, 45, 123);
    const aligned = alignToLocalDayStart(input);

    expect(aligned).toEqual(new Date(2026, 6, 2, 0, 0, 0, 0));
    expect(input.getHours()).toBe(15);
  });
});

describe('ceilToLocalDayStart', () => {
  test('rounds a mid-day instant up to the next local midnight', () => {
    const input = new Date(2026, 6, 2, 15, 30, 45, 123);
    expect(ceilToLocalDayStart(input)).toEqual(new Date(2026, 6, 3, 0, 0, 0, 0));
    expect(input.getHours()).toBe(15);
  });

  test('leaves a midnight-aligned instant unchanged', () => {
    expect(ceilToLocalDayStart(new Date(2026, 6, 2, 0, 0, 0, 0))).toEqual(
      new Date(2026, 6, 2, 0, 0, 0, 0),
    );
  });
});

describe('addLocalDays', () => {
  test('adds calendar days without mutating the input', () => {
    const input = new Date(2026, 6, 2, 15, 30, 0);
    const result = addLocalDays(input, 3);

    expect(result).toEqual(new Date(2026, 6, 5, 15, 30, 0));
    expect(input.getDate()).toBe(2);
  });

  test('supports negative day counts across month boundaries', () => {
    expect(addLocalDays(new Date(2026, 6, 2, 0, 0, 0, 0), -30)).toEqual(new Date(2026, 5, 2, 0, 0, 0, 0));
  });
});

describe('countLocalDays', () => {
  test('counts calendar days in [start, end)', () => {
    expect(countLocalDays(new Date(2026, 6, 1), new Date(2026, 6, 31))).toBe(30);
  });

  test('returns 0 for an empty or inverted span', () => {
    const day = new Date(2026, 6, 1);
    expect(countLocalDays(day, day)).toBe(0);
    expect(countLocalDays(new Date(2026, 6, 5), new Date(2026, 6, 1))).toBe(0);
  });

  test('aligns non-midnight inputs before counting', () => {
    expect(countLocalDays(new Date(2026, 6, 1, 15, 30), new Date(2026, 6, 3, 2, 0))).toBe(2);
  });
});

describe('buildBackfillWindows', () => {
  test('uses the same edges for session and aggregated reads', () => {
    const start = new Date(2026, 5, 3, 0, 0, 0, 0);
    const end = new Date(2026, 6, 3, 0, 0, 0, 0);

    const windows = buildBackfillWindows(start, end);

    expect(windows.sessionStart).toBe(start);
    expect(windows.aggregatedStart).toBe(start);
    expect(windows.end).toBe(end);
  });
});

describe('enumerateDayAlignedWindows', () => {
  test('partitions newest-first with a short oldest window', () => {
    // 75 days: [floor, endEdge) → 30 + 30 + 15.
    const floor = new Date(2026, 3, 19, 0, 0, 0, 0);
    const endEdge = new Date(2026, 6, 3, 0, 0, 0, 0);

    const windows = enumerateDayAlignedWindows(floor, endEdge, 30);

    expect(windows).toEqual([
      { start: new Date(2026, 5, 3, 0, 0, 0, 0), end: new Date(2026, 6, 3, 0, 0, 0, 0) },
      { start: new Date(2026, 4, 4, 0, 0, 0, 0), end: new Date(2026, 5, 3, 0, 0, 0, 0) },
      { start: new Date(2026, 3, 19, 0, 0, 0, 0), end: new Date(2026, 4, 4, 0, 0, 0, 0) },
    ]);
    expect(countLocalDays(windows[2].start, windows[2].end)).toBe(15);
  });

  test('an exact multiple produces full windows only', () => {
    const floor = new Date(2026, 5, 3, 0, 0, 0, 0);
    const endEdge = new Date(2026, 6, 3, 0, 0, 0, 0);

    const windows = enumerateDayAlignedWindows(floor, endEdge, 30);

    expect(windows).toEqual([{ start: floor, end: endEdge }]);
  });

  test('returns [] when floor >= endEdge (HC rejects start >= end windows)', () => {
    const edge = new Date(2026, 6, 3, 0, 0, 0, 0);
    expect(enumerateDayAlignedWindows(edge, edge, 30)).toEqual([]);
    expect(enumerateDayAlignedWindows(new Date(2026, 6, 4), edge, 30)).toEqual([]);
  });

  test('aligns non-midnight inputs so every window edge is a local midnight', () => {
    const windows = enumerateDayAlignedWindows(
      new Date(2026, 6, 1, 9, 15),
      new Date(2026, 6, 3, 18, 45),
      30,
    );

    expect(windows).toEqual([
      { start: new Date(2026, 6, 1, 0, 0, 0, 0), end: new Date(2026, 6, 3, 0, 0, 0, 0) },
    ]);
  });
});

describe('buildForegroundWindows', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Local-time constructor so day alignment is timezone-independent.
    jest.setSystemTime(new Date(2026, 6, 3, 15, 30, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("'24h' keeps the rolling session start but aligns the aggregated start to local midnight", () => {
    const windows = buildForegroundWindows('24h');

    expect(windows.sessionStart).toEqual(new Date(2026, 6, 2, 15, 30, 0));
    expect(windows.aggregatedStart).toEqual(new Date(2026, 6, 2, 0, 0, 0, 0));
    expect(windows.end).toEqual(new Date(2026, 6, 3, 15, 30, 0));
  });

  test("'today' produces identical session and aggregated starts (already midnight)", () => {
    const windows = buildForegroundWindows('today');

    expect(windows.sessionStart).toEqual(new Date(2026, 6, 3, 0, 0, 0, 0));
    expect(windows.aggregatedStart).toEqual(windows.sessionStart);
  });
});

describe('buildBackgroundWindows', () => {
  const now = new Date(2026, 6, 3, 15, 30, 0);

  test('applies the 6h overlap to the cursor and day-aligns the aggregated start', () => {
    const lastSynced = new Date(2026, 6, 3, 8, 0, 0);
    const windows = buildBackgroundWindows(lastSynced.toISOString(), now);

    expect(windows.sessionStart).toEqual(new Date(lastSynced.getTime() - SESSION_OVERLAP_MS));
    expect(windows.aggregatedStart).toEqual(new Date(2026, 6, 3, 0, 0, 0, 0));
    expect(windows.end).toBe(now);
  });

  test('defaults to a 24h window (plus overlap) when never synced', () => {
    const windows = buildBackgroundWindows(null, now);

    expect(windows.sessionStart).toEqual(
      new Date(now.getTime() - 24 * 60 * 60 * 1000 - SESSION_OVERLAP_MS),
    );
    expect(windows.aggregatedStart).toEqual(alignToLocalDayStart(windows.sessionStart));
  });
});

describe('getSyncStartDate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-26T14:30:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('180d returns midnight 179 days ago', () => {
    const result = getSyncStartDate('180d');

    const expected = new Date('2025-09-01T00:00:00.000Z');
    expected.setHours(0, 0, 0, 0);

    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);

    // 179 days before 2026-02-26
    const now = new Date('2026-02-26T14:30:00.000Z');
    const diffDays = Math.round((now.getTime() - result.getTime()) / (1000 * 60 * 60 * 24));
    // Should cover 180 days (today + 179 days back)
    expect(diffDays).toBeGreaterThanOrEqual(179);
    expect(diffDays).toBeLessThanOrEqual(180);
  });

  test('365d returns midnight 364 days ago', () => {
    const result = getSyncStartDate('365d');

    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);

    // 364 days before 2026-02-26
    const now = new Date('2026-02-26T14:30:00.000Z');
    const diffDays = Math.round((now.getTime() - result.getTime()) / (1000 * 60 * 60 * 24));
    // Should cover 365 days (today + 364 days back)
    expect(diffDays).toBeGreaterThanOrEqual(364);
    expect(diffDays).toBeLessThanOrEqual(365);
  });

  test('existing durations still work correctly', () => {
    const durations: SyncDuration[] = ['today', '24h', '3d', '7d', '30d', '90d', '180d', '365d'];

    for (const duration of durations) {
      const result = getSyncStartDate(duration);
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBeLessThanOrEqual(Date.now());
    }
  });
});

describe('buildBackgroundWindows lookback clamp', () => {
  test('clamps a long-stale cursor to the lookback floor', () => {
    const now = new Date('2026-08-21T03:00:00Z');
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const windows = buildBackgroundWindows(ninetyDaysAgo.toISOString(), now);

    const floor = new Date(
      now.getTime() - MAX_BACKGROUND_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(windows.sessionStart).toEqual(floor);
  });

  test('a fresh cursor is untouched — the clamp is a floor, not a window size', () => {
    const now = new Date('2026-08-21T03:00:00Z');
    const lastSynced = new Date(now.getTime() - 30 * 60 * 1000);

    const windows = buildBackgroundWindows(lastSynced.toISOString(), now);

    expect(windows.sessionStart).toEqual(
      new Date(lastSynced.getTime() - SESSION_OVERLAP_MS),
    );
  });

  test('an unparseable cursor falls back to the floor rather than an Invalid Date', () => {
    const now = new Date('2026-08-21T03:00:00Z');

    const windows = buildBackgroundWindows('not-a-date', now);

    expect(Number.isFinite(windows.sessionStart.getTime())).toBe(true);
    expect(windows.sessionStart).toEqual(
      new Date(now.getTime() - MAX_BACKGROUND_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
    );
  });
});

describe('buildBackgroundWindows clamp reporting', () => {
  test('reports the span it dropped so the caller can warn the user', () => {
    const now = new Date('2026-08-21T03:00:00Z');
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const windows = buildBackgroundWindows(ninetyDaysAgo.toISOString(), now);

    expect(windows.clampedFrom).toEqual(
      new Date(ninetyDaysAgo.getTime() - SESSION_OVERLAP_MS),
    );
  });

  test('reports nothing when the window was not clamped', () => {
    const now = new Date('2026-08-21T03:00:00Z');
    const lastSynced = new Date(now.getTime() - 30 * 60 * 1000);

    const windows = buildBackgroundWindows(lastSynced.toISOString(), now);

    expect(windows.clampedFrom).toBeUndefined();
  });
});

describe('buildBackgroundWindows invalid cursor (PR #2218 review)', () => {
  test('an unparseable cursor reports no clamp, so callers cannot format an Invalid Date', () => {
    const now = new Date('2026-08-21T03:00:00Z');

    const windows = buildBackgroundWindows('not-a-date', now);

    // clampedFrom used to be set to the Invalid Date, and the background-sync
    // warning then threw RangeError from toISOString() before any reads ran.
    expect(windows.clampedFrom).toBeUndefined();
    expect(() => windows.sessionStart.toISOString()).not.toThrow();
  });

  test('a start exactly on the floor is not reported as shortened', () => {
    const now = new Date('2026-08-21T03:00:00Z');
    const floor = new Date(now.getTime() - MAX_BACKGROUND_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const cursorLandingOnFloor = new Date(floor.getTime() + SESSION_OVERLAP_MS);

    const windows = buildBackgroundWindows(cursorLandingOnFloor.toISOString(), now);

    expect(windows.clampedFrom).toBeUndefined();
  });
});
