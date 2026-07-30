import { formatTimeOfDay, formatTimeLabel } from '../../src/utils/entryTimeDisplay';

// Local-timezone dates (no Z suffix) so assertions are timezone-independent.
const MIDNIGHT_ISO = '2024-01-15T00:00:00';
const NOON_ISO = '2024-01-15T12:00:00';
const MORNING_ISO = '2024-01-15T08:30:00';
const AFTERNOON_ISO = '2024-01-15T14:45:00';
const EVENING_ISO = '2024-01-15T19:15:00';

// ---------------------------------------------------------------------------
// Null / undefined / invalid input
// ---------------------------------------------------------------------------
describe('formatTimeOfDay — null/undefined/invalid', () => {
  it('returns null for null input', () => {
    expect(formatTimeOfDay(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(formatTimeOfDay(undefined)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(formatTimeOfDay('')).toBeNull();
  });

  it('returns null for an invalid date string', () => {
    expect(formatTimeOfDay('not-a-date')).toBeNull();
  });

  it('returns null for an invalid Date object', () => {
    expect(formatTimeOfDay(new Date('invalid'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 24-hour format
// ---------------------------------------------------------------------------
describe('formatTimeOfDay — 24h (HH:mm)', () => {
  it('returns midnight as 00:xx', () => {
    const result = formatTimeOfDay(MIDNIGHT_ISO, 'HH:mm');
    expect(result).toMatch(/^00:/);
    expect(result).not.toMatch(/AM|PM/i);
  });

  it('returns noon as 12:xx in 24h', () => {
    const result = formatTimeOfDay(NOON_ISO, 'HH:mm');
    expect(result).toMatch(/^12:/);
    expect(result).not.toMatch(/AM|PM/i);
  });

  it('returns afternoon in 24h (14:xx)', () => {
    const result = formatTimeOfDay(AFTERNOON_ISO, 'HH:mm');
    expect(result).toMatch(/^14:45/);
    expect(result).not.toMatch(/AM|PM/i);
  });

  it('returns evening in 24h (19:xx)', () => {
    const result = formatTimeOfDay(EVENING_ISO, 'HH:mm');
    expect(result).toMatch(/^19:15/);
    expect(result).not.toMatch(/AM|PM/i);
  });
});

// ---------------------------------------------------------------------------
// 12-hour format
// ---------------------------------------------------------------------------
describe('formatTimeOfDay — 12h uppercase (h:mm A)', () => {
  it('returns midnight as 12:xx AM', () => {
    const result = formatTimeOfDay(MIDNIGHT_ISO, 'h:mm A');
    expect(result).toMatch(/AM$/);
    expect(result).toMatch(/12/);
  });

  it('returns noon as 12:xx PM', () => {
    const result = formatTimeOfDay(NOON_ISO, 'h:mm A');
    expect(result).toMatch(/PM$/);
  });

  it('returns morning with AM', () => {
    const result = formatTimeOfDay(MORNING_ISO, 'h:mm A');
    expect(result).toMatch(/AM$/);
    expect(result).toMatch(/8:30/);
  });

  it('returns afternoon with PM', () => {
    const result = formatTimeOfDay(AFTERNOON_ISO, 'h:mm A');
    expect(result).toMatch(/PM$/);
  });

  it('returns evening with PM', () => {
    const result = formatTimeOfDay(EVENING_ISO, 'h:mm A');
    expect(result).toMatch(/PM$/);
  });

  it('does not contain lowercase am/pm when uppercase is selected', () => {
    const result = formatTimeOfDay(MORNING_ISO, 'h:mm A');
    expect(result).not.toMatch(/am|pm/);
  });
});

describe('formatTimeOfDay — 12h lowercase (h:mm a)', () => {
  it('returns midnight as 12:xx am', () => {
    const result = formatTimeOfDay(MIDNIGHT_ISO, 'h:mm a');
    expect(result).toMatch(/am$/);
  });

  it('returns noon as 12:xx pm', () => {
    const result = formatTimeOfDay(NOON_ISO, 'h:mm a');
    expect(result).toMatch(/pm$/);
  });

  it('returns morning with am', () => {
    const result = formatTimeOfDay(MORNING_ISO, 'h:mm a');
    expect(result).toMatch(/am$/);
    expect(result).toMatch(/8:30/);
  });

  it('returns afternoon with pm', () => {
    const result = formatTimeOfDay(AFTERNOON_ISO, 'h:mm a');
    expect(result).toMatch(/pm$/);
  });

  it('returns evening with pm', () => {
    const result = formatTimeOfDay(EVENING_ISO, 'h:mm a');
    expect(result).toMatch(/pm$/);
  });

  it('does not contain uppercase AM/PM when lowercase is selected', () => {
    const result = formatTimeOfDay(MORNING_ISO, 'h:mm a');
    expect(result).not.toMatch(/AM|PM/);
  });
});

// ---------------------------------------------------------------------------
// Date object vs ISO string
// ---------------------------------------------------------------------------
describe('formatTimeOfDay — Date object vs ISO string', () => {
  it('accepts a Date object', () => {
    const date = new Date(MORNING_ISO);
    expect(formatTimeOfDay(date, 'HH:mm')).toMatch(/^08:30/);
  });

  it('produces same result for Date and ISO string', () => {
    const date = new Date(AFTERNOON_ISO);
    const fromDate = formatTimeOfDay(date, 'HH:mm');
    const fromString = formatTimeOfDay(AFTERNOON_ISO, 'HH:mm');
    expect(fromDate).toBe(fromString);
  });
});

// ---------------------------------------------------------------------------
// Default timeFormat (no second arg)
// ---------------------------------------------------------------------------
describe('formatTimeOfDay — default (no timeFormat)', () => {
  it('returns a non-null string when no timeFormat provided', () => {
    const result = formatTimeOfDay(NOON_ISO);
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(0);
  });

  it('returns same result for null/undefined timeFormat', () => {
    const a = formatTimeOfDay(NOON_ISO, null);
    const b = formatTimeOfDay(NOON_ISO, undefined);
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// formatTimeLabel
// ---------------------------------------------------------------------------
describe('formatTimeLabel', () => {
  it('returns null for null/undefined input', () => {
    expect(formatTimeLabel(null)).toBeNull();
    expect(formatTimeLabel(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(formatTimeLabel('')).toBeNull();
  });

  it('returns null for malformed time string', () => {
    expect(formatTimeLabel('not-a-time')).toBeNull();
  });

  it('formats 08:30 as morning time in 24h', () => {
    const result = formatTimeLabel('08:30', 'HH:mm');
    expect(result).toMatch(/^08:30/);
  });

  it('formats 14:45 as afternoon in 12h with uppercase PM', () => {
    const result = formatTimeLabel('14:45', 'h:mm A');
    expect(result).toMatch(/PM$/);
  });

  it('formats 00:00 as midnight in 12h with uppercase AM', () => {
    const result = formatTimeLabel('00:00', 'h:mm A');
    expect(result).toMatch(/AM$/);
    expect(result).toMatch(/12/);
  });

  it('formats 14:45 as afternoon in 12h with lowercase pm', () => {
    const result = formatTimeLabel('14:45', 'h:mm a');
    expect(result).toMatch(/pm$/);
  });

  it('formats 00:00 as midnight in 12h with lowercase am', () => {
    const result = formatTimeLabel('00:00', 'h:mm a');
    expect(result).toMatch(/am$/);
  });

  it('handles time strings with seconds (HH:mm:ss)', () => {
    const result = formatTimeLabel('14:30:00', 'HH:mm');
    expect(result).toMatch(/^14:30/);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe('formatTimeOfDay — edge cases', () => {
  it('handles middle-of-night times (03:00)', () => {
    const date = new Date('2024-06-21T03:00:00');
    expect(formatTimeOfDay(date, 'HH:mm')).toMatch(/^03:00/);
    expect(formatTimeOfDay(date, 'h:mm A')).toMatch(/AM/i);
  });

  it('handles last minute of the day (23:59)', () => {
    const date = new Date('2024-01-15T23:59:00');
    expect(formatTimeOfDay(date, 'HH:mm')).toMatch(/^23:59/);
  });

  it('first minute of the day (00:01)', () => {
    const date = new Date('2024-01-15T00:01:00');
    expect(formatTimeOfDay(date, 'HH:mm')).toMatch(/^00:01/);
  });

  it('24h vs 12h produce different strings', () => {
    const r24 = formatTimeOfDay(AFTERNOON_ISO, 'HH:mm');
    const r12 = formatTimeOfDay(AFTERNOON_ISO, 'h:mm A');
    expect(r24).not.toBe(r12);
  });

  it('returns consistent results for same input', () => {
    const a = formatTimeOfDay(MORNING_ISO, 'HH:mm');
    const b = formatTimeOfDay(MORNING_ISO, 'HH:mm');
    expect(a).toBe(b);
  });

  it('handles a future timestamp without error', () => {
    const future = '2030-12-25T10:30:00';
    expect(() => formatTimeOfDay(future, 'HH:mm')).not.toThrow();
    expect(formatTimeOfDay(future, 'HH:mm')).toMatch(/^10:30/);
  });

  it('handles a Date created from milliseconds', () => {
    // 2024-06-15T08:30:00 in milliseconds
    const ms = new Date('2024-06-15T08:30:00').getTime();
    expect(() => formatTimeOfDay(new Date(ms), 'HH:mm')).not.toThrow();
  });
});
