import {
  getSyncStartDate,
  alignToLocalDayStart,
  buildForegroundWindows,
  buildBackgroundWindows,
  SESSION_OVERLAP_MS,
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
