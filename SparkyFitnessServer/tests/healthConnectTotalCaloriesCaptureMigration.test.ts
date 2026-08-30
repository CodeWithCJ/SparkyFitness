import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  here,
  '../db/migrations/20260829171500_add_total_calories_capture_time.sql'
);

describe('Health Connect total-calorie capture-time migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('adds a dedicated capture timestamp to the existing daily summary table', () => {
    expect(sql).toMatch(
      /ALTER TABLE\s+daily_health_metrics[\s\S]*ADD COLUMN IF NOT EXISTS\s+total_calories_captured_at\s+TIMESTAMP WITH TIME ZONE/i
    );
  });

  it('backfills existing totals from the best available audit timestamp', () => {
    expect(sql).toMatch(
      /SET\s+total_calories_captured_at\s*=\s*COALESCE\(updated_at, created_at\)[\s\S]*WHERE\s+total_calories\s+IS NOT NULL/i
    );
  });
});
