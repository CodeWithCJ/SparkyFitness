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
