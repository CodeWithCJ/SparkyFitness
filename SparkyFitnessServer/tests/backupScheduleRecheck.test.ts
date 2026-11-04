import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  schedule: vi.fn(),
  validate: vi.fn(),
  getBackupSettings: vi.fn(),
  log: vi.fn(),
}));

vi.mock('node-cron', () => ({
  default: { schedule: mocks.schedule, validate: mocks.validate },
}));
vi.mock('../models/backupSettingsRepository.js', () => ({
  default: { getBackupSettings: mocks.getBackupSettings },
}));
vi.mock('../services/backupService.js', () => ({
  performBackup: vi.fn(),
  applyRetentionPolicy: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: mocks.log }));

const RECHECK = '*/5 * * * *';
const enabledAt = (backup_time: string) => ({
  backup_enabled: true,
  backup_time,
  backup_days: [],
});
const disabled = {
  backup_enabled: false,
  backup_time: '02:00',
  backup_days: [],
};

// The scheduler keeps its task in module state, so each test loads a fresh copy.
const loadScheduler = async () => {
  vi.resetModules();
  return import('../services/backupScheduler.js');
};

const backupExpressions = () =>
  mocks.schedule.mock.calls
    .map(([expr]) => expr as string)
    .filter((expr) => expr !== RECHECK);

const runRecheck = async () => {
  const call = mocks.schedule.mock.calls.find(([expr]) => expr === RECHECK);
  await (call![1] as () => Promise<void>)();
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.validate.mockReturnValue(true);
  mocks.schedule.mockImplementation(() => ({
    stop: vi.fn(),
    destroy: vi.fn(),
  }));
});

describe('backup settings re-check', () => {
  it('registers one 5-minute re-check that cannot overlap itself', async () => {
    mocks.getBackupSettings.mockResolvedValue(enabledAt('02:00'));
    const { scheduleBackupsOnStartup } = await loadScheduler();

    await scheduleBackupsOnStartup();
    await scheduleBackupsOnStartup();

    const rechecks = mocks.schedule.mock.calls.filter(
      ([expr]) => expr === RECHECK
    );
    expect(rechecks).toHaveLength(1);
    expect(rechecks[0][2]).toEqual({
      name: 'backup-settings-recheck',
      noOverlap: true,
      timezone: 'UTC',
      // Each instance re-reads the schedule its own backup task follows.
      distributed: false,
    });
  });

  it('picks up backups turned on after startup', async () => {
    mocks.getBackupSettings.mockResolvedValue(disabled);
    const { scheduleBackupsOnStartup } = await loadScheduler();
    await scheduleBackupsOnStartup();
    expect(backupExpressions()).toEqual([]);

    mocks.getBackupSettings.mockResolvedValue(enabledAt('03:15'));
    await runRecheck();

    expect(backupExpressions()).toEqual(['15 3 * * *']);
  });

  it('picks up backups turned back on after being turned off', async () => {
    mocks.getBackupSettings.mockResolvedValue(enabledAt('02:00'));
    const { scheduleBackupsOnStartup } = await loadScheduler();
    await scheduleBackupsOnStartup();
    const firstTask = mocks.schedule.mock.results[0].value;

    mocks.getBackupSettings.mockResolvedValue(disabled);
    await runRecheck();
    expect(firstTask.destroy).toHaveBeenCalled();

    mocks.getBackupSettings.mockResolvedValue(enabledAt('02:00'));
    await runRecheck();

    expect(backupExpressions()).toEqual(['0 2 * * *', '0 2 * * *']);
  });

  it('applies a new backup time', async () => {
    mocks.getBackupSettings.mockResolvedValue(enabledAt('02:00'));
    const { scheduleBackupsOnStartup } = await loadScheduler();
    await scheduleBackupsOnStartup();

    mocks.getBackupSettings.mockResolvedValue(enabledAt('04:30'));
    await runRecheck();

    expect(backupExpressions()).toEqual(['0 2 * * *', '30 4 * * *']);
  });

  it('leaves the task alone when nothing changed', async () => {
    mocks.getBackupSettings.mockResolvedValue(enabledAt('02:00'));
    const { scheduleBackupsOnStartup } = await loadScheduler();
    await scheduleBackupsOnStartup();
    const firstTask = mocks.schedule.mock.results[0].value;

    await runRecheck();

    expect(backupExpressions()).toEqual(['0 2 * * *']);
    expect(firstTask.destroy).not.toHaveBeenCalled();
  });

  it('logs and keeps checking when the settings read fails', async () => {
    mocks.getBackupSettings.mockResolvedValue(enabledAt('02:00'));
    const { scheduleBackupsOnStartup } = await loadScheduler();
    await scheduleBackupsOnStartup();

    mocks.getBackupSettings.mockRejectedValueOnce(new Error('db down'));
    await expect(runRecheck()).resolves.toBeUndefined();
    expect(mocks.log).toHaveBeenCalledWith(
      'error',
      '[CRON] Failed to re-check backup settings:',
      expect.any(Error)
    );

    mocks.getBackupSettings.mockResolvedValue(enabledAt('05:00'));
    await runRecheck();
    expect(backupExpressions()).toEqual(['0 2 * * *', '0 5 * * *']);
  });
});
