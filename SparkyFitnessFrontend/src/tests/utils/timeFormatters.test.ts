import {
  formatTimeWithPreference,
  formatTimeOfDayString,
} from '@/utils/timeFormatters';

const MIDNIGHT = new Date('2024-01-15T00:00:00');
const NOON = new Date('2024-01-15T12:00:00');
const MORNING = new Date('2024-01-15T08:30:00');
const AFTERNOON = new Date('2024-01-15T14:45:00');
const EVENING = new Date('2024-01-15T19:15:00');

// ---------------------------------------------------------------------------
// 24-hour format (timeFormat === 'HH:mm')
// ---------------------------------------------------------------------------
describe('formatTimeWithPreference — 24h (HH:mm)', () => {
  it('returns midnight as 00:xx', () => {
    const result = formatTimeWithPreference(MIDNIGHT, 'HH:mm');
    expect(result).toMatch(/^00:/);
  });

  it('returns noon as 12:xx (not 00:xx)', () => {
    const result = formatTimeWithPreference(NOON, 'HH:mm');
    expect(result).toMatch(/^12:/);
  });

  it('returns morning time with hour padded', () => {
    const result = formatTimeWithPreference(MORNING, 'HH:mm');
    expect(result).toMatch(/^08:30/);
  });

  it('returns afternoon time in 24h (14:xx not 2:xx)', () => {
    const result = formatTimeWithPreference(AFTERNOON, 'HH:mm');
    expect(result).toMatch(/^14:45/);
  });

  it('returns evening time in 24h (19:xx)', () => {
    const result = formatTimeWithPreference(EVENING, 'HH:mm');
    expect(result).toMatch(/^19:15/);
  });

  it('does NOT contain AM or PM for 24h format', () => {
    const result = formatTimeWithPreference(AFTERNOON, 'HH:mm');
    expect(result).not.toMatch(/AM|PM/i);
  });

  it('formats correctly for a date near midnight (23:59)', () => {
    const nearMidnight = new Date('2024-01-15T23:59:00');
    expect(formatTimeWithPreference(nearMidnight, 'HH:mm')).toMatch(/^23:59/);
  });
});

// ---------------------------------------------------------------------------
// 12-hour uppercase format (timeFormat === 'h:mm A')
// ---------------------------------------------------------------------------
describe('formatTimeWithPreference — 12h uppercase (h:mm A)', () => {
  it('returns midnight as 12:xx AM', () => {
    const result = formatTimeWithPreference(MIDNIGHT, 'h:mm A');
    expect(result).toMatch(/AM/i);
    expect(result).toMatch(/12/);
  });

  it('returns noon as 12:xx PM', () => {
    const result = formatTimeWithPreference(NOON, 'h:mm A');
    expect(result).toMatch(/PM/i);
    expect(result).toMatch(/12/);
  });

  it('returns morning time with uppercase AM', () => {
    const result = formatTimeWithPreference(MORNING, 'h:mm A');
    expect(result).toMatch(/AM$/);
    expect(result).toMatch(/8:30/);
  });

  it('returns afternoon time with uppercase PM', () => {
    const result = formatTimeWithPreference(AFTERNOON, 'h:mm A');
    expect(result).toMatch(/PM$/);
  });

  it('returns evening time with uppercase PM', () => {
    const result = formatTimeWithPreference(EVENING, 'h:mm A');
    expect(result).toMatch(/PM$/);
  });

  it('does not contain lowercase am/pm when uppercase is selected', () => {
    const result = formatTimeWithPreference(MORNING, 'h:mm A');
    expect(result).not.toMatch(/am|pm/);
  });
});

