import { describe, expect, it } from 'vitest';
import pg from 'pg';
// Importing poolManager registers the DATE type parser as a module side effect.
// The connection pools are constructed lazily and never connect during this test.
import '../db/poolManager.js';

/**
 * Regression test for issue #1516: diary entries displayed one day off.
 *
 * Every `date` column (food_entries.entry_date, etc.) is read through node-pg.
 * Without a custom parser, pg builds a JS Date at the server process's LOCAL
 * midnight; serializing that Date to JSON converts it to UTC and rolls the
 * calendar day backward on servers running ahead of UTC (e.g. TZ=Europe/Berlin),
 * so '2026-06-12' reached clients as '2026-06-11T22:00:00.000Z' and displayed as
 * the previous day. The database value was always correct — only the read-back
 * was shifted.
 *
 * poolManager registers a DATE (oid 1082) parser that returns the raw
 * 'YYYY-MM-DD' string, so the day is stable regardless of the process timezone.
 *
 * Run under a non-UTC zone to prove the fix holds on the affected servers:
 *   TZ=Europe/Berlin pnpm exec vitest run tests/dateColumnParser.test.ts
 */
describe('pg DATE column parser (issue #1516)', () => {
  const parseDate = pg.types.getTypeParser(pg.types.builtins.DATE);

  it('returns the raw YYYY-MM-DD string, not a Date', () => {
    const value = parseDate('2026-06-12');
    expect(typeof value).toBe('string');
    expect(value).toBe('2026-06-12');
  });

  it('does not shift the calendar day when serialized into an API response', () => {
    // This is the exact transformation that produced the bug: a date-column value
    // round-tripped through a JSON response body.
    const apiBody = JSON.stringify({ entry_date: parseDate('2026-06-12') });
    expect(JSON.parse(apiBody).entry_date).toBe('2026-06-12');
  });

  it.each(['2024-01-01', '2026-06-12', '2026-12-31'])(
    'preserves %s exactly',
    (day) => {
      expect(parseDate(day)).toBe(day);
    }
  );
});
