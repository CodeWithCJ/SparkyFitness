import cron from 'node-cron';
import { log } from '../config/logging.js';
import externalProviderRepository from '../models/externalProviderRepository.js';
import { HuaweiHealthError } from '../integrations/huaweihealth/huaweiHealthErrors.js';
import huaweiHealthSyncService from '../integrations/huaweihealth/huaweiHealthSyncService.js';

interface HuaweiProviderForSync {
  user_id: string;
  is_active: boolean;
  sync_frequency: string | null;
}

interface HuaweiSyncSweepDependencies {
  getProviders(providerType: string): Promise<HuaweiProviderForSync[]>;
  sync(userId: string, authenticatedUserId: string): Promise<unknown>;
  logFailure(userId: string, error: unknown): void;
}

export async function runHuaweiHealthSyncSweep(
  dependencies: HuaweiSyncSweepDependencies
): Promise<void> {
  const providers = await dependencies.getProviders('huaweihealth');
  for (const provider of providers) {
    if (!provider.is_active || provider.sync_frequency === 'manual') continue;
    try {
      await dependencies.sync(provider.user_id, provider.user_id);
    } catch (error) {
      dependencies.logFailure(provider.user_id, error);
    }
  }
}

export function scheduleHuaweiHealthSyncs(): void {
  cron.schedule('15 * * * *', async () => {
    await runHuaweiHealthSyncSweep({
      getProviders: (providerType) =>
        externalProviderRepository.getProvidersByType(providerType),
      sync: (userId, authenticatedUserId) =>
        huaweiHealthSyncService.sync(userId, authenticatedUserId),
      logFailure: (userId, error) => {
        const code =
          error instanceof HuaweiHealthError
            ? error.code
            : 'HUAWEI_INTERNAL_ERROR';
        log(
          'error',
          `Scheduled HUAWEI Health sync failed for user ${userId} with ${code}.`
        );
      },
    });
  });
}
