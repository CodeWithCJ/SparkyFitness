import { afterEach, describe, expect, it } from 'vitest';
import {
  areBackgroundJobsDisabled,
  areServerBackupsEnabled,
  areStartupMigrationsDisabled,
  getDbPoolMax,
  getDbIdleTimeoutMillis,
  getDbSslConfig,
  getDeploymentCapabilities,
  getServerPort,
  getStorageMode,
  getSystemDbPort,
} from '../utils/runtimeConfig.js';

describe('runtimeConfig', () => {
  afterEach(() => {
    delete process.env.PORT;
    delete process.env.SPARKY_FITNESS_SERVER_PORT;
    delete process.env.SPARKY_FITNESS_DB_SSL;
    delete process.env.SPARKY_FITNESS_DB_POOL_MAX;
    delete process.env.SPARKY_FITNESS_DB_IDLE_TIMEOUT_MS;
    delete process.env.SPARKY_FITNESS_DB_PORT;
    delete process.env.SPARKY_FITNESS_SYSTEM_DB_PORT;
    delete process.env.SPARKY_FITNESS_DISABLE_BACKGROUND_JOBS;
    delete process.env.SPARKY_FITNESS_SKIP_STARTUP_MIGRATIONS;
    delete process.env.SPARKY_FITNESS_STORAGE_MODE;
    delete process.env.SPARKY_FITNESS_SERVER_BACKUPS_ENABLED;
  });

  it('uses Vercel PORT before local server port', () => {
    process.env.PORT = '4567';
    process.env.SPARKY_FITNESS_SERVER_PORT = '3010';

    expect(getServerPort()).toBe('4567');
  });

  it('preserves the local server port fallback', () => {
    delete process.env.PORT;
    process.env.SPARKY_FITNESS_SERVER_PORT = '3011';

    expect(getServerPort()).toBe('3011');
  });

  it('defaults to the existing local port when no env is set', () => {
    delete process.env.PORT;
    delete process.env.SPARKY_FITNESS_SERVER_PORT;

    expect(getServerPort()).toBe(3010);
  });

  it('leaves Postgres SSL disabled by default', () => {
    delete process.env.SPARKY_FITNESS_DB_SSL;

    expect(getDbSslConfig()).toEqual({});
  });

  it('enables Postgres SSL when required by managed providers', () => {
    process.env.SPARKY_FITNESS_DB_SSL = 'require';

    expect(getDbSslConfig()).toEqual({
      ssl: { rejectUnauthorized: false },
    });
  });

  it('defaults database pools to the existing local limit', () => {
    expect(getDbPoolMax()).toBe(10);
  });

  it('allows deployments to lower the per-process database pool limit', () => {
    process.env.SPARKY_FITNESS_DB_POOL_MAX = '1';

    expect(getDbPoolMax()).toBe(1);
  });

  it.each(['0', '-1', '1.5', 'many'])(
    'rejects invalid database pool limit %s',
    (value) => {
      process.env.SPARKY_FITNESS_DB_POOL_MAX = value;

      expect(() => getDbPoolMax()).toThrow(
        'SPARKY_FITNESS_DB_POOL_MAX must be a positive integer'
      );
    }
  );

  it('defaults database pool idle retention to 30 seconds', () => {
    expect(getDbIdleTimeoutMillis()).toBe(30_000);
  });

  it('allows serverless deployments to release idle clients quickly', () => {
    process.env.SPARKY_FITNESS_DB_IDLE_TIMEOUT_MS = '1000';

    expect(getDbIdleTimeoutMillis()).toBe(1_000);
  });

  it.each(['0', '-1', '1.5', 'many'])(
    'rejects invalid database idle timeout %s',
    (value) => {
      process.env.SPARKY_FITNESS_DB_IDLE_TIMEOUT_MS = value;

      expect(() => getDbIdleTimeoutMillis()).toThrow(
        'SPARKY_FITNESS_DB_IDLE_TIMEOUT_MS must be a positive integer'
      );
    }
  );

  it('uses the primary database port for system traffic by default', () => {
    process.env.SPARKY_FITNESS_DB_PORT = '5432';

    expect(getSystemDbPort()).toBe(5432);
  });

  it('allows system and auth traffic to use a separate pooler port', () => {
    process.env.SPARKY_FITNESS_DB_PORT = '5432';
    process.env.SPARKY_FITNESS_SYSTEM_DB_PORT = '6543';

    expect(getSystemDbPort()).toBe(6543);
  });

  it.each(['0', '65536', '1.5', 'many'])(
    'rejects invalid system database port %s',
    (value) => {
      process.env.SPARKY_FITNESS_SYSTEM_DB_PORT = value;

      expect(() => getSystemDbPort()).toThrow(
        'SPARKY_FITNESS_SYSTEM_DB_PORT must be an integer between 1 and 65535'
      );
    }
  );

  it('fails clearly for invalid Postgres SSL settings', () => {
    process.env.SPARKY_FITNESS_DB_SSL = 'sometimes';

    expect(() => getDbSslConfig()).toThrow(
      'Invalid SPARKY_FITNESS_DB_SSL value "sometimes"'
    );
  });

  it('only disables background jobs when explicitly enabled', () => {
    delete process.env.SPARKY_FITNESS_DISABLE_BACKGROUND_JOBS;
    expect(areBackgroundJobsDisabled()).toBe(false);

    process.env.SPARKY_FITNESS_DISABLE_BACKGROUND_JOBS = 'true';
    expect(areBackgroundJobsDisabled()).toBe(true);
  });

  it('only skips startup migrations when explicitly enabled', () => {
    delete process.env.SPARKY_FITNESS_SKIP_STARTUP_MIGRATIONS;
    expect(areStartupMigrationsDisabled()).toBe(false);

    process.env.SPARKY_FITNESS_SKIP_STARTUP_MIGRATIONS = 'true';
    expect(areStartupMigrationsDisabled()).toBe(true);
  });

  it('defaults to local storage and server-managed backups', () => {
    expect(getStorageMode()).toBe('local');
    expect(areServerBackupsEnabled()).toBe(true);
    expect(getDeploymentCapabilities()).toEqual({
      storageMode: 'local',
      uploadsEnabled: true,
      serverBackupsEnabled: true,
      backgroundJobsEnabled: true,
    });
  });

  it('reports Vercel MVP disabled storage and background jobs', () => {
    process.env.SPARKY_FITNESS_STORAGE_MODE = 'disabled';
    process.env.SPARKY_FITNESS_SERVER_BACKUPS_ENABLED = 'false';
    process.env.SPARKY_FITNESS_DISABLE_BACKGROUND_JOBS = 'true';

    expect(getDeploymentCapabilities()).toEqual({
      storageMode: 'disabled',
      uploadsEnabled: false,
      serverBackupsEnabled: false,
      backgroundJobsEnabled: false,
    });
  });

  it('fails clearly for invalid storage modes', () => {
    process.env.SPARKY_FITNESS_STORAGE_MODE = 'diskish';

    expect(() => getStorageMode()).toThrow(
      'Invalid SPARKY_FITNESS_STORAGE_MODE value "diskish"'
    );
  });
});
