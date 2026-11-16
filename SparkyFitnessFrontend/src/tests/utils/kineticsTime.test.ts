import {
  formatDayRelativeTick,
  formatRelativeDateTime,
  hourlyTicks,
  kineticsClock,
  zonedDayBounds,
} from '@/utils/kineticsTime';

describe('kineticsTime', () => {
  it('places an instant on its day in the profile zone, not the browser zone', () => {
    const clock = kineticsClock('UTC', 'HH:mm', 'en');
    // 23:00 UTC on Nov 15 is Nov 16 in UTC+2, but Nov 15 for this profile.
    expect(
      formatRelativeDateTime('2026-11-15T23:00:00.000Z', '2026-11-15', clock)
    ).toBe('23:00');
    expect(
      formatRelativeDateTime('2026-11-16T01:00:00.000Z', '2026-11-15', clock, {
        tomorrow: 'Tomorrow',
      })
    ).toBe('Tomorrow, 01:00');
  });

  it('uses the configured time format', () => {
    const at = Date.parse('2026-11-15T20:00:00.000Z');
    expect(kineticsClock('UTC', 'HH:mm', 'en').time(at)).toBe('20:00');
    expect(kineticsClock('UTC', 'h:mm A', 'en').time(at)).toBe('8:00 PM');
  });

  it('bounds the day at the profile zone midnights', () => {
    expect(zonedDayBounds('2026-09-05', 'Pacific/Kiritimati')).toEqual({
      startMs: Date.parse('2026-09-04T10:00:00.000Z'),
      endMs: Date.parse('2026-09-05T10:00:00.000Z'),
    });
    expect(zonedDayBounds('not-a-day', 'UTC')).toBeNull();
  });

  it('labels ticks relative to the viewed day in the profile zone', () => {
    const clock = kineticsClock('UTC', 'HH:mm', 'en');
    expect(
      formatDayRelativeTick(
        Date.parse('2026-11-16T00:00:00.000Z'),
        '2026-11-15',
        clock
      )
    ).toBe('Nov 16');
    expect(
      formatDayRelativeTick(
        Date.parse('2026-11-16T03:00:00.000Z'),
        '2026-11-15',
        clock
      )
    ).toBe('+1d 03:00');
  });

  it('puts hourly ticks on the full hours of the profile zone', () => {
    // Asia/Kolkata is UTC+05:30, so its full hours fall on :30 UTC.
    const ticks = hourlyTicks(
      Date.parse('2026-11-15T10:00:00.000Z'),
      Date.parse('2026-11-15T12:00:00.000Z'),
      'Asia/Kolkata'
    );
    expect(ticks.map((t) => new Date(t).toISOString())).toEqual([
      '2026-11-15T10:30:00.000Z',
      '2026-11-15T11:30:00.000Z',
    ]);
  });

  it('keeps hourly ticks on full hours across a half-hour DST change', () => {
    // Lord Howe moves from UTC+10:30 to UTC+11 at 02:00 on 2026-10-04, so its
    // full hours move from :30 UTC to :00 UTC.
    const zone = 'Australia/Lord_Howe';
    const ticks = hourlyTicks(
      Date.parse('2026-10-03T13:30:00.000Z'),
      Date.parse('2026-10-03T18:00:00.000Z'),
      zone
    );
    expect(ticks.map((t) => new Date(t).toISOString())).toEqual([
      '2026-10-03T13:30:00.000Z', // 00:00 +10:30
      '2026-10-03T14:30:00.000Z', // 01:00 +10:30
      '2026-10-03T16:00:00.000Z', // 03:00 +11
      '2026-10-03T17:00:00.000Z', // 04:00 +11
      '2026-10-03T18:00:00.000Z', // 05:00 +11
    ]);
    const clock = kineticsClock(zone, 'HH:mm', 'en');
    expect(ticks.map(clock.time)).toEqual([
      '00:00',
      '01:00',
      '03:00',
      '04:00',
      '05:00',
    ]);
  });

  it('steps one hour across a whole-hour DST change', () => {
    // Berlin skips 02:00 to 03:00 on 2026-03-29 (01:00 UTC).
    const ticks = hourlyTicks(
      Date.parse('2026-03-29T00:00:00.000Z'),
      Date.parse('2026-03-29T03:00:00.000Z'),
      'Europe/Berlin'
    );
    expect(ticks.map((t) => new Date(t).toISOString())).toEqual([
      '2026-03-29T00:00:00.000Z',
      '2026-03-29T01:00:00.000Z',
      '2026-03-29T02:00:00.000Z',
      '2026-03-29T03:00:00.000Z',
    ]);
  });

  it('keeps hourly ticks on full hours when a half-hour DST change ends', () => {
    // Lord Howe moves back from UTC+11 to UTC+10:30 at 02:00 on 2026-04-05,
    // so 01:30 to 02:00 happens twice.
    const zone = 'Australia/Lord_Howe';
    const ticks = hourlyTicks(
      Date.parse('2026-04-04T13:00:00.000Z'),
      Date.parse('2026-04-04T17:30:00.000Z'),
      zone
    );
    expect(ticks.map((t) => new Date(t).toISOString())).toEqual([
      '2026-04-04T13:00:00.000Z', // 00:00 +11
      '2026-04-04T14:00:00.000Z', // 01:00 +11
      '2026-04-04T15:30:00.000Z', // 02:00 +10:30
      '2026-04-04T16:30:00.000Z', // 03:00 +10:30
      '2026-04-04T17:30:00.000Z', // 04:00 +10:30
    ]);
    const clock = kineticsClock(zone, 'HH:mm', 'en');
    expect(ticks.map(clock.time)).toEqual([
      '00:00',
      '01:00',
      '02:00',
      '03:00',
      '04:00',
    ]);
  });
});
