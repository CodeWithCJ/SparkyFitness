import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  here,
  '../db/migrations/20261021000000_multiple_mood_checkins.sql'
);

/**
 * Migration 20261021000000 lets a day hold several mood check-ins. The old
 * one-per-day unique is a constraint on most installs and an index on others,
 * so both drops are required, constraint first.
 */
describe('multiple mood check-ins migration', () => {
  const raw = readFileSync(MIGRATION, 'utf8');
  const sql = raw
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .replace(/\s+/g, ' ');

  it("adds entry_timestamp, backfills it on each row's own day, then makes it required with a default", () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS entry_timestamp TIMESTAMPTZ/i
    );
    expect(sql).toMatch(/ALTER COLUMN entry_timestamp SET NOT NULL/i);
    expect(sql).toMatch(/ALTER COLUMN entry_timestamp SET DEFAULT now\(\)/i);
    expect(sql.search(/SET entry_timestamp = CASE/i)).toBeLessThan(
      sql.search(/entry_timestamp SET NOT NULL/i)
    );
    // created_at no longer stands in for every row's time.
    expect(sql).not.toMatch(/SET entry_timestamp = created_at/i);
  });

  it('keeps created_at when it is on entry_date in the user timezone, else local noon', () => {
    expect(sql).toMatch(
      /SET entry_timestamp = CASE WHEN \(m\.created_at AT TIME ZONE placed\.tz\)::date = m\.entry_date THEN m\.created_at ELSE \(m\.entry_date \+ time '12:00'\) AT TIME ZONE placed\.tz END/i
    );
    // Only rows without a time yet, so a re-run changes nothing.
    expect(sql).toMatch(/WHERE e\.entry_timestamp IS NULL/i);
  });

  it('reads the zone from user_preferences and falls back to UTC for a missing or unknown one', () => {
    expect(sql).toMatch(
      /SELECT user_id, timezone AS tz FROM public\.user_preferences WHERE timezone IN \(SELECT name FROM pg_timezone_names\)/i
    );
    expect(sql).toMatch(
      /COALESCE\(z\.tz, 'UTC'\) AS tz FROM public\.mood_entries e LEFT JOIN zones z ON z\.user_id = e\.user_id/i
    );
  });

  it('adds source and marks Garmin-derived rows', () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'/i
    );
    expect(sql).toMatch(
      /SET source = 'garmin' WHERE notes LIKE 'Derived from Garmin Stress:%'/i
    );
  });

  it('makes mood_value optional', () => {
    expect(sql).toMatch(/ALTER COLUMN mood_value DROP NOT NULL/i);
  });

  it('requires some content, where whitespace-only notes and blank tags do not count', () => {
    // Matches hasMoodContent: notes need a non-space character, and tags count
    // only when one of them has one (so [""] is empty). The notes branch keeps
    // its NULL guard because a NULL CHECK result would let the row through.
    const check =
      /ADD CONSTRAINT mood_entries_has_content CHECK \( ?mood_value IS NOT NULL OR energy_value IS NOT NULL OR focus_value IS NOT NULL OR \(notes IS NOT NULL AND notes ~ '\\S'\) OR array_to_string\(mood_tags, ''\) ~ '\\S' ?\);/i;
    expect(sql).toMatch(check);
    expect(sql).not.toMatch(/btrim\(notes\)/i);
    expect(sql).not.toMatch(/cardinality\(mood_tags\)/i);
  });

  it('allows only the three known sources', () => {
    const drop = sql.search(
      /DROP CONSTRAINT IF EXISTS mood_entries_known_source;/i
    );
    const add = sql.search(
      /ADD CONSTRAINT mood_entries_known_source CHECK \(source IN \('manual', 'garmin', 'import'\)\);/i
    );
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(add).toBeGreaterThan(drop);
  });

  it('runs as one transaction', () => {
    expect(sql).not.toMatch(/NOT VALID|VALIDATE CONSTRAINT/i);
  });

  it('drops the old unique as a constraint first, then as an index', () => {
    const dropConstraint = sql.search(
      /ALTER TABLE public\.mood_entries DROP CONSTRAINT IF EXISTS unique_user_date;/i
    );
    const dropIndex = sql.search(
      /DROP INDEX IF EXISTS public\.unique_user_date;/i
    );
    expect(dropConstraint).toBeGreaterThanOrEqual(0);
    expect(dropIndex).toBeGreaterThan(dropConstraint);
  });

  it('keeps one derived row per source per day and indexes the day lookup', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS mood_entries_derived_source_day ON public\.mood_entries \(user_id, entry_date, source\) WHERE source <> 'manual';/i
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS mood_entries_user_day_time ON public\.mood_entries \(user_id, entry_date, entry_timestamp\);/i
    );
  });
});
