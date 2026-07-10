import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): supertest does not ship declarations in this repo.
import request from 'supertest';

const runtimeMocks = vi.hoisted(() => ({
  applyMigrations: vi.fn<() => Promise<void>>(),
  applyRlsPolicies: vi.fn<() => Promise<void>>(),
  upsertEnvOidcProvider: vi.fn<() => Promise<void>>(),
  syncTrustedProviders: vi.fn<() => Promise<void>>(),
  scheduleBackupsOnStartup: vi.fn(),
  downstreamVersionHandler: vi.fn(() => 'test-version'),
}));

vi.mock('../utils/dbMigrations.js', () => ({
  applyMigrations: runtimeMocks.applyMigrations,
}));

vi.mock('../utils/applyRlsPolicies.js', () => ({
  applyRlsPolicies: runtimeMocks.applyRlsPolicies,
}));

vi.mock('../utils/oidcEnvConfig.js', () => ({
  upsertEnvOidcProvider: runtimeMocks.upsertEnvOidcProvider,
}));

vi.mock('../services/backupScheduler.js', () => ({
  scheduleBackupsOnStartup: runtimeMocks.scheduleBackupsOnStartup,
  rescheduleBackups: vi.fn(),
}));

vi.mock('../services/versionService.js', () => ({
  default: {
    getAppVersion: runtimeMocks.downstreamVersionHandler,
    getLatestGitHubRelease: vi.fn(),
  },
}));

vi.mock('../auth.js', () => ({
  cleanupSessions: vi.fn(),
  default: {
    auth: {},
    syncTrustedProviders: runtimeMocks.syncTrustedProviders,
  },
}));

vi.mock('better-auth/node', () => ({
  toNodeHandler: vi.fn(() => (_req: unknown, res: never) => res),
}));

const loadRuntime = async () => {
  vi.resetModules();
  return import('../SparkyFitnessServer.js');
};

describe('serverless runtime lifecycle', () => {
  beforeEach(() => {
    runtimeMocks.applyMigrations.mockReset().mockResolvedValue(undefined);
    runtimeMocks.applyRlsPolicies.mockReset().mockResolvedValue(undefined);
    runtimeMocks.upsertEnvOidcProvider.mockReset().mockResolvedValue(undefined);
    runtimeMocks.syncTrustedProviders.mockReset().mockResolvedValue(undefined);
    runtimeMocks.scheduleBackupsOnStartup.mockReset();
    runtimeMocks.downstreamVersionHandler
      .mockReset()
      .mockReturnValue('test-version');

    process.env.SPARKY_FITNESS_STORAGE_MODE = 'disabled';
    process.env.SPARKY_FITNESS_SERVER_BACKUPS_ENABLED = 'false';
    delete process.env.SPARKY_FITNESS_SKIP_STARTUP_MIGRATIONS;
    process.env.SPARKY_FITNESS_DISABLE_BACKGROUND_JOBS = 'true';
    delete process.env.SPARKY_FITNESS_ADMIN_EMAIL;
  });

  afterEach(() => {
    delete process.env.SPARKY_FITNESS_STORAGE_MODE;
    delete process.env.SPARKY_FITNESS_SERVER_BACKUPS_ENABLED;
    delete process.env.SPARKY_FITNESS_SKIP_STARTUP_MIGRATIONS;
    delete process.env.SPARKY_FITNESS_DISABLE_BACKGROUND_JOBS;
    delete process.env.SPARKY_FITNESS_ADMIN_EMAIL;
  });

  it('shares one initialization across concurrent requests', async () => {
    let releaseMigrations: (() => void) | undefined;
    runtimeMocks.applyMigrations.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseMigrations = resolve;
        })
    );
    const { ensureRuntimeReady } = await loadRuntime();

    const firstRequest = ensureRuntimeReady();
    const secondRequest = ensureRuntimeReady();

    await vi.waitFor(() => {
      expect(runtimeMocks.applyMigrations).toHaveBeenCalledOnce();
    });
    releaseMigrations?.();
    await Promise.all([firstRequest, secondRequest]);

    expect(runtimeMocks.applyRlsPolicies).toHaveBeenCalledOnce();
    expect(runtimeMocks.syncTrustedProviders).toHaveBeenCalledOnce();
  });

  it('skips migrations and background scheduling when deployment flags disable them', async () => {
    process.env.SPARKY_FITNESS_SKIP_STARTUP_MIGRATIONS = 'true';
    const { ensureRuntimeReady } = await loadRuntime();

    await ensureRuntimeReady();

    expect(runtimeMocks.applyMigrations).not.toHaveBeenCalled();
    expect(runtimeMocks.applyRlsPolicies).not.toHaveBeenCalled();
    expect(runtimeMocks.scheduleBackupsOnStartup).not.toHaveBeenCalled();
  });

  it('returns SERVICE_STARTUP_FAILED without reaching the downstream route', async () => {
    runtimeMocks.applyMigrations.mockRejectedValueOnce(
      new Error('database unavailable')
    );
    const { default: app } = await loadRuntime();
    runtimeMocks.downstreamVersionHandler.mockClear();

    const response = await request(app).get('/api/version/current');

    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: 'SERVICE_STARTUP_FAILED',
        message: 'Service is not ready. Please retry shortly.',
      },
    });
    expect(runtimeMocks.downstreamVersionHandler).not.toHaveBeenCalled();
  });

  it('retries initialization after a transient startup failure', async () => {
    runtimeMocks.applyMigrations
      .mockRejectedValueOnce(new Error('database temporarily unavailable'))
      .mockResolvedValueOnce(undefined);
    const { ensureRuntimeReady } = await loadRuntime();

    await expect(ensureRuntimeReady()).rejects.toThrow(
      'database temporarily unavailable'
    );
    await expect(ensureRuntimeReady()).resolves.toBeUndefined();

    expect(runtimeMocks.applyMigrations).toHaveBeenCalledTimes(2);
    expect(runtimeMocks.applyRlsPolicies).toHaveBeenCalledOnce();
  });
});
