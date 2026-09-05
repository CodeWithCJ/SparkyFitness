import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { foodVolumeToMl, getUnitCategory } from '@workspace/shared';

// Phase 2 (#1557/#1629): the SQL sf_volume_unit_to_ml() function and the
// shared TS foodVolumeToMl() must agree key-for-key, or the server's water
// total and the client's per-entry preview will silently disagree. This test
// parses the actual CASE arms out of the migration file rather than
// hardcoding a second copy of the mapping, so the two cannot drift apart
// without this test catching it.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATION_PATH = path.join(
  __dirname,
  '../db/migrations/20260905150000_add_caffeine_alcohol_water_and_container_links.sql'
);

function parseSqlCaseArms(): Record<string, number> {
  const sql = readFileSync(MIGRATION_PATH, 'utf-8');
  const arms: Record<string, number> = {};
  const armPattern = /WHEN\s+'([^']+)'\s+THEN\s+([0-9.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = armPattern.exec(sql)) !== null) {
    arms[match[1]!] = Number(match[2]);
  }
  return arms;
}

describe('sf_volume_unit_to_ml (SQL) vs foodVolumeToMl (shared TS) parity', () => {
  const sqlArms = parseSqlCaseArms();

  it('the migration file actually has CASE arms to compare against', () => {
    // Guards against the regex silently matching nothing if the migration's
    // formatting ever changes, which would make every "parity" assertion
    // below vacuously true.
    expect(Object.keys(sqlArms).length).toBeGreaterThan(5);
  });

  it('every SQL unit converts to the same ml value via foodVolumeToMl', () => {
    for (const [unit, mlPerUnit] of Object.entries(sqlArms)) {
      expect(foodVolumeToMl(1, unit), `mismatch for unit "${unit}"`).toBe(
        mlPerUnit
      );
    }
  });

  it('oz maps to NULL in the SQL CASE and to non-volume in the shared TS table', () => {
    expect(sqlArms['oz']).toBeUndefined();
    expect(getUnitCategory('oz')).toBe('weight');
    expect(foodVolumeToMl(4, 'oz')).toBeNull();
  });

  it('l, liter, and liters all resolve to 1000 ml in both', () => {
    for (const unit of ['l', 'liter', 'liters']) {
      expect(sqlArms[unit]).toBe(1000);
      expect(foodVolumeToMl(1, unit)).toBe(1000);
    }
  });

  it('fl oz, floz, and fl_oz all resolve to 29.5735 ml in both', () => {
    for (const unit of ['fl oz', 'floz', 'fl_oz']) {
      expect(sqlArms[unit]).toBeCloseTo(29.5735);
      expect(foodVolumeToMl(1, unit)).toBeCloseTo(29.5735);
    }
  });

  it('a 12 fl oz can of cola credits 354.882 ml, not 0 (#1629)', () => {
    expect(foodVolumeToMl(12, 'fl oz')).toBeCloseTo(354.882, 2);
  });

  it('ml is the identity conversion', () => {
    expect(foodVolumeToMl(250, 'ml')).toBe(250);
  });

  it('a non-volume unit like "piece" or "g" returns null, not 0', () => {
    expect(foodVolumeToMl(1, 'piece')).toBeNull();
    expect(foodVolumeToMl(100, 'g')).toBeNull();
  });
});
