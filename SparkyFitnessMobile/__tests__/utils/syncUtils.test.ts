import { getSyncStartDate, SyncDuration } from '../../src/utils/syncUtils';

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
