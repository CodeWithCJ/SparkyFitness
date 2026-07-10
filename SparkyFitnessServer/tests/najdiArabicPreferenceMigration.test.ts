import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  'db/migrations/20260710170000_set_arabic_language_default.sql'
);

describe('Najdi-first preference migration', () => {
  it('starts newly created preference rows in Arabic without rewriting existing users', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(
      /ALTER\s+TABLE\s+public\.user_preferences[\s\S]*ALTER\s+COLUMN\s+language\s+SET\s+DEFAULT\s+'ar'/i
    );
    expect(sql).not.toMatch(/UPDATE\s+public\.user_preferences/i);
  });
});
