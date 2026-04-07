/**
 * Tests for date-shifting bugs caused by .toISOString().split('T')[0]
 * on Date objects created by the pg driver for DATE columns.
 *
 * pg parses DATE columns via `new Date(year, month-1, day)` (local midnight).
 * On a non-UTC server, .toISOString() converts to UTC and the date can shift.
 *
 * Run with: TZ=Pacific/Auckland npx jest --testPathPatterns=dateShifting
 * to verify the fix holds on non-UTC servers.
 */

const { localDateToDay } = require('@workspace/shared');

// Simulate how pg creates a Date from a DATE column value like '2024-06-15'
function simulatePgDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d); // local midnight — this is what pg does
}

// ---------------------------------------------------------------------------
// Core: localDateToDay is safe regardless of server TZ
// ---------------------------------------------------------------------------
describe('pg DATE → string round-trip with localDateToDay', () => {
  const dates = ['2024-01-01', '2024-06-15', '2024-12-31', '2025-03-10'];

  it.each(dates)('%s: localDateToDay preserves the date', (dateStr) => {
    const pgDate = simulatePgDate(dateStr);
    expect(localDateToDay(pgDate)).toBe(dateStr);
  });
});

// ---------------------------------------------------------------------------
// reportService patterns — entry.entry_date from pg as Date
// ---------------------------------------------------------------------------
describe('reportService: exercise report date conversions (TO_CHAR strings)', () => {
  // reportRepository returns entry_date as TO_CHAR(..., 'YYYY-MM-DD') strings,
  // so these should be used directly — no Date conversion needed.

  it('muscle group recovery: uses string entry_date directly', () => {
    const entry = { entry_date: '2024-06-15' };
    const recoveryData = {};
    const muscle = 'chest';
    if (!recoveryData[muscle] || entry.entry_date > recoveryData[muscle]) {
      recoveryData[muscle] = entry.entry_date;
    }
    expect(recoveryData[muscle]).toBe('2024-06-15');
  });

  it('unique workout day counting with string dates', () => {
    const entries = [
      { entry_date: '2024-06-15' },
      { entry_date: '2024-06-15' },
      { entry_date: '2024-06-16' },
    ];

    const days = new Set();
    entries.forEach((entry) => {
      days.add(entry.entry_date);
    });

    expect([...days].sort()).toEqual(['2024-06-15', '2024-06-16']);
  });
});

// ---------------------------------------------------------------------------
// exerciseEntryHistoryService — _dateToString (line 17)
// ---------------------------------------------------------------------------
describe('exerciseEntryHistoryService: _dateToString', () => {
  function _dateToString(value) {
    if (value === null) return null;
    if (value instanceof Date) return localDateToDay(value);
    return String(value);
  }

  it('preserves date for Date objects', () => {
    const pgDate = simulatePgDate('2024-06-15');
    expect(_dateToString(pgDate)).toBe('2024-06-15');
  });

  it('passes through strings unchanged', () => {
    expect(_dateToString('2024-06-15')).toBe('2024-06-15');
  });

  it('returns null for null', () => {
    expect(_dateToString(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// sleepScienceService — entry.date conversion
// ---------------------------------------------------------------------------
describe('sleepScienceService: date conversion', () => {
  function sleepDateToString(entry) {
    return typeof entry.date === 'string'
      ? entry.date
      : localDateToDay(entry.date);
  }

  it('string dates pass through correctly', () => {
    expect(sleepDateToString({ date: '2024-06-15' })).toBe('2024-06-15');
  });

  it('Date objects preserve the date', () => {
    const pgDate = simulatePgDate('2024-06-15');
    expect(sleepDateToString({ date: pgDate })).toBe('2024-06-15');
  });
});

// ---------------------------------------------------------------------------
// foodTemplate / exerciseTemplate — start_date, end_date from pg
// ---------------------------------------------------------------------------
describe('template date conversions (foodTemplate/exerciseTemplate)', () => {
  function templateDateToString(dateValue) {
    return typeof dateValue === 'string'
      ? dateValue.slice(0, 10)
      : localDateToDay(dateValue);
  }

  it('string dates work correctly', () => {
    expect(templateDateToString('2024-06-15')).toBe('2024-06-15');
  });

  it('Date objects from pg preserve the date', () => {
    const pgDate = simulatePgDate('2024-06-15');
    expect(templateDateToString(pgDate)).toBe('2024-06-15');
  });
});

// ---------------------------------------------------------------------------
// fitbitDataProcessor — entry_date normalization
// ---------------------------------------------------------------------------
describe('fitbitDataProcessor: entry_date normalization', () => {
  it('Date objects preserve the date', () => {
    let dateKey = simulatePgDate('2024-06-15');
    if (dateKey instanceof Date) {
      dateKey = localDateToDay(dateKey);
    }
    expect(dateKey).toBe('2024-06-15');
  });

  it('string dates with T are split correctly', () => {
    let dateKey = '2024-06-15T00:00:00';
    if (typeof dateKey === 'string' && dateKey.includes('T')) {
      dateKey = dateKey.split('T')[0];
    }
    expect(dateKey).toBe('2024-06-15');
  });
});

// ---------------------------------------------------------------------------
// foodEntryService — Date.UTC path (should always be safe)
// ---------------------------------------------------------------------------
describe('foodEntryService: Date.UTC prior day calculation', () => {
  it('correctly computes prior day using Date.UTC', () => {
    const targetDate = '2024-06-15';
    const [yearStr, monthStr, dayStr] = targetDate.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    const priorDay = new Date(Date.UTC(year, month - 1, day));
    priorDay.setUTCDate(priorDay.getUTCDate() - 1);
    const sourceDate = priorDay.toISOString().split('T')[0];

    expect(sourceDate).toBe('2024-06-14'); // one day before — correct
  });
});
