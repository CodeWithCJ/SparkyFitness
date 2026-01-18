import { calculateSyncDateRange } from '../../src/services/backgroundSyncService';

describe('calculateSyncDateRange', () => {
  describe('1h sync duration', () => {
    test('at 3:30pm, syncs exactly 1 hour ago to now (rolling window)', () => {
      const now = new Date('2024-06-15T15:30:00');
      const { startDate, endDate } = calculateSyncDateRange(now, '1h');

      // True rolling window: exactly 1 hour before now
      expect(startDate.getHours()).toBe(14); // 2:30pm
      expect(startDate.getMinutes()).toBe(30);
      expect(startDate.getSeconds()).toBe(0);
      expect(endDate.getHours()).toBe(15);
      expect(endDate.getMinutes()).toBe(30);
    });

    test('at 11pm, startDate is exactly 10pm', () => {
      const now = new Date('2024-06-15T23:00:00');
      const { startDate, endDate } = calculateSyncDateRange(now, '1h');

      expect(startDate.getHours()).toBe(22);
      expect(startDate.getMinutes()).toBe(0);
      expect(endDate.getHours()).toBe(23);
      expect(endDate.getMinutes()).toBe(0);
    });

    test('at 12:15am, startDate is 11:15pm previous day', () => {
      const now = new Date('2024-06-15T00:15:00');
      const { startDate, endDate } = calculateSyncDateRange(now, '1h');

      expect(startDate.getHours()).toBe(23);
      expect(startDate.getMinutes()).toBe(15); // Exact time, not rounded
      expect(startDate.getDate()).toBe(14); // Previous day
      expect(endDate.getDate()).toBe(15); // Current day
      expect(endDate.getHours()).toBe(0);
    });

    test('preserves exact time for rolling window', () => {
      const now = new Date('2024-06-15T14:30:45.123');
      const { startDate, endDate } = calculateSyncDateRange(now, '1h');

      expect(startDate.getHours()).toBe(13);
      expect(startDate.getMinutes()).toBe(30);
      expect(startDate.getSeconds()).toBe(45);
      expect(startDate.getMilliseconds()).toBe(123);
      expect(endDate.getTime()).toBe(now.getTime());
    });
  });

  describe('4h sync duration', () => {
    test('at 6pm, syncs exactly 4 hours ago to now (rolling window)', () => {
      const now = new Date('2024-06-15T18:00:00');
      const { startDate, endDate } = calculateSyncDateRange(now, '4h');

      expect(startDate.getHours()).toBe(14);
      expect(startDate.getMinutes()).toBe(0);
      expect(endDate.getHours()).toBe(18);
      expect(endDate.getMinutes()).toBe(0);
    });

    test('at 3pm, startDate is exactly 11am', () => {
      const now = new Date('2024-06-15T15:00:00');
      const { startDate, endDate } = calculateSyncDateRange(now, '4h');

      expect(startDate.getHours()).toBe(11);
      expect(startDate.getMinutes()).toBe(0);
      expect(endDate.getHours()).toBe(15);
    });

    test('at 2am, startDate is exactly 10pm previous day', () => {
      const now = new Date('2024-06-15T02:00:00');
      const { startDate, endDate } = calculateSyncDateRange(now, '4h');

      expect(startDate.getHours()).toBe(22);
      expect(startDate.getMinutes()).toBe(0);
      expect(startDate.getDate()).toBe(14); // Previous day
      expect(endDate.getDate()).toBe(15);
      expect(endDate.getHours()).toBe(2);
    });

    test('preserves exact time for rolling window', () => {
      const now = new Date('2024-06-15T14:30:45.123');
      const { startDate, endDate } = calculateSyncDateRange(now, '4h');

      expect(startDate.getHours()).toBe(10);
      expect(startDate.getMinutes()).toBe(30);
      expect(startDate.getSeconds()).toBe(45);
      expect(startDate.getMilliseconds()).toBe(123);
      expect(endDate.getTime()).toBe(now.getTime());
    });
  });

  describe('24h sync duration', () => {
    test('syncs exactly 24 hours ago to now (rolling window)', () => {
      const now = new Date('2024-06-15T10:00:00');
      const { startDate, endDate } = calculateSyncDateRange(now, '24h');

      // startDate should be exactly 24 hours before now
      expect(startDate.getDate()).toBe(14);
      expect(startDate.getHours()).toBe(10); // Same hour as now, but yesterday
      expect(startDate.getMinutes()).toBe(0);
      expect(startDate.getSeconds()).toBe(0);

      // endDate should be now
      expect(endDate.getDate()).toBe(15);
      expect(endDate.getHours()).toBe(10);
      expect(endDate.getMinutes()).toBe(0);
    });

    test('works correctly at midnight (spans to previous day)', () => {
      const now = new Date('2024-06-15T00:00:00');
      const { startDate, endDate } = calculateSyncDateRange(now, '24h');

      // 24 hours before midnight June 15 is midnight June 14
      expect(startDate.getDate()).toBe(14);
      expect(startDate.getHours()).toBe(0);
      expect(endDate.getDate()).toBe(15);
      expect(endDate.getHours()).toBe(0);
    });

    test('preserves exact time for rolling window', () => {
      const now = new Date('2024-06-15T14:30:45.123');
      const { startDate, endDate } = calculateSyncDateRange(now, '24h');

      // startDate should be exactly 24 hours ago with same time
      expect(startDate.getDate()).toBe(14);
      expect(startDate.getHours()).toBe(14);
      expect(startDate.getMinutes()).toBe(30);
      expect(startDate.getSeconds()).toBe(45);
      expect(startDate.getMilliseconds()).toBe(123);

      // endDate should match now exactly
      expect(endDate.getTime()).toBe(now.getTime());
    });
  });

  describe('endDate behavior', () => {
    test('for all durations (1h/4h/24h), endDate equals now', () => {
      const now = new Date('2024-06-15T10:30:45.123');

      const result1h = calculateSyncDateRange(now, '1h');
      expect(result1h.endDate.getTime()).toBe(now.getTime());

      const result4h = calculateSyncDateRange(now, '4h');
      expect(result4h.endDate.getTime()).toBe(now.getTime());

      const result24h = calculateSyncDateRange(now, '24h');
      expect(result24h.endDate.getTime()).toBe(now.getTime());
    });
  });
});
