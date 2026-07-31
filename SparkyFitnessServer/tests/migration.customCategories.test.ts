// Static validation of the custom-category visibility/order migration. Runs
// without a live database (the DB-backed `test:migrations` runner needs a real
// Postgres): it pins the idempotency guards, defaults, deterministic backfill,
// ordering index, and column comments so a miswritten migration is caught at
// review/test time rather than first boot.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIGRATION_FILE =
  '20260731000000_add_custom_category_visibility_order.sql';
const MIGRATION_PATH = `db/migrations/${MIGRATION_FILE}`;
const MIGRATION_SQL = readFileSync(MIGRATION_PATH, 'utf8');

const newestExistingMigration = readdirSync('db/migrations')
  .filter((file) => file.endsWith('.sql') && file !== MIGRATION_FILE)
  .sort()
  .at(-1)!;

describe('20260731000000_add_custom_category_visibility_order.sql', () => {
  it('sorts after every existing migration (fresh-boot order is deterministic)', () => {
    expect(MIGRATION_FILE > newestExistingMigration).toBe(true);
  });

  it('adds is_visible as NOT NULL boolean defaulting to true', () => {
    expect(MIGRATION_SQL).toMatch(
      /ADD COLUMN is_visible boolean NOT NULL DEFAULT true/i
    );
  });

  it('adds sort_order as NOT NULL integer defaulting to 100', () => {
    expect(MIGRATION_SQL).toMatch(
      /ADD COLUMN sort_order integer NOT NULL DEFAULT 100/i
    );
  });

  it('guards the column additions so a re-run is a no-op', () => {
    expect(MIGRATION_SQL).toMatch(
      /information_schema\.columns[\s\S]*?column_name = 'is_visible'/
    );
    expect(MIGRATION_SQL).toMatch(
      /IF NOT EXISTS\s*\(\s*SELECT 1 FROM information_schema\.columns/
    );
    expect(MIGRATION_SQL).toMatch(
      /ALTER TABLE custom_categories\s+ADD COLUMN is_visible/
    );
    expect(MIGRATION_SQL).toMatch(
      /ALTER TABLE custom_categories\s+ADD COLUMN sort_order/
    );
  });

  it('backfills existing rows deterministically per user (row_number * 10, created_at then id)', () => {
    expect(MIGRATION_SQL).toMatch(
      /ROW_NUMBER\(\) OVER\s*\(\s*PARTITION BY user_id ORDER BY created_at ASC, id ASC\s*\)/
    );
    expect(MIGRATION_SQL).toMatch(/SET sort_order = sub\.rn \* 10/);
    expect(MIGRATION_SQL).toMatch(/WHERE sort_order = 100/);
  });

  it('never overwrites consciously-set values on a partial re-run', () => {
    // Backfill only touches rows still holding the migration default (100), so
    // deliberately assigned orders survive a re-run of an already-patched DB.
    expect(MIGRATION_SQL).toMatch(/UPDATE custom_categories\s+SET sort_order/);
    expect(MIGRATION_SQL).toMatch(/WHERE sort_order = 100/);
    expect(MIGRATION_SQL).not.toMatch(
      /UPDATE custom_categories[\s\S]*WHERE true/i
    );
  });

  it('documents the visibility and ordering semantics as column comments', () => {
    expect(MIGRATION_SQL).toMatch(
      /COMMENT ON COLUMN public\.custom_categories\.is_visible IS/
    );
    expect(MIGRATION_SQL).toMatch(
      /COMMENT ON COLUMN public\.custom_categories\.sort_order IS/
    );
  });

  it('creates the ordering index (user_id, sort_order, created_at, id)', () => {
    expect(MIGRATION_SQL).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_custom_categories_user_sort_order\s+ON custom_categories \(user_id, sort_order, created_at, id\)/i
    );
  });
});
