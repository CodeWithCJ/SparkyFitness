import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  schedule: vi.fn(),
  backups: vi.fn(),
  openFoodFacts: vi.fn(),
  providerSyncs: vi.fn(),
  cleanupSessions: vi.fn(),
  deleteExpiredTickets: vi.fn(),
  demoReset: vi.fn(),
  log: vi.fn(),
}));

vi.mock('node-cron', () => ({ default: { schedule: mocks.schedule } }));
vi.mock('../config/logging.js', () => ({ log: mocks.log }));
vi.mock('../auth.js', () => ({ cleanupSessions: mocks.cleanupSessions }));
vi.mock('../services/passkeyTicketService.js', () => ({
  deleteExpiredTickets: mocks.deleteExpiredTickets,
}));
vi.mock('../services/backupScheduler.js', () => ({
  scheduleBackupsOnStartup: mocks.backups,
}));
vi.mock('../services/openFoodFactsAutoSyncScheduler.js', () => ({
  scheduleOpenFoodFactsAutoSyncOnStartup: mocks.openFoodFacts,
}));
vi.mock('../services/providerSyncScheduler.js', () => ({
  startProviderSyncSchedulers: mocks.providerSyncs,
}));
vi.mock('../services/demoSeedService.js', () => ({
  scheduleDemoMidnightReset: mocks.demoReset,
}));

import { scheduleBackgroundJobs } from '../services/backgroundJobScheduler.js';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS', 'false');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('scheduleBackgroundJobs', () => {
  it('starts every scheduled job', async () => {
    await scheduleBackgroundJobs();
    expect(mocks.backups).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.openFoodFacts).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.providerSyncs).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.demoReset).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.schedule).toHaveBeenCalledExactlyOnceWith(
      '0 3 * * *',
      expect.any(Function),
      expect.objectContaining({ name: 'session-cleanup', distributed: true })
    );
  });

  it('waits for Open Food Facts setup before starting the remaining jobs', async () => {
    let finish!: () => void;
    mocks.openFoodFacts.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      })
    );
    const registration = scheduleBackgroundJobs();
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.providerSyncs).not.toHaveBeenCalled();
    finish();
    await registration;
    expect(mocks.providerSyncs).toHaveBeenCalledOnce();
  });

  it('starts no jobs on an instance with scheduled jobs disabled', async () => {
    vi.stubEnv('SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS', 'true');
    await scheduleBackgroundJobs();
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.backups).not.toHaveBeenCalled();
    expect(mocks.openFoodFacts).not.toHaveBeenCalled();
    expect(mocks.providerSyncs).not.toHaveBeenCalled();
    expect(mocks.demoReset).not.toHaveBeenCalled();
    expect(mocks.log).toHaveBeenCalledWith(
      'info',
      expect.stringContaining('SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS=true')
    );
  });

  it.each(['false', ''])(
    'starts every job when the setting is %j',
    async (value) => {
      vi.stubEnv('SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS', value);
      await scheduleBackgroundJobs();
      expect(mocks.backups).toHaveBeenCalledOnce();
      expect(mocks.providerSyncs).toHaveBeenCalledOnce();
      expect(mocks.demoReset).toHaveBeenCalledOnce();
    }
  );

  it('runs session and passkey ticket cleanup nightly', async () => {
    mocks.deleteExpiredTickets.mockResolvedValue(2);
    await scheduleBackgroundJobs();
    await mocks.schedule.mock.calls[0][1]();
    expect(mocks.cleanupSessions).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.deleteExpiredTickets).toHaveBeenCalledExactlyOnceWith();
  });

  it('still cleans passkey tickets when session cleanup fails', async () => {
    mocks.cleanupSessions.mockRejectedValue(
      new Error('Session cleanup failed')
    );
    await scheduleBackgroundJobs();
    await expect(mocks.schedule.mock.calls[0][1]()).resolves.toBeUndefined();
    expect(mocks.deleteExpiredTickets).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.log).toHaveBeenCalledWith(
      'error',
      '[CRON] Session cleanup failed:',
      expect.any(Error)
    );
  });
});
