import { beforeEach, describe, expect, it, vi } from 'vitest';
import cron from 'node-cron';
import externalProviderRepository from '../models/externalProviderRepository.js';
import withingsServiceCentral from '../services/withingsService.js';
import garminService from '../services/garminService.js';
import fitbitService from '../services/fitbitService.js';
import corosService from '../services/corosService.js';
import ouraService from '../services/ouraService.js';
import stravaService from '../services/stravaService.js';
import googleHealthService from '../services/googleHealthService.js';
import hevyService from '../integrations/hevy/hevyService.js';
import intervalsService from '../integrations/intervals/intervalsService.js';
import {
  PROVIDER_SYNC_CONFIGS,
  isProviderSyncDue,
  runProviderSync,
  scheduleProviderSync,
  startProviderSyncSchedulers,
  type ProviderSyncConfig,
} from '../services/providerSyncScheduler.js';
import { startProviderSync } from '../services/providerSyncClaim.js';
import { log } from '../config/logging.js';
import { isShuttingDown } from '../utils/shutdownHooks.js';

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(() => ({ stop: vi.fn(), destroy: vi.fn() })),
  },
}));

vi.mock('../models/externalProviderRepository.js', () => ({
  default: {
    getProvidersByType: vi.fn(),
    updateProviderLastSync: vi.fn(),
  },
}));

vi.mock('../services/withingsService.js', () => ({
  default: {
    syncWithingsData: vi.fn(),
  },
}));

vi.mock('../services/garminService.js', () => ({
  default: {
    syncGarminData: vi.fn(),
  },
}));

vi.mock('../services/fitbitService.js', () => ({
  default: {
    syncFitbitData: vi.fn(),
  },
}));

vi.mock('../services/corosService.js', () => ({
  default: {
    syncCorosData: vi.fn(),
  },
}));

vi.mock('../services/ouraService.js', () => ({
  default: { syncOuraData: vi.fn() },
}));

vi.mock('../services/stravaService.js', () => ({
  default: { syncStravaData: vi.fn() },
}));

vi.mock('../services/googleHealthService.js', () => ({
  default: { syncGoogleHealthData: vi.fn() },
}));

vi.mock('../integrations/hevy/hevyService.js', () => ({
  default: {
    syncHevyData: vi.fn(),
  },
}));

