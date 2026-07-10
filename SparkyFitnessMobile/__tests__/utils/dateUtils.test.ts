import {
  formatDate,
  formatDateLabel,
  formatRelativeTime,
  getTodayDate,
} from '../../src/utils/dateUtils';

describe('Saudi Arabic date formatting', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('formats calendar days in Arabic with the Gregorian calendar', () => {
    expect(formatDate('2026-07-10')).toBe('الجمعة، ١٠ يوليو');
  });

  it('uses natural Arabic labels for today and yesterday', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 10, 12));

    expect(formatDateLabel(getTodayDate())).toBe('اليوم');
    expect(formatDateLabel('2026-07-09')).toBe('أمس');
  });

  it('uses Arabic relative-time plurals', () => {
    jest.useFakeTimers().setSystemTime(
      new Date('2026-07-10T12:00:00.000Z'),
    );

    expect(
      formatRelativeTime(new Date('2026-07-10T11:59:30.000Z')),
    ).toBe('الحين');
    expect(
      formatRelativeTime(new Date('2026-07-10T11:58:00.000Z')),
    ).toBe('قبل دقيقتين');
    expect(formatRelativeTime(null)).toBe('ما سبق زامنت');
  });
});
