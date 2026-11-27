import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  path.join(__dirname, '../db/migrations/20261125120000_create_ai_coaches.sql'),
  'utf-8'
);

describe('create_ai_coaches migration', () => {
  it('never drops the constraint coach_nudges depends on, so it can run twice', () => {
    // coach_nudges' foreign key needs this unique constraint; dropping it
    // fails on a database that already holds the tables.
    expect(sql).not.toMatch(
      /DROP CONSTRAINT IF EXISTS uq_user_coaches_owner_id/
    );
    expect(sql).toMatch(/conname = 'uq_user_coaches_owner_id'/);
  });

  it('adds every later-phase column with IF NOT EXISTS', () => {
    const adds = sql.match(/ADD COLUMN(?! IF NOT EXISTS)/g);
    expect(adds).toBeNull();
  });
});