// ---------------------------------------------------------------------------
// 12-hour lowercase format (timeFormat === 'h:mm a')
// ---------------------------------------------------------------------------
describe('formatTimeWithPreference — 12h lowercase (h:mm a)', () => {
  it('returns midnight as 12:xx am (lowercase)', () => {
    const result = formatTimeWithPreference(MIDNIGHT, 'h:mm a');
    expect(result).toMatch(/am$/);
  });

  it('returns noon as 12:xx pm (lowercase)', () => {
    const result = formatTimeWithPreference(NOON, 'h:mm a');
    expect(result).toMatch(/pm$/);
  });

  it('returns morning with lowercase am suffix', () => {
    const result = formatTimeWithPreference(MORNING, 'h:mm a');
    expect(result).toMatch(/am$/);
  });

  it('returns afternoon with lowercase pm suffix', () => {
    const result = formatTimeWithPreference(AFTERNOON, 'h:mm a');
    expect(result).toMatch(/pm$/);
  });

  it('does not contain uppercase AM/PM when lowercase is selected', () => {
    const result = formatTimeWithPreference(MORNING, 'h:mm a');
    expect(result).not.toMatch(/AM|PM/);
  });
});

// ---------------------------------------------------------------------------
// Time-of-day string format (formatTimeOfDayString)
// ---------------------------------------------------------------------------
describe('formatTimeOfDayString', () => {
  it('formats a morning schedule time in 24-hour format', () => {
    expect(formatTimeOfDayString('08:00', 'HH:mm')).toBe('08:00');
  });

  it('formats an afternoon schedule time in 24-hour format', () => {
    expect(formatTimeOfDayString('14:00', 'HH:mm')).toBe('14:00');
  });

  it('formats a morning schedule time in 12-hour uppercase format', () => {
    expect(formatTimeOfDayString('08:00', 'h:mm A')).toBe('8:00 AM');
  });

  it('formats an afternoon schedule time in 12-hour uppercase format', () => {
    expect(formatTimeOfDayString('14:00', 'h:mm A')).toBe('2:00 PM');
  });

  it('formats a morning schedule time in 12-hour lowercase format', () => {
    expect(formatTimeOfDayString('08:00', 'h:mm a')).toBe('8:00 am');
  });

  it('formats an afternoon schedule time in 12-hour lowercase format', () => {
    expect(formatTimeOfDayString('14:00', 'h:mm a')).toBe('2:00 pm');
  });

  it('handles time strings with seconds', () => {
    expect(formatTimeOfDayString('08:30:00', 'HH:mm')).toBe('08:30');
    expect(formatTimeOfDayString('08:30:00', 'h:mm A')).toBe('8:30 AM');
    expect(formatTimeOfDayString('08:30:00', 'h:mm a')).toBe('8:30 am');
  });

  it('returns empty string for a non-numeric time string', () => {
    expect(formatTimeOfDayString('ab:cd', 'HH:mm')).toBe('');
  });

  it('returns empty string for an empty string', () => {
    expect(formatTimeOfDayString('', 'HH:mm')).toBe('');
  });

  it('returns empty string for a completely malformed string', () => {
    expect(formatTimeOfDayString('not-a-time', 'h:mm A')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Invalid dates
// ---------------------------------------------------------------------------
describe('formatTimeWithPreference — invalid dates', () => {
  it('returns empty string for an invalid Date object', () => {
    expect(formatTimeWithPreference(new Date('invalid'), 'HH:mm')).toBe('');
  });

  it('returns empty string for a NaN timestamp', () => {
    expect(formatTimeWithPreference(new Date(NaN), 'h:mm A')).toBe('');
  });

  it('returns empty string for an undefined date coerced to Date', () => {
    // @ts-expect-error — testing runtime resilience
    expect(formatTimeWithPreference(new Date(undefined), 'h:mm a')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe('formatTimeWithPreference — edge cases', () => {
  it('handles the epoch date', () => {
    const epoch = new Date(0);
    // Should not throw and return a valid time string
    expect(() => formatTimeWithPreference(epoch, 'HH:mm')).not.toThrow();
    expect(formatTimeWithPreference(epoch, 'HH:mm')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('returns the same length string for 24h and 12h', () => {
    const date = new Date('2024-06-15T10:30:00');
    const r24 = formatTimeWithPreference(date, 'HH:mm');
    const r12 = formatTimeWithPreference(date, 'h:mm A');
    // Both should be non-empty
    expect(r24.length).toBeGreaterThan(0);
    expect(r12.length).toBeGreaterThan(0);
  });

  it('24h vs 12h produce different strings for the same date', () => {
    const date = new Date('2024-06-15T14:30:00');
    const r24 = formatTimeWithPreference(date, 'HH:mm');
    const r12 = formatTimeWithPreference(date, 'h:mm A');
    expect(r24).not.toBe(r12);
  });

  it('handles dates across month boundaries', () => {
    const date = new Date('2024-02-29T03:15:00');
    expect(formatTimeWithPreference(date, 'HH:mm')).toMatch(/^03:15/);
    expect(formatTimeWithPreference(date, 'h:mm A')).toMatch(/AM/i);
  });

  it('handles dates with seconds (ignores seconds)', () => {
    const date = new Date('2024-01-15T09:05:30');
    const result = formatTimeWithPreference(date, 'HH:mm');
    // Should show 09:05 (not 09:05:30)
    expect(result).toMatch(/^09:05/);
  });

  it('returns consistent results for the same input', () => {
    const a = formatTimeWithPreference(NOON, 'h:mm A');
    const b = formatTimeWithPreference(NOON, 'h:mm A');
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Recording-zone rendering (issue #2033)
// ---------------------------------------------------------------------------
import { formatTimeInZone, sleepEntryZone } from '@/utils/timeFormatters';

describe('formatTimeInZone', () => {
  // DST-unambiguous instant: mid-June (Tokyo has no DST anyway; New York is
  // solidly in EDT).
  const INSTANT = '2024-06-15T15:45:00Z';

  it('renders in a named IANA zone', () => {
    // 15:45 UTC = 00:45 next day in Tokyo (+9)
    expect(
      formatTimeInZone(INSTANT, { kind: 'tz', tz: 'Asia/Tokyo' }, 'HH:mm')
    ).toBe('00:45');
  });

  it('renders with a fixed UTC offset, honoring the 24h preference', () => {
    expect(
      formatTimeInZone(INSTANT, { kind: 'offset', minutes: -240 }, 'HH:mm')
    ).toBe('11:45');
  });

  it('honors the 12h preference', () => {
    expect(
      formatTimeInZone(INSTANT, { kind: 'offset', minutes: -240 }, 'h:mm A')
    ).toMatch(/^11:45\s?AM$/);
  });

  it('returns empty string for an unparseable instant', () => {
    expect(
      formatTimeInZone('garbage', { kind: 'tz', tz: 'Asia/Tokyo' }, 'HH:mm')
    ).toBe('');
  });

  it('does not inherit the PreferencesContext literal-date-string bug for …T00:0…Z instants', () => {
    // PreferencesContext.isLiteralDateString treats any "…T00:0…Z" instant as
    // a bare calendar date and renders 00:00. This path must project it.
    // 00:05 UTC = 20:05 previous day in EDT (-4).
    expect(
      formatTimeInZone(
        '2024-06-15T00:05:00Z',
        { kind: 'tz', tz: 'America/New_York' },
        'HH:mm'
      )
    ).toBe('20:05');
  });
});

describe('sleepEntryZone', () => {
  it('prefers the entry IANA zone', () => {
    expect(
      sleepEntryZone(
        { record_timezone: 'Asia/Tokyo', record_utc_offset_minutes: -300 },
        'UTC'
      )
    ).toEqual({ kind: 'tz', tz: 'Asia/Tokyo' });
  });

  it('falls back to the entry offset for an invalid or missing zone', () => {
    expect(
      sleepEntryZone(
        { record_timezone: 'Not/AZone', record_utc_offset_minutes: -300 },
        'UTC'
      )
    ).toEqual({ kind: 'offset', minutes: -300 });
    expect(
      sleepEntryZone(
        { record_timezone: null, record_utc_offset_minutes: 0 },
        'UTC'
      )
    ).toEqual({ kind: 'offset', minutes: 0 });
  });

  it('falls back to the profile timezone for zone-less entries', () => {
    expect(sleepEntryZone({}, 'America/Chicago')).toEqual({
      kind: 'tz',
      tz: 'America/Chicago',
    });
    expect(
      sleepEntryZone(
        { record_timezone: null, record_utc_offset_minutes: null },
        'America/Chicago'
      )
    ).toEqual({ kind: 'tz', tz: 'America/Chicago' });
  });
});
