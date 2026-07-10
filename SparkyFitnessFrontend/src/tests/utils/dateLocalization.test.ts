import { formatLocalizedDate } from '@/utils/dateLocalization';

describe('formatLocalizedDate', () => {
  const date = new Date(2026, 6, 10);

  it('uses Saudi Arabic month and weekday names for Arabic', () => {
    const formatted = formatLocalizedDate(date, 'EEEE، d MMMM yyyy', 'ar-SA');

    expect(formatted).toContain('الجمعة');
    expect(formatted).toContain('يوليو');
    expect(formatted).not.toContain('July');
  });

  it('keeps the default date-fns locale for non-Arabic languages', () => {
    expect(formatLocalizedDate(date, 'd MMMM yyyy', 'en')).toBe('10 July 2026');
  });
});
