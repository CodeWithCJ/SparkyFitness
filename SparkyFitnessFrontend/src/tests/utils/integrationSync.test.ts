import {
  formatIntegrationDate,
  formatIntegrationDateTime,
  getInclusiveCalendarDays,
  isSyncRangeWithinLimit,
} from '@/utils/integrationSync';

describe('integration sync ranges', () => {
  it('counts calendar days inclusively', () => {
    expect(
      getInclusiveCalendarDays(
        new Date('2026-07-01T12:00:00'),
        new Date('2026-07-31T08:00:00')
      )
    ).toBe(31);
  });

  it('accepts Huawei 31-day ranges and rejects 32-day ranges', () => {
    expect(
      isSyncRangeWithinLimit(
        new Date('2026-07-01T12:00:00'),
        new Date('2026-07-31T08:00:00'),
        31
      )
    ).toBe(true);
    expect(
      isSyncRangeWithinLimit(
        new Date('2026-07-01T12:00:00'),
        new Date('2026-08-01T08:00:00'),
        31
      )
    ).toBe(false);
  });

  it('formats calendar dates in the active Arabic locale without HTML entities', () => {
    const date = new Date('2026-07-10T12:00:00.000Z');

    expect(formatIntegrationDate(date, 'ar-SA')).not.toMatch(/Jul|&#/);
    expect(formatIntegrationDateTime(date, 'ar-SA')).not.toMatch(/Jul|&#/);
  });
});