vi.mock('../integrations/intervals/intervalsService.js', () => ({
  default: {
    syncIntervalsData: vi.fn(),
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

vi.mock('../services/providerSyncClaim.js', () => ({
  startProviderSync: vi.fn(),
}));

vi.mock('../utils/shutdownHooks.js', () => ({
  isShuttingDown: vi.fn(() => false),
}));

describe('providerSyncScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(startProviderSync).mockImplementation(async (_target, sync) => ({
      running: sync(),
    }));
  });

  it('contains configurations for all 11 providers', () => {
    expect(PROVIDER_SYNC_CONFIGS).toHaveLength(11);
    const providerNames = PROVIDER_SYNC_CONFIGS.map((c) => c.name);
    expect(providerNames).toEqual([
      'Withings',
      'Garmin',
      'Fitbit',
      'Oura',
      'Strava',
      'Polar',
      'COROS',
      'Google Health',
      'Hevy',
      'Liftosaur',
      'Intervals.icu',
    ]);
  });

  it('runs sync for active non-manual providers and updates last_sync_at', async () => {
    vi.mocked(externalProviderRepository.getProvidersByType).mockResolvedValue([
      {
        id: 'p-1',
        user_id: 'u-1',
        is_active: true,
        sync_frequency: 'hourly',
      } as never,
      {
        id: 'p-2',
        user_id: 'u-2',
        is_active: false,
        sync_frequency: 'hourly',
      } as never,
      {
        id: 'p-3',
        user_id: 'u-3',
        is_active: true,
        sync_frequency: 'manual',
      } as never,
    ]);

    const withingsConfig = PROVIDER_SYNC_CONFIGS.find(
      (c) => c.name === 'Withings'
    ) as ProviderSyncConfig;

    await runProviderSync(withingsConfig);

    expect(withingsServiceCentral.syncWithingsData).toHaveBeenCalledTimes(1);
    expect(withingsServiceCentral.syncWithingsData).toHaveBeenCalledWith(
      'u-1',
      'scheduled'
    );
    expect(
      externalProviderRepository.updateProviderLastSync
    ).toHaveBeenCalledWith('p-1', expect.any(Date));
  });

  it('handles provider syncing for COROS', async () => {
    vi.mocked(
      externalProviderRepository.getProvidersByType
    ).mockResolvedValueOnce([
      {
        id: 'p-mcp',
        user_id: 'u-1',
        is_active: true,
        sync_frequency: 'hourly',
      } as never,
    ]);
    vi.mocked(corosService.syncCorosData).mockResolvedValueOnce({
      failedRequiredFetches: [],
      activitiesFailed: 0,
    } as never);

    const corosConfig = PROVIDER_SYNC_CONFIGS.find(
      (c) => c.name === 'COROS'
    ) as ProviderSyncConfig;

    await runProviderSync(corosConfig);

    expect(externalProviderRepository.getProvidersByType).toHaveBeenCalledWith(
      'coros_mcp'
    );
    expect(corosService.syncCorosData).toHaveBeenCalledTimes(1);
    expect(corosService.syncCorosData).toHaveBeenCalledWith(
      'u-1',
      'scheduled',
      'p-mcp'
    );
  });

  it('isolates user sync failures so other users continue syncing', async () => {
    vi.mocked(externalProviderRepository.getProvidersByType).mockResolvedValue([
      {
        id: 'p-fail',
        user_id: 'u-fail',
        is_active: true,
        sync_frequency: 'hourly',
      } as never,
      {
        id: 'p-ok',
        user_id: 'u-ok',
        is_active: true,
        sync_frequency: 'hourly',
      } as never,
    ]);

    vi.mocked(fitbitService.syncFitbitData)
      .mockRejectedValueOnce(new Error('Token expired'))
      .mockResolvedValueOnce(undefined as never);

    const fitbitConfig = PROVIDER_SYNC_CONFIGS.find(
      (c) => c.name === 'Fitbit'
    ) as ProviderSyncConfig;

    await runProviderSync(fitbitConfig);

    expect(fitbitService.syncFitbitData).toHaveBeenCalledTimes(2);
    expect(
      externalProviderRepository.updateProviderLastSync
    ).toHaveBeenCalledTimes(1);
    expect(
      externalProviderRepository.updateProviderLastSync
    ).toHaveBeenCalledWith('p-ok', expect.any(Date));
  });

  it('claims each provider row and skips one another sync is running on', async () => {
    vi.mocked(externalProviderRepository.getProvidersByType).mockResolvedValue([
      {
        id: 'p-busy',
        user_id: 'u-busy',
        is_active: true,
        sync_frequency: 'hourly',
      } as never,
      {
        id: 'p-free',
        user_id: 'u-free',
        is_active: true,
        sync_frequency: 'hourly',
      } as never,
    ]);
    vi.mocked(startProviderSync).mockImplementation(async (target, sync) =>
      'providerId' in target && target.providerId === 'p-busy'
        ? null
        : { running: sync() }
    );
    const fitbitConfig = PROVIDER_SYNC_CONFIGS.find(
      (c) => c.name === 'Fitbit'
    ) as ProviderSyncConfig;

    await runProviderSync(fitbitConfig);

    expect(startProviderSync).toHaveBeenCalledWith(
      { userId: 'u-busy', providerId: 'p-busy' },
      expect.any(Function)
    );
    expect(fitbitService.syncFitbitData).toHaveBeenCalledOnce();
    expect(fitbitService.syncFitbitData).toHaveBeenCalledWith(
      'u-free',
      'scheduled'
    );
    expect(log).toHaveBeenCalledWith(
      'info',
      expect.stringContaining('Fitbit sync skipped for user u-busy')
    );
  });

  it('stops before the next account once shutdown begins', async () => {
    vi.mocked(externalProviderRepository.getProvidersByType).mockResolvedValue([
      {
        id: 'p-first',
        user_id: 'u-first',
        is_active: true,
        sync_frequency: 'hourly',
      } as never,
      {
        id: 'p-next',
        user_id: 'u-next',
        is_active: true,
        sync_frequency: 'hourly',
      } as never,
    ]);
    vi.mocked(fitbitService.syncFitbitData).mockImplementationOnce(async () => {
      vi.mocked(isShuttingDown).mockReturnValue(true);
      return undefined as never;
    });
    const fitbitConfig = PROVIDER_SYNC_CONFIGS.find(
      (c) => c.name === 'Fitbit'
    ) as ProviderSyncConfig;

    await runProviderSync(fitbitConfig);
    vi.mocked(isShuttingDown).mockReturnValue(false);

    expect(fitbitService.syncFitbitData).toHaveBeenCalledOnce();
    expect(fitbitService.syncFitbitData).toHaveBeenCalledWith(
      'u-first',
      'scheduled'
    );
    expect(startProviderSync).toHaveBeenCalledOnce();
  });

  it('does not update last_sync_at when Garmin has failed phases', async () => {
    vi.mocked(externalProviderRepository.getProvidersByType).mockResolvedValue([
      {
        id: 'p-garmin',
        user_id: 'u-garmin',
        is_active: true,
        sync_frequency: 'hourly',
      } as never,
    ]);

    vi.mocked(garminService.syncGarminData).mockResolvedValue({
      health: { error: 'Network error' },
      activities: null,
      nutrition: null,
    } as never);

    const garminConfig = PROVIDER_SYNC_CONFIGS.find(
      (c) => c.name === 'Garmin'
    ) as ProviderSyncConfig;

    await runProviderSync(garminConfig);

    expect(garminService.syncGarminData).toHaveBeenCalledWith(
      'u-garmin',
      'scheduled'
    );
    expect(
      externalProviderRepository.updateProviderLastSync
    ).not.toHaveBeenCalled();
  });

  describe.each([
    {
      name: 'Oura',
      sync: () => vi.mocked(ouraService.syncOuraData),
    },
    {
      name: 'Strava',
      sync: () => vi.mocked(stravaService.syncStravaData),
    },
    {
      name: 'Google Health',
      sync: () => vi.mocked(googleHealthService.syncGoogleHealthData),
    },
    {
      name: 'COROS',
      sync: () => vi.mocked(corosService.syncCorosData),
    },
  ])('$name required fetches', ({ name, sync }) => {
    const run = async () => {
      vi.mocked(
        externalProviderRepository.getProvidersByType
      ).mockResolvedValue([
        {
          id: 'p-1',
          user_id: 'u-1',
          is_active: true,
          sync_frequency: 'hourly',
        } as never,
      ]);
      await runProviderSync(
        PROVIDER_SYNC_CONFIGS.find((c) => c.name === name) as ProviderSyncConfig
      );
    };

    it('does not update last_sync_at when a required fetch failed', async () => {
      sync().mockResolvedValueOnce({
        success: true,
        failedRequiredFetches: ['steps'],
      } as never);

      await run();

      expect(
        externalProviderRepository.updateProviderLastSync
      ).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('last_sync_at not updated: steps')
      );
    });

    it('updates last_sync_at when no required fetch failed', async () => {
      sync().mockResolvedValueOnce({
        success: true,
        failedRequiredFetches: [],
      } as never);

      await run();

      expect(
        externalProviderRepository.updateProviderLastSync
      ).toHaveBeenCalledWith('p-1', expect.any(Date));
    });
  });

  it.each([
    {
      name: 'Oura',
      mockResult: () =>
        vi.mocked(ouraService.syncOuraData).mockResolvedValueOnce({
          success: true,
          failedRequiredFetches: [],
          workoutsFailed: 2,
        } as never),
    },
    {
      name: 'Strava',
      mockResult: () =>
        vi.mocked(stravaService.syncStravaData).mockResolvedValueOnce({
          success: true,
          failedRequiredFetches: [],
          activitiesFailed: 2,
        } as never),
    },
    {
      name: 'COROS',
      mockResult: () =>
        vi.mocked(corosService.syncCorosData).mockResolvedValueOnce({
          success: true,
          failedRequiredFetches: [],
          activitiesFailed: 2,
        } as never),
    },
  ])(
    'does not update last_sync_at when $name failed to save items',
    async ({ name, mockResult }) => {
      vi.mocked(
        externalProviderRepository.getProvidersByType
      ).mockResolvedValue([
        {
          id: 'p-1',
          user_id: 'u-1',
          is_active: true,
          sync_frequency: 'hourly',
        } as never,
      ]);
      mockResult();

      await runProviderSync(
        PROVIDER_SYNC_CONFIGS.find((c) => c.name === name) as ProviderSyncConfig
      );

      expect(
        externalProviderRepository.updateProviderLastSync
      ).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('last_sync_at not updated: 2 items not saved')
      );
    }
  );

  it('runs Hevy sync with correct parameters', async () => {
    vi.mocked(externalProviderRepository.getProvidersByType).mockResolvedValue([
      {
        id: 'p-hevy',
        user_id: 'u-hevy',
        is_active: true,
        sync_frequency: 'hourly',
      } as never,
    ]);

    const hevyConfig = PROVIDER_SYNC_CONFIGS.find(
      (c) => c.name === 'Hevy'
    ) as ProviderSyncConfig;

    await runProviderSync(hevyConfig);

    expect(hevyService.syncHevyData).toHaveBeenCalledWith(
      'u-hevy',
      'u-hevy',
      false,
      'p-hevy'
    );
  });

  it('runs Intervals.icu hourly with the provider id', async () => {
    vi.mocked(externalProviderRepository.getProvidersByType).mockResolvedValue([
      {
        id: 'p-intervals',
        user_id: 'u-intervals',
        is_active: true,
        sync_frequency: 'daily',
      } as never,
    ]);

    const intervalsConfig = PROVIDER_SYNC_CONFIGS.find(
      (c) => c.name === 'Intervals.icu'
    ) as ProviderSyncConfig;

    expect(intervalsConfig.cronExpression).toBeUndefined();
    await runProviderSync(intervalsConfig);

    expect(intervalsService.syncIntervalsData).toHaveBeenCalledWith(
      'u-intervals',
      'u-intervals',
      'p-intervals'
    );
  });

  it('registers cron jobs on startup for each configured provider', () => {
    const tasks = startProviderSyncSchedulers();
    expect(tasks).toHaveLength(11);
    expect(cron.schedule).toHaveBeenCalledTimes(11);
    expect(cron.schedule).toHaveBeenCalledWith(
      '0 * * * *',
      expect.any(Function),
      { noOverlap: true }
    );
  });

  it('hands node-cron the running sync so noOverlap can see it', async () => {
    let finishSync = () => {};
    vi.mocked(externalProviderRepository.getProvidersByType).mockReturnValue(
      new Promise((resolve) => {
        finishSync = () => resolve([]);
      })
    );
    const fitbit = PROVIDER_SYNC_CONFIGS.find((c) => c.name === 'Fitbit')!;
    scheduleProviderSync(fitbit);
    const onTick = vi.mocked(cron.schedule).mock.calls[0][1] as () => unknown;

    let settled = false;
    const run = Promise.resolve(onTick()).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    finishSync();
    await run;
    expect(settled).toBe(true);
  });

  describe('sync frequency', () => {
    const hoursAgo = (hours: number) =>
      new Date(Date.now() - hours * 60 * 60 * 1000);
    const fitbitConfig = () =>
      PROVIDER_SYNC_CONFIGS.find(
        (c) => c.name === 'Fitbit'
      ) as ProviderSyncConfig;
    const runWith = async (provider: Record<string, unknown>) => {
      vi.mocked(
        externalProviderRepository.getProvidersByType
      ).mockResolvedValue([
        {
          id: 'p-1',
          user_id: 'u-1',
          is_active: true,
          ...provider,
        } as never,
      ]);
      await runProviderSync(fitbitConfig());
    };

    it('skips a daily provider that synced 2 hours ago', async () => {
      await runWith({ sync_frequency: 'daily', last_sync_at: hoursAgo(2) });

      expect(fitbitService.syncFitbitData).not.toHaveBeenCalled();
      expect(startProviderSync).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        'debug',
        expect.stringContaining('Fitbit sync skipped for user u-1')
      );
    });

    it('runs a daily provider that synced 25 hours ago', async () => {
      await runWith({ sync_frequency: 'daily', last_sync_at: hoursAgo(25) });

      expect(fitbitService.syncFitbitData).toHaveBeenCalledWith(
        'u-1',
        'scheduled'
      );
    });

    it('runs a daily provider that has never synced', async () => {
      await runWith({ sync_frequency: 'daily', last_sync_at: null });

      expect(fitbitService.syncFitbitData).toHaveBeenCalledOnce();
    });

    it('runs an hourly provider regardless of last_sync_at', async () => {
      await runWith({
        sync_frequency: 'hourly',
        last_sync_at: new Date(Date.now() - 60 * 1000),
      });

      expect(fitbitService.syncFitbitData).toHaveBeenCalledOnce();
    });

    it('never runs a manual provider', async () => {
      await runWith({ sync_frequency: 'manual', last_sync_at: hoursAgo(48) });

      expect(fitbitService.syncFitbitData).not.toHaveBeenCalled();
      expect(startProviderSync).not.toHaveBeenCalled();
    });
  });
});

