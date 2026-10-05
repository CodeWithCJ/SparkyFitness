import cron, { type ScheduledTask } from 'node-cron';
import externalProviderRepository from '../models/externalProviderRepository.js';
import withingsServiceCentral from './withingsService.js';
import garminService from './garminService.js';
import { getGarminSyncPhaseErrors } from './garminSyncResult.js';
import fitbitService from './fitbitService.js';
import ouraService from './ouraService.js';
import polarService from './polarService.js';
import corosService from './corosService.js';
import stravaService from './stravaService.js';
import googleHealthService from './googleHealthService.js';
import hevyService from '../integrations/hevy/hevyService.js';
import liftosaurService from '../integrations/liftosaur/liftosaurService.js';
import { log } from '../config/logging.js';

export interface ProviderSyncTarget {
  id: string;
  user_id: string;
  is_active: boolean;
  sync_frequency: string;
}

export interface ProviderSyncConfig {
  name: string;
  types: string[];
  cronExpression?: string;
  sync: (provider: ProviderSyncTarget) => Promise<void>;
}

export const PROVIDER_SYNC_CONFIGS: readonly ProviderSyncConfig[] = [
  {
    name: 'Withings',
    types: ['withings'],
    sync: async (p) => {
      await withingsServiceCentral.syncWithingsData(p.user_id, 'scheduled');
      await externalProviderRepository.updateProviderLastSync(p.id, new Date());
    },
  },
  {
    name: 'Garmin',
    types: ['garmin'],
    sync: async (p) => {
      const result = await garminService.syncGarminData(p.user_id, 'scheduled');
      const failedPhases = getGarminSyncPhaseErrors(result);
      if (failedPhases.length === 0) {
        await externalProviderRepository.updateProviderLastSync(
          p.id,
          new Date()
        );
      } else {
        log(
          'warn',
          `[CRON] Garmin sync completed with failed phases for user ${p.user_id}; last_sync_at not updated: ${failedPhases.join(', ')}`
        );
      }
    },
  },
  {
    name: 'Fitbit',
    types: ['fitbit'],
    sync: async (p) => {
      await fitbitService.syncFitbitData(p.user_id, 'scheduled');
      await externalProviderRepository.updateProviderLastSync(p.id, new Date());
    },
  },
  {
    name: 'Oura',
    types: ['oura'],
    sync: async (p) => {
      await ouraService.syncOuraData(p.user_id, 'scheduled');
      await externalProviderRepository.updateProviderLastSync(p.id, new Date());
    },
  },
  {
    name: 'Strava',
    types: ['strava'],
    sync: async (p) => {
      await stravaService.syncStravaData(p.user_id, 'scheduled');
      await externalProviderRepository.updateProviderLastSync(p.id, new Date());
    },
  },
  {
    name: 'Polar',
    types: ['polar'],
    sync: async (p) => {
      await polarService.syncPolarData(p.user_id, 'scheduled', p.id);
      await externalProviderRepository.updateProviderLastSync(p.id, new Date());
    },
  },
  {
    name: 'COROS',
    types: ['coros_mcp'],
    sync: async (p) => {
      await corosService.syncCorosData(p.user_id, 'scheduled', p.id);
      await externalProviderRepository.updateProviderLastSync(p.id, new Date());
    },
  },
  {
    name: 'Google Health',
    types: ['googlehealth'],
    sync: async (p) => {
      await googleHealthService.syncGoogleHealthData(p.user_id, 'scheduled');
      await externalProviderRepository.updateProviderLastSync(p.id, new Date());
    },
  },
  {
    name: 'Hevy',
    types: ['hevy'],
    sync: async (p) => {
      await hevyService.syncHevyData(p.user_id, p.user_id, false, p.id);
    },
  },
  {
    name: 'Liftosaur',
    types: ['liftosaur'],
    sync: async (p) => {
      await liftosaurService.syncLiftosaurData(
        p.user_id,
        p.user_id,
        false,
        p.id
      );
    },
  },
];

export const runProviderSync = async (
  config: ProviderSyncConfig
): Promise<void> => {
  try {
    const providerBatches = await Promise.all(
      config.types.map((type) =>
        externalProviderRepository.getProvidersByType(type)
      )
    );
    const providers = providerBatches.flat() as unknown as ProviderSyncTarget[];

    for (const provider of providers) {
      if (provider.is_active && provider.sync_frequency !== 'manual') {
        try {
          await config.sync(provider);
        } catch (error) {
          log(
            'error',
            `[CRON] ${config.name} sync failed for user ${provider.user_id}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  } catch (error) {
    log(
      'error',
      `[CRON] ${config.name} sync task failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

export const scheduleProviderSync = (
  config: ProviderSyncConfig
): ScheduledTask => {
  // Returning the run lets noOverlap skip a tick while the previous pass over
  // every user is still going, so two passes never sync the same account at once.
  return cron.schedule(
    config.cronExpression ?? '0 * * * *',
    () => runProviderSync(config),
    { noOverlap: true }
  );
};

export const startProviderSyncSchedulers = (): ScheduledTask[] => {
  return PROVIDER_SYNC_CONFIGS.map((config) => scheduleProviderSync(config));
};
