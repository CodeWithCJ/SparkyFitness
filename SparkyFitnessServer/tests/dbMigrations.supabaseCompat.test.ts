import { afterEach, describe, expect, it } from 'vitest';
import { prepareMigrationSqlForRuntime } from '../utils/dbMigrations.js';

describe('prepareMigrationSqlForRuntime', () => {
  afterEach(() => {
    delete process.env.SPARKY_FITNESS_DB_HOST;
    delete process.env.SPARKY_FITNESS_DB_PROVIDER;
  });

  it('leaves normal Postgres migrations unchanged', () => {
    const sql = 'CREATE SCHEMA IF NOT EXISTS auth; SELECT * FROM auth.users;';

    expect(
      prepareMigrationSqlForRuntime('20250703170640_InitialDB.sql', sql)
    ).toBe(sql);
  });

  it('moves legacy auth.users references away from Supabase reserved auth schema before Better Auth cutover', () => {
    process.env.SPARKY_FITNESS_DB_HOST = 'db.example.supabase.co';

    const sql = [
      'CREATE SCHEMA IF NOT EXISTS auth;',
      'CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);',
      'ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);',
    ].join('\n');

    expect(
      prepareMigrationSqlForRuntime('20250703170640_InitialDB.sql', sql)
    ).toBe(
      [
        'CREATE SCHEMA IF NOT EXISTS legacy_auth;',
        'CREATE TABLE IF NOT EXISTS legacy_auth.users (id uuid PRIMARY KEY);',
        'ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES legacy_auth.users(id);',
      ].join('\n')
    );
  });

  it('keeps the Better Auth cutover reading from the legacy Supabase shim', () => {
    process.env.SPARKY_FITNESS_DB_PROVIDER = 'supabase';

    const sql = 'INSERT INTO "user" (id) SELECT id FROM auth.users;';

    expect(
      prepareMigrationSqlForRuntime(
        '20260125000000_better_auth_migration.sql',
        sql
      )
    ).toBe('INSERT INTO "user" (id) SELECT id FROM legacy_auth.users;');
  });

  it('points post-cutover auth.users references at the Better Auth user table on Supabase', () => {
    process.env.SPARKY_FITNESS_DB_HOST = 'db.example.supabase.co';

    const sql =
      'CREATE TABLE custom_meals (user_id uuid REFERENCES auth.users(id));';

    expect(
      prepareMigrationSqlForRuntime(
        '202601280001_add_show_hide_to_meals.sql',
        sql
      )
    ).toBe('CREATE TABLE custom_meals (user_id uuid REFERENCES "user"(id));');
  });
});