describe('isProviderSyncDue', () => {
  const now = new Date('2026-10-30T12:00:00Z');
  const hoursBefore = (hours: number) =>
    new Date(now.getTime() - hours * 60 * 60 * 1000);

  it('is never due for manual providers', () => {
    expect(isProviderSyncDue({ sync_frequency: 'manual' }, now)).toBe(false);
    expect(
      isProviderSyncDue(
        { sync_frequency: 'manual', last_sync_at: hoursBefore(100) },
        now
      )
    ).toBe(false);
  });

  it('is due for a daily provider without last_sync_at', () => {
    expect(isProviderSyncDue({ sync_frequency: 'daily' }, now)).toBe(true);
    expect(
      isProviderSyncDue({ sync_frequency: 'daily', last_sync_at: null }, now)
    ).toBe(true);
  });

  it('is due for a daily provider once 23 hours have passed', () => {
    expect(
      isProviderSyncDue(
        { sync_frequency: 'daily', last_sync_at: hoursBefore(22.9) },
        now
      )
    ).toBe(false);
    expect(
      isProviderSyncDue(
        { sync_frequency: 'daily', last_sync_at: hoursBefore(23) },
        now
      )
    ).toBe(true);
  });

  it('accepts last_sync_at as an ISO string', () => {
    expect(
      isProviderSyncDue(
        {
          sync_frequency: 'daily',
          last_sync_at: hoursBefore(2).toISOString(),
        },
        now
      )
    ).toBe(false);
  });

  it('is always due for other frequencies', () => {
    expect(
      isProviderSyncDue(
        { sync_frequency: 'hourly', last_sync_at: hoursBefore(0) },
        now
      )
    ).toBe(true);
    expect(isProviderSyncDue({ sync_frequency: 'weekly' }, now)).toBe(true);
  });
});
