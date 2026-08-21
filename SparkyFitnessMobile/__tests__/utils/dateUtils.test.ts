import {
  toLocalDateString,
  getTodayDate,
  addDays,
  normalizeDate,
  formatDateLabel,
  formatRelativeTime,
} from '../../src/utils/dateUtils';
import i18n, { initializeI18n } from '../../src/localization/i18n';

const englishTranslator = i18n.getFixedT('en');

// These helpers implement device-local calendar-day logic. The process timezone
// cannot be changed at runtime (V8 caches it at startup), so expectations are
// built from local date components — valid in whatever zone Jest runs in.

describe('toLocalDateString', () => {
  test('uses the local calendar day for a late-evening instant', () => {
    // 23:30 local — in any zone west of UTC the UTC day has already rolled over.
    expect(toLocalDateString(new Date(2024, 5, 15, 23, 30))).toBe('2024-06-15');
  });

  test('local midnight boundary', () => {
    expect(toLocalDateString(new Date(2024, 0, 14, 23, 59))).toBe('2024-01-14');
    expect(toLocalDateString(new Date(2024, 0, 15, 0, 0))).toBe('2024-01-15');
  });

  test('accepts an ISO string and resolves it to the local day', () => {
    const lateEvening = new Date(2024, 0, 14, 23, 59);
    expect(toLocalDateString(lateEvening.toISOString())).toBe('2024-01-14');
  });

  test('early-morning instant stays on its local day', () => {
    expect(toLocalDateString(new Date(2024, 5, 16, 0, 30))).toBe('2024-06-16');
  });
});

describe('addDays', () => {
  test('crosses the spring-forward DST transition (23-hour day in DST zones)', () => {
    expect(addDays('2024-03-10', 1)).toBe('2024-03-11');
    expect(addDays('2024-03-11', -1)).toBe('2024-03-10');
  });

  test('crosses the fall-back DST transition (25-hour day in DST zones)', () => {
    expect(addDays('2024-11-03', 1)).toBe('2024-11-04');
    expect(addDays('2024-11-04', -1)).toBe('2024-11-03');
  });

  test('month boundaries', () => {
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01');
    expect(addDays('2024-05-01', -1)).toBe('2024-04-30');
  });

  test('year boundaries', () => {
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31');
  });

  test('leap day', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2023-02-28', 1)).toBe('2023-03-01');
  });

  test('multi-day jumps spanning a DST transition', () => {
    expect(addDays('2024-03-01', 30)).toBe('2024-03-31');
    expect(addDays('2024-11-30', -30)).toBe('2024-10-31');
  });

  test('zero days is identity', () => {
    expect(addDays('2024-06-15', 0)).toBe('2024-06-15');
  });
});

describe('normalizeDate', () => {
  test('strips a time suffix', () => {
    expect(normalizeDate('2024-06-15T12:00:00.000Z')).toBe('2024-06-15');
  });

  test('passes a plain day string through', () => {
    expect(normalizeDate('2024-06-15')).toBe('2024-06-15');
  });
});

describe('with a pinned clock', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // 22:30 local on June 15 — near the end of the local day.
    jest.setSystemTime(new Date(2024, 5, 15, 22, 30));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getTodayDate', () => {
    test('returns the local calendar day', () => {
      expect(getTodayDate()).toBe('2024-06-15');
    });

    test('agrees with toLocalDateString for the same instant', () => {
      expect(getTodayDate()).toBe(toLocalDateString(new Date()));
    });
  });

  describe('formatDateLabel', () => {
    test('selects Today / Yesterday / fallback by day string', () => {
      expect(formatDateLabel('2024-06-15', englishTranslator, 'en-US')).toBe('Today');
      expect(formatDateLabel('2024-06-14', englishTranslator, 'en-US')).toBe('Yesterday');
      const other = formatDateLabel('2024-06-13', englishTranslator, 'en-US');
      expect(other).not.toBe('Today');
      expect(other).not.toBe('Yesterday');
    });
  });

  describe('formatRelativeTime', () => {
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);

    test('null means never synced', () => {
      expect(formatRelativeTime(null, englishTranslator, 'en-US')).toBe('Never synced');
    });

    test('uses the active Polish app locale for relative time', async () => {
      await initializeI18n('pl');
      await i18n.changeLanguage('pl');
      const polishTranslator = i18n.getFixedT('pl');
      expect(formatRelativeTime(minutesAgo(1), polishTranslator, 'pl-PL')).toMatch(/1 minutę temu/);
      expect(formatRelativeTime(minutesAgo(5), polishTranslator, 'pl-PL')).toMatch(/5 minut temu/);
    });

    test('branches on elapsed time', async () => {
      await i18n.changeLanguage('en');
      expect(formatRelativeTime(minutesAgo(0.5), englishTranslator, 'en-US')).toBe('Just now');
      expect(formatRelativeTime(minutesAgo(1), englishTranslator, 'en-US')).toMatch(/1 minute ago/);
      expect(formatRelativeTime(minutesAgo(5), englishTranslator, 'en-US')).toMatch(/5 minutes ago/);
      expect(formatRelativeTime(minutesAgo(90), englishTranslator, 'en-US')).toMatch(/1 hour ago/);
      expect(formatRelativeTime(minutesAgo(3 * 60), englishTranslator, 'en-US')).toMatch(/3 hours ago/);
      expect(formatRelativeTime(minutesAgo(30 * 60), englishTranslator, 'en-US')).toMatch(/^Yesterday at /);
      const older = formatRelativeTime(minutesAgo(5 * 24 * 60), englishTranslator, 'en-US');
      expect(older).not.toMatch(/^Yesterday/);
      expect(older).toContain(' at ');
    });
  });
});
