import { getSyncStartDate } from '../../../src/services/healthconnect/index';

describe('getSyncStartDate', () => {
  // Use fixed date for testing: Jan 15, 2024 at 10:30:00
  const mockNow = new Date('2024-01-15T10:30:00');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('duration parsing', () => {
    it("'24h' returns 24 hours ago normalized to midnight", () => {
      const result = getSyncStartDate('24h');

      // 24 hours before Jan 15 10:30 is Jan 14 10:30, normalized to midnight
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(14);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    it("'3d' returns 2 days ago (today counts as day 1)", () => {
      const result = getSyncStartDate('3d');

      // Jan 15 - 2 days = Jan 13
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(13);
    });

    it("'7d' returns 6 days ago (today counts as day 1)", () => {
      const result = getSyncStartDate('7d');

      // Jan 15 - 6 days = Jan 9
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(9);
    });

    it("'30d' returns 29 days ago (today counts as day 1)", () => {
      const result = getSyncStartDate('30d');

      // Jan 15 - 29 days = Dec 17, 2023
      expect(result.getFullYear()).toBe(2023);
      expect(result.getMonth()).toBe(11); // December
      expect(result.getDate()).toBe(17);
    });

    it("'90d' returns 89 days ago (today counts as day 1)", () => {
      const result = getSyncStartDate('90d');

      // Jan 15, 2024 - 89 days = Oct 18, 2023
      expect(result.getFullYear()).toBe(2023);
      expect(result.getMonth()).toBe(9); // October
      expect(result.getDate()).toBe(18);
    });
  });

  describe('default fallback', () => {
    it('unknown duration defaults to 24h behavior', () => {
      const result = getSyncStartDate('unknown');
      const expected = getSyncStartDate('24h');

      expect(result.getTime()).toBe(expected.getTime());
    });

    it('undefined duration defaults to 24h behavior', () => {
      const result = getSyncStartDate(undefined);
      const expected = getSyncStartDate('24h');

      expect(result.getTime()).toBe(expected.getTime());
    });

    it('null duration defaults to 24h behavior', () => {
      const result = getSyncStartDate(null);
      const expected = getSyncStartDate('24h');

      expect(result.getTime()).toBe(expected.getTime());
    });
  });

  describe('time normalization', () => {
    it('result time is normalized to midnight (00:00:00.000)', () => {
      const result = getSyncStartDate('24h');

      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    it('all durations normalize to midnight', () => {
      const durations = ['24h', '3d', '7d', '30d', '90d'];

      durations.forEach((duration) => {
        const result = getSyncStartDate(duration);

        expect(result.getHours()).toBe(0);
        expect(result.getMinutes()).toBe(0);
        expect(result.getSeconds()).toBe(0);
        expect(result.getMilliseconds()).toBe(0);
      });
    });
  });

  describe('return type', () => {
    it('returns a Date object', () => {
      const result = getSyncStartDate('24h');

      expect(result).toBeInstanceOf(Date);
    });
  });

  describe('DST boundary behavior', () => {
    // US DST 2024: "Spring forward" Mar 10 2:00 AM, "Fall back" Nov 3 2:00 AM
    // Note: '24h' uses millisecond subtraction, while 'Xd' uses setDate()
    // This can produce different results around DST transitions

    it("'24h' near DST spring-forward returns previous day", () => {
      // Mar 10 2024 at 3:00 AM (after spring forward)
      // 24 hours of milliseconds ago = Mar 9 at 2:00 AM (pre-DST time)
      jest.setSystemTime(new Date('2024-03-10T08:00:00Z')); // 3AM EST / 8AM UTC

      const result = getSyncStartDate('24h');

      // Should be Mar 9 at midnight
      expect(result.getDate()).toBe(9);
      expect(result.getMonth()).toBe(2); // March
    });

    it("'3d' near DST uses calendar days not 72 hours", () => {
      // Mar 10 2024 at 3:00 AM (after spring forward)
      jest.setSystemTime(new Date('2024-03-10T08:00:00Z')); // 3AM EST / 8AM UTC

      const result = getSyncStartDate('3d');

      // 3d = 2 calendar days back = Mar 8
      expect(result.getDate()).toBe(8);
      expect(result.getMonth()).toBe(2); // March
    });
  });
});
