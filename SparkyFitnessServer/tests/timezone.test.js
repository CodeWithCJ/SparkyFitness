const {
  isDayString,
  dayOfWeek,
  addDays,
  compareDays,
  dayToPickerDate,
  localDateToDay,
  isValidTimeZone,
  todayInZone,
  instantToDay,
  instantHourMinute,
  instantToDayWithOffset,
  instantHourMinuteWithOffset,
  dayToUtcRange,
  dayRangeToUtcRange,
} = require('@workspace/shared');

// ---------------------------------------------------------------------------
// isDayString
// ---------------------------------------------------------------------------
describe('isDayString', () => {
  it('accepts valid dates', () => {
    expect(isDayString('2024-01-01')).toBe(true);
    expect(isDayString('2024-12-31')).toBe(true);
    expect(isDayString('2024-02-29')).toBe(true); // leap year
  });

  it('rejects invalid dates', () => {
    expect(isDayString('2024-02-30')).toBe(false);
    expect(isDayString('2023-02-29')).toBe(false); // not a leap year
    expect(isDayString('2024-13-01')).toBe(false);
    expect(isDayString('2024-00-01')).toBe(false);
    expect(isDayString('not-a-date')).toBe(false);
    expect(isDayString('2024-1-1')).toBe(false); // missing zero-padding
    expect(isDayString('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// dayOfWeek
// ---------------------------------------------------------------------------
describe('dayOfWeek', () => {
  it('returns correct day of week (0=Sun)', () => {
    // 2024-01-01 is Monday
    expect(dayOfWeek('2024-01-01')).toBe(1);
    // 2024-03-10 is Sunday (US DST spring-forward day)
    expect(dayOfWeek('2024-03-10')).toBe(0);
    // 2024-12-25 is Wednesday
    expect(dayOfWeek('2024-12-25')).toBe(3);
    // 2000-01-01 is Saturday
    expect(dayOfWeek('2000-01-01')).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// addDays
// ---------------------------------------------------------------------------
describe('addDays', () => {
  it('adds days forward', () => {
    expect(addDays('2024-01-30', 2)).toBe('2024-02-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29'); // leap year
    expect(addDays('2023-02-28', 1)).toBe('2023-03-01'); // non-leap year
  });

  it('subtracts days', () => {
    expect(addDays('2024-01-01', -1)).toBe('2023-12-31');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('handles year boundaries', () => {
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31');
  });

  it('handles large offsets', () => {
    expect(addDays('2024-01-01', 366)).toBe('2025-01-01'); // leap year
  });
});

// ---------------------------------------------------------------------------
// compareDays
// ---------------------------------------------------------------------------
describe('compareDays', () => {
  it('returns -1, 0, or 1', () => {
    expect(compareDays('2024-01-01', '2024-01-02')).toBe(-1);
    expect(compareDays('2024-01-01', '2024-01-01')).toBe(0);
    expect(compareDays('2024-01-02', '2024-01-01')).toBe(1);
    expect(compareDays('2023-12-31', '2024-01-01')).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// dayToPickerDate / localDateToDay
// ---------------------------------------------------------------------------
describe('dayToPickerDate / localDateToDay', () => {
  it('round-trips through picker date', () => {
    const day = '2024-06-15';
    const pickerDate = dayToPickerDate(day);
    expect(pickerDate.getFullYear()).toBe(2024);
    expect(pickerDate.getMonth()).toBe(5); // 0-indexed
    expect(pickerDate.getDate()).toBe(15);
    expect(localDateToDay(pickerDate)).toBe(day);
  });
});

// ---------------------------------------------------------------------------
// isValidTimeZone
// ---------------------------------------------------------------------------
describe('isValidTimeZone', () => {
  it('accepts valid IANA timezones', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Asia/Tokyo')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Pacific/Auckland')).toBe(true);
  });

  it('rejects invalid timezones', () => {
    expect(isValidTimeZone('Fake/Zone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('Not/A/Zone')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// todayInZone
// ---------------------------------------------------------------------------
describe('todayInZone', () => {
  it('returns a valid YYYY-MM-DD string', () => {
    const result = todayInZone('UTC');
    expect(isDayString(result)).toBe(true);
  });

  it('can differ across timezones near date boundaries', () => {
    // At UTC midnight, Auckland (UTC+12/+13) is already the next day
    // We can't control "now", so just verify format
    const utc = todayInZone('UTC');
    const auckland = todayInZone('Pacific/Auckland');
    expect(isDayString(utc)).toBe(true);
    expect(isDayString(auckland)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// instantToDay
// ---------------------------------------------------------------------------
describe('instantToDay', () => {
  it('converts UTC midnight to the correct day in UTC', () => {
    const ts = new Date('2024-06-15T00:00:00Z');
    expect(instantToDay(ts, 'UTC')).toBe('2024-06-15');
  });

  it('converts to the previous day for negative offset zones', () => {
    // 2024-06-15 00:30 UTC → June 14 in LA (UTC-7)
    const ts = new Date('2024-06-15T00:30:00Z');
    expect(instantToDay(ts, 'America/Los_Angeles')).toBe('2024-06-14');
  });

  it('converts to the next day for positive offset zones', () => {
    // 2024-06-14 23:30 UTC → June 15 in Tokyo (UTC+9)
    const ts = new Date('2024-06-14T23:30:00Z');
    expect(instantToDay(ts, 'Asia/Tokyo')).toBe('2024-06-15');
  });

  it('handles half-hour offset (Asia/Kolkata, UTC+5:30)', () => {
    // 2024-06-14 19:00 UTC → June 15 00:30 IST
    const ts = new Date('2024-06-14T19:00:00Z');
    expect(instantToDay(ts, 'Asia/Kolkata')).toBe('2024-06-15');
  });

  it('handles date-line (Pacific/Auckland, UTC+12/+13)', () => {
    // 2024-06-14 11:30 UTC → June 15 at 00:30 NZST (UTC+12)
    const ts = new Date('2024-06-14T11:30:00Z');
    expect(instantToDay(ts, 'Pacific/Auckland')).toBe('2024-06-14');
    // 2024-06-14 12:30 UTC → June 15 at 00:30 NZST
    const ts2 = new Date('2024-06-14T12:30:00Z');
    expect(instantToDay(ts2, 'Pacific/Auckland')).toBe('2024-06-15');
  });

  it('handles year boundaries', () => {
    // 2024-12-31 23:30 UTC → Jan 1 in Tokyo
    const ts = new Date('2024-12-31T23:30:00Z');
    expect(instantToDay(ts, 'Asia/Tokyo')).toBe('2025-01-01');
    expect(instantToDay(ts, 'America/Los_Angeles')).toBe('2024-12-31');
  });

  it('accepts string and number timestamps', () => {
    const isoStr = '2024-06-15T12:00:00Z';
    const ms = new Date(isoStr).getTime();
    expect(instantToDay(isoStr, 'UTC')).toBe('2024-06-15');
    expect(instantToDay(ms, 'UTC')).toBe('2024-06-15');
  });
});

// ---------------------------------------------------------------------------
// instantHourMinute
// ---------------------------------------------------------------------------
describe('instantHourMinute', () => {
  it('returns the correct hour/minute in a timezone', () => {
    // 2024-06-15 15:45 UTC → 11:45 in New York (EDT, UTC-4)
    const ts = new Date('2024-06-15T15:45:00Z');
    const { hour, minute } = instantHourMinute(ts, 'America/New_York');
    expect(hour).toBe(11);
    expect(minute).toBe(45);
  });

  it('handles half-hour offsets', () => {
    // 2024-06-15 15:45 UTC → 21:15 IST (UTC+5:30)
    const ts = new Date('2024-06-15T15:45:00Z');
    const { hour, minute } = instantHourMinute(ts, 'Asia/Kolkata');
    expect(hour).toBe(21);
    expect(minute).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// dayToUtcRange
// ---------------------------------------------------------------------------
describe('dayToUtcRange', () => {
  it('returns midnight-to-midnight for UTC', () => {
    const { start, end } = dayToUtcRange('2024-06-15', 'UTC');
    expect(start.toISOString()).toBe('2024-06-15T00:00:00.000Z');
    expect(end.toISOString()).toBe('2024-06-16T00:00:00.000Z');
  });

  it('returns correct range for negative offset (America/Los_Angeles)', () => {
    // LA is UTC-7 in summer (PDT)
    // Midnight PDT = 07:00 UTC
    const { start, end } = dayToUtcRange('2024-06-15', 'America/Los_Angeles');
    expect(start.toISOString()).toBe('2024-06-15T07:00:00.000Z');
    expect(end.toISOString()).toBe('2024-06-16T07:00:00.000Z');
  });

  it('returns correct range for positive offset (Asia/Tokyo, UTC+9)', () => {
    // Midnight JST = 15:00 UTC previous day
    const { start, end } = dayToUtcRange('2024-06-15', 'Asia/Tokyo');
    expect(start.toISOString()).toBe('2024-06-14T15:00:00.000Z');
    expect(end.toISOString()).toBe('2024-06-15T15:00:00.000Z');
  });

  it('returns correct range for half-hour offset (Asia/Kolkata, UTC+5:30)', () => {
    // Midnight IST = 18:30 UTC previous day
    const { start, end } = dayToUtcRange('2024-06-15', 'Asia/Kolkata');
    expect(start.toISOString()).toBe('2024-06-14T18:30:00.000Z');
    expect(end.toISOString()).toBe('2024-06-15T18:30:00.000Z');
  });

  it('returns correct range for date-line (Pacific/Auckland, UTC+12 winter)', () => {
    // June is winter in NZ: NZST = UTC+12
    // Midnight NZST = 12:00 UTC previous day
    const { start, end } = dayToUtcRange('2024-06-15', 'Pacific/Auckland');
    expect(start.toISOString()).toBe('2024-06-14T12:00:00.000Z');
    expect(end.toISOString()).toBe('2024-06-15T12:00:00.000Z');
  });

  it('handles US DST spring-forward (America/New_York, March 2024)', () => {
    // DST spring-forward: 2024-03-10 at 2:00 AM → 3:00 AM
    // March 9: EST (UTC-5), midnight = 05:00 UTC
    // March 10: still starts in EST, midnight = 05:00 UTC, but day is only 23 hrs
    // March 11: EDT (UTC-4), midnight = 04:00 UTC
    const day9 = dayToUtcRange('2024-03-09', 'America/New_York');
    expect(day9.start.toISOString()).toBe('2024-03-09T05:00:00.000Z');
    expect(day9.end.toISOString()).toBe('2024-03-10T05:00:00.000Z');

    const day10 = dayToUtcRange('2024-03-10', 'America/New_York');
    expect(day10.start.toISOString()).toBe('2024-03-10T05:00:00.000Z');
    // Day ends at midnight EDT = 04:00 UTC on March 11
    expect(day10.end.toISOString()).toBe('2024-03-11T04:00:00.000Z');

    const day11 = dayToUtcRange('2024-03-11', 'America/New_York');
    expect(day11.start.toISOString()).toBe('2024-03-11T04:00:00.000Z');
    expect(day11.end.toISOString()).toBe('2024-03-12T04:00:00.000Z');
  });

  it('handles US DST fall-back (America/New_York, November 2024)', () => {
    // DST fall-back: 2024-11-03 at 2:00 AM → 1:00 AM
    // Nov 2: EDT (UTC-4), midnight = 04:00 UTC
    // Nov 3: starts in EDT, midnight = 04:00 UTC, day is 25 hrs
    // Nov 4: EST (UTC-5), midnight = 05:00 UTC
    const day2 = dayToUtcRange('2024-11-02', 'America/New_York');
    expect(day2.start.toISOString()).toBe('2024-11-02T04:00:00.000Z');
    expect(day2.end.toISOString()).toBe('2024-11-03T04:00:00.000Z');

    const day3 = dayToUtcRange('2024-11-03', 'America/New_York');
    expect(day3.start.toISOString()).toBe('2024-11-03T04:00:00.000Z');
    expect(day3.end.toISOString()).toBe('2024-11-04T05:00:00.000Z');

    const day4 = dayToUtcRange('2024-11-04', 'America/New_York');
    expect(day4.start.toISOString()).toBe('2024-11-04T05:00:00.000Z');
    expect(day4.end.toISOString()).toBe('2024-11-05T05:00:00.000Z');
  });

  it('handles offset change between UTC midnight and local midnight (Australia/Lord_Howe)', () => {
    // Lord Howe: UTC+11 (summer) → UTC+10:30 (winter) on 2024-04-07 at 2:00 AM local.
    // Midnight local on April 7 is still in +11 (before the 2am transition).
    // So midnight LHDT = 2024-04-06T13:00:00Z, NOT 13:30.
    const day7 = dayToUtcRange('2024-04-07', 'Australia/Lord_Howe');
    expect(day7.start.toISOString()).toBe('2024-04-06T13:00:00.000Z');
    // The day ends at midnight April 8, now in +10:30 (winter)
    expect(day7.end.toISOString()).toBe('2024-04-07T13:30:00.000Z');
  });

  it('handles year boundaries', () => {
    const { start, end } = dayToUtcRange('2024-12-31', 'Asia/Tokyo');
    expect(start.toISOString()).toBe('2024-12-30T15:00:00.000Z');
    expect(end.toISOString()).toBe('2024-12-31T15:00:00.000Z');

    const { start: start2, end: end2 } = dayToUtcRange(
      '2025-01-01',
      'Asia/Tokyo'
    );
    expect(start2.toISOString()).toBe('2024-12-31T15:00:00.000Z');
    expect(end2.toISOString()).toBe('2025-01-01T15:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// dayRangeToUtcRange
// ---------------------------------------------------------------------------
describe('dayRangeToUtcRange', () => {
  it('returns correct range for multi-day span', () => {
    // June 15-17 in Tokyo (UTC+9)
    const { start, end } = dayRangeToUtcRange(
      '2024-06-15',
      '2024-06-17',
      'Asia/Tokyo'
    );
    // Start of June 15 JST = June 14 15:00 UTC
    expect(start.toISOString()).toBe('2024-06-14T15:00:00.000Z');
    // End of June 17 (= start of June 18) JST = June 17 15:00 UTC
    expect(end.toISOString()).toBe('2024-06-17T15:00:00.000Z');
  });

  it('returns a single day range when start equals end', () => {
    const { start, end } = dayRangeToUtcRange(
      '2024-06-15',
      '2024-06-15',
      'UTC'
    );
    expect(start.toISOString()).toBe('2024-06-15T00:00:00.000Z');
    expect(end.toISOString()).toBe('2024-06-16T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// instantToDayWithOffset
// ---------------------------------------------------------------------------
describe('instantToDayWithOffset', () => {
  it('returns the correct day at UTC (offset 0)', () => {
    const ts = new Date('2024-06-15T00:00:00Z');
    expect(instantToDayWithOffset(ts, 0)).toBe('2024-06-15');
  });

  it('shifts to the next day for positive offset', () => {
    // 2024-06-14 23:30 UTC with +9h offset → June 15 08:30 local
    const ts = new Date('2024-06-14T23:30:00Z');
    expect(instantToDayWithOffset(ts, 540)).toBe('2024-06-15');
  });

  it('shifts to the previous day for negative offset', () => {
    // 2024-06-15 00:30 UTC with -7h offset → June 14 17:30 local
    const ts = new Date('2024-06-15T00:30:00Z');
    expect(instantToDayWithOffset(ts, -420)).toBe('2024-06-14');
  });

  it('handles half-hour offset (UTC+5:30)', () => {
    // 2024-06-14 19:00 UTC with +5:30 → June 15 00:30 local
    const ts = new Date('2024-06-14T19:00:00Z');
    expect(instantToDayWithOffset(ts, 330)).toBe('2024-06-15');
  });

  it('handles year boundaries', () => {
    // 2024-12-31 23:30 UTC with +9h → Jan 1 2025
    const ts = new Date('2024-12-31T23:30:00Z');
    expect(instantToDayWithOffset(ts, 540)).toBe('2025-01-01');
  });

  it('accepts string and number timestamps', () => {
    const isoStr = '2024-06-15T12:00:00Z';
    const ms = new Date(isoStr).getTime();
    expect(instantToDayWithOffset(isoStr, 0)).toBe('2024-06-15');
    expect(instantToDayWithOffset(ms, 0)).toBe('2024-06-15');
  });

  it('agrees with instantToDay for known IANA/offset pairs', () => {
    // Tokyo is always UTC+9 (no DST) = +540 minutes
    const ts = new Date('2024-06-14T23:30:00Z');
    expect(instantToDayWithOffset(ts, 540)).toBe(
      instantToDay(ts, 'Asia/Tokyo')
    );
  });
});

// ---------------------------------------------------------------------------
// instantHourMinuteWithOffset
// ---------------------------------------------------------------------------
describe('instantHourMinuteWithOffset', () => {
  it('returns correct hour/minute at UTC (offset 0)', () => {
    const ts = new Date('2024-06-15T15:45:00Z');
    const { hour, minute } = instantHourMinuteWithOffset(ts, 0);
    expect(hour).toBe(15);
    expect(minute).toBe(45);
  });

  it('applies positive offset', () => {
    // 15:45 UTC with +9h → 00:45 next day
    const ts = new Date('2024-06-15T15:45:00Z');
    const { hour, minute } = instantHourMinuteWithOffset(ts, 540);
    expect(hour).toBe(0);
    expect(minute).toBe(45);
  });

  it('applies negative offset', () => {
    // 15:45 UTC with -4h → 11:45
    const ts = new Date('2024-06-15T15:45:00Z');
    const { hour, minute } = instantHourMinuteWithOffset(ts, -240);
    expect(hour).toBe(11);
    expect(minute).toBe(45);
  });

  it('handles half-hour offset (UTC+5:30)', () => {
    // 15:45 UTC with +5:30 → 21:15
    const ts = new Date('2024-06-15T15:45:00Z');
    const { hour, minute } = instantHourMinuteWithOffset(ts, 330);
    expect(hour).toBe(21);
    expect(minute).toBe(15);
  });

  it('agrees with instantHourMinute for known IANA/offset pairs', () => {
    // Tokyo is always UTC+9
    const ts = new Date('2024-06-15T15:45:00Z');
    const fromOffset = instantHourMinuteWithOffset(ts, 540);
    const fromIana = instantHourMinute(ts, 'Asia/Tokyo');
    expect(fromOffset).toEqual(fromIana);
  });
});
