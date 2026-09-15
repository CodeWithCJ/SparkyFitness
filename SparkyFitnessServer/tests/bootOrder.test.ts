/**
 * Boot Order Guard
 *
 * WHY THIS EXISTS
 * ---------------
 * Better Auth validates the database schema eagerly, the moment `betterAuth()`
 * is constructed at `auth.ts` module scope, and it caches a mismatch for the
 * lifetime of the process (only its own migration runner invalidates that
 * cache, never the raw SQL migrations this repo uses).
 *
 * While migrations ran from inside `SparkyFitnessServer.ts`, that check read the
 * pre-migration schema on the first boot after an upgrade, so every
 * `/api/auth/*` request returned "Database schema mismatch" until the container
 * was restarted — issues #2469 and #2470.
 *
 * The invariant is therefore: migrations must complete before ANY application
 * module is imported. `index.ts` is the only place that can hold that
 * guarantee, so these assertions are on source text (the same approach as
 * tests/uploadsStaticMount.test.ts) — `index.ts` boots a real server and cannot
 * be imported here.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const indexSource = fs.readFileSync(
  path.resolve(__dirname, '../index.ts'),
  'utf8'
);
const serverSource = fs.readFileSync(
  path.resolve(__dirname, '../SparkyFitnessServer.ts'),
  'utf8'
);

describe('Boot order: migrations run before any application module loads', () => {
  it('applies migrations in index.ts before importing the server module', () => {
    const migrationsAt = indexSource.indexOf('await initializeDatabase()');
    const serverImportAt = indexSource.indexOf(
      "await import('./SparkyFitnessServer.js')"
    );

    expect(
      migrationsAt,
      'index.ts must await initializeDatabase()'
    ).toBeGreaterThan(-1);
    expect(
      serverImportAt,
      'index.ts must import SparkyFitnessServer.js'
    ).toBeGreaterThan(-1);

    expect(
      migrationsAt,
      'initializeDatabase() must finish BEFORE the server module is imported, or Better Auth caches a schema mismatch for the life of the process'
    ).toBeLessThan(serverImportAt);
  });

  it('imports the database initializer dynamically, not statically', () => {
    // db/poolManager.ts builds both pg pools at module load from process.env.
    // A static import here is hoisted above dotenv.config()/loadSecrets() and
    // would freeze the pools with empty connection config.
    expect(
      indexSource,
      'initializeDatabase must be imported dynamically (see comment in index.ts)'
    ).toContain("await import('./utils/initializeDatabase.js')");

    expect(
      /^import\s+.*\bfrom\s+'\.\/utils\/initializeDatabase\.js'/m.test(
        indexSource
      ),
      'index.ts must NOT statically import initializeDatabase.js — ESM hoisting would run it before dotenv/loadSecrets'
    ).toBe(false);
  });

  it('runs migrations only after env, secrets and preflight checks', () => {
    const dotenvAt = indexSource.indexOf('dotenv.config(');
    const secretsAt = indexSource.indexOf('loadSecrets()');
    const preflightAt = indexSource.indexOf('runPreflightChecks()');
    const migrationsAt = indexSource.indexOf(
      "await import('./utils/initializeDatabase.js')"
    );

    // indexOf() returns -1 for a missing token, and -1 is less than any real
    // position -- so the ordering checks below would still pass if one of these
    // steps were deleted outright. Assert presence first.
    expect(dotenvAt, 'index.ts must call dotenv.config()').toBeGreaterThan(-1);
    expect(secretsAt, 'index.ts must call loadSecrets()').toBeGreaterThan(-1);
    expect(
      preflightAt,
      'index.ts must call runPreflightChecks()'
    ).toBeGreaterThan(-1);

    expect(dotenvAt).toBeLessThan(migrationsAt);
    expect(secretsAt).toBeLessThan(migrationsAt);
    expect(
      preflightAt,
      'preflight validates the DB credentials the migration runner needs'
    ).toBeLessThan(migrationsAt);
  });

  it('does not re-apply migrations from SparkyFitnessServer.ts', () => {
    expect(
      serverSource,
      'migrations belong in index.ts only — a second boot path here reintroduces the race'
    ).not.toContain('applyMigrations');
    expect(serverSource).not.toContain('applyRlsPolicies');
    expect(serverSource).not.toContain('initializeDatabase');
  });

  it('exits the process when startup fails', () => {
    // process.exitCode alone does not stop the process: a failed boot would
    // leave a live container that never listens, which Docker's restart policy
    // does not retry.
    expect(
      serverSource,
      'startup failure must call process.exit, not just set process.exitCode'
    ).not.toContain('process.exitCode = 1');

    // Scope the assertion to the startup catch. A file-wide search for
    // process.exit(1) would also match the shutdown-timeout handler, so this
    // test would stay green if the startup catch stopped exiting altogether.
    const startupCatchAt = serverSource.indexOf('})().catch(');
    expect(
      startupCatchAt,
      'the startup chain must end in a catch block'
    ).toBeGreaterThan(-1);

    const startupCatch = serverSource.slice(startupCatchAt);
    expect(startupCatch, 'the startup catch must log the failure').toContain(
      'Failed to start server:'
    );
    expect(startupCatch, 'the startup catch must exit the process').toContain(
      'process.exit(1)'
    );
  });
});
