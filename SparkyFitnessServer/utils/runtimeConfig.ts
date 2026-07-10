import type { PoolConfig } from 'pg';

type DbSslConfig = {
  ssl?: PoolConfig['ssl'];
};

const storageModes = ['local', 'disabled'] as const;
type StorageMode = (typeof storageModes)[number];

interface DeploymentCapabilities {
  storageMode: StorageMode;
  uploadsEnabled: boolean;
  serverBackupsEnabled: boolean;
  backgroundJobsEnabled: boolean;
}

function getServerPort(): string | number {
  return process.env.PORT ?? process.env.SPARKY_FITNESS_SERVER_PORT ?? 3010;
}

function getDbSslConfig(): DbSslConfig {
  const value = process.env.SPARKY_FITNESS_DB_SSL?.trim().toLowerCase();

  if (!value || value === 'disable' || value === 'false') {
    return {};
  }

  if (value === 'require' || value === 'true') {
    return { ssl: { rejectUnauthorized: false } };
  }

  if (value === 'verify-full') {
    const ca = process.env.SPARKY_FITNESS_DB_SSL_CA?.replace(
      /\\n/g,
      '\n'
    ).trim();
    if (!ca) {
      throw new Error(
        'SPARKY_FITNESS_DB_SSL_CA is required when SPARKY_FITNESS_DB_SSL is "verify-full".'
      );
    }

    return { ssl: { ca, rejectUnauthorized: true } };
  }

  throw new Error(
    `Invalid SPARKY_FITNESS_DB_SSL value "${process.env.SPARKY_FITNESS_DB_SSL}". Expected "verify-full", "require", or "disable".`
  );
}

function getDbPoolMax(): number {
  const value = process.env.SPARKY_FITNESS_DB_POOL_MAX?.trim();

  if (!value) {
    return 10;
  }

  const poolMax = Number(value);
  if (!Number.isInteger(poolMax) || poolMax <= 0) {
    throw new Error(
      `SPARKY_FITNESS_DB_POOL_MAX must be a positive integer; received "${process.env.SPARKY_FITNESS_DB_POOL_MAX}".`
    );
  }

  return poolMax;
}

function getDbIdleTimeoutMillis(): number {
  const value = process.env.SPARKY_FITNESS_DB_IDLE_TIMEOUT_MS?.trim();

  if (!value) {
    return 30_000;
  }

  const idleTimeoutMillis = Number(value);
  if (!Number.isInteger(idleTimeoutMillis) || idleTimeoutMillis <= 0) {
    throw new Error(
      `SPARKY_FITNESS_DB_IDLE_TIMEOUT_MS must be a positive integer; received "${process.env.SPARKY_FITNESS_DB_IDLE_TIMEOUT_MS}".`
    );
  }

  return idleTimeoutMillis;
}

function getSystemDbPort(): number {
  const value =
    process.env.SPARKY_FITNESS_SYSTEM_DB_PORT?.trim() ||
    process.env.SPARKY_FITNESS_DB_PORT?.trim() ||
    '5432';
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `SPARKY_FITNESS_SYSTEM_DB_PORT must be an integer between 1 and 65535; received "${value}".`
    );
  }

  return port;
}

function areBackgroundJobsDisabled(): boolean {
  return process.env.SPARKY_FITNESS_DISABLE_BACKGROUND_JOBS === 'true';
}

function areStartupMigrationsDisabled(): boolean {
  return process.env.SPARKY_FITNESS_SKIP_STARTUP_MIGRATIONS === 'true';
}

function getStorageMode(): StorageMode {
  const value = process.env.SPARKY_FITNESS_STORAGE_MODE?.trim().toLowerCase();

  if (!value) {
    return 'local';
  }

  if (storageModes.includes(value as StorageMode)) {
    return value as StorageMode;
  }

  throw new Error(
    `Invalid SPARKY_FITNESS_STORAGE_MODE value "${process.env.SPARKY_FITNESS_STORAGE_MODE}". Expected one of: ${storageModes.join(', ')}.`
  );
}

function areServerBackupsEnabled(): boolean {
  return process.env.SPARKY_FITNESS_SERVER_BACKUPS_ENABLED !== 'false';
}

function getDeploymentCapabilities(): DeploymentCapabilities {
  const storageMode = getStorageMode();

  return {
    storageMode,
    uploadsEnabled: storageMode !== 'disabled',
    serverBackupsEnabled: areServerBackupsEnabled(),
    backgroundJobsEnabled: !areBackgroundJobsDisabled(),
  };
}

export type { DeploymentCapabilities, StorageMode };
export {
  areBackgroundJobsDisabled,
  areServerBackupsEnabled,
  areStartupMigrationsDisabled,
  getDbIdleTimeoutMillis,
  getDbPoolMax,
  getDbSslConfig,
  getDeploymentCapabilities,
  getServerPort,
  getStorageMode,
  getSystemDbPort,
};
