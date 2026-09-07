import type {
  OpenFoodFactsAdminSyncStatusResponse,
  OpenFoodFactsAutomaticSyncRequest,
  OpenFoodFactsAutomaticSyncResponse,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import { OPEN_FOOD_FACTS_AUTOMATIC_SYNC_ENABLED } from '../constants/openFoodFacts.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import openFoodFactsSyncQueueRepository from '../models/openFoodFactsSyncQueueRepository.js';
import externalProviderService from './externalProviderService.js';
import { refreshOpenFoodFactsAutoSyncSchedule } from './openFoodFactsAutoSyncScheduler.js';

type GlobalSettingsInput = Record<string, unknown>;

async function refreshOpenFoodFactsAutoSyncScheduleBestEffort(): Promise<void> {
  try {
    await refreshOpenFoodFactsAutoSyncSchedule();
  } catch (error) {
    log(
      'warn',
      '[OpenFoodFacts] Settings saved but automatic sync schedule refresh failed; the activity watcher will retry:',
      error
    );
  }
}

export async function getOpenFoodFactsSyncSettings(
  userId: string
): Promise<OpenFoodFactsAutomaticSyncResponse> {
  const [serverEnabled, preferences, provider, queueState] = await Promise.all([
    globalSettingsRepository.isOpenFoodFactsContributionAllowed(),
    preferenceRepository.getOpenFoodFactsContributionPreferences(userId),
    externalProviderService.getAvailableOpenFoodFactsProvider(userId),
    openFoodFactsSyncQueueRepository.getStatusForUser(userId),
  ]);

  return {
    serverEnabled,
    userEnabled: OPEN_FOOD_FACTS_AUTOMATIC_SYNC_ENABLED && preferences.enabled,
    productLanguage: preferences.productLanguage,
    providerScope: provider?.scope ?? null,
    ...queueState,
  };
}

export async function updateOpenFoodFactsSyncSettings(
  userId: string,
  input: OpenFoodFactsAutomaticSyncRequest
): Promise<OpenFoodFactsAutomaticSyncResponse> {
  if (input.enabled && !OPEN_FOOD_FACTS_AUTOMATIC_SYNC_ENABLED) {
    throw Object.assign(
      new Error('Automatic Open Food Facts contributions are not available.'),
      { statusCode: 409 }
    );
  }

  await preferenceRepository.setOpenFoodFactsContributionPreferences(userId, {
    enabled: input.enabled,
    productLanguage: input.productLanguage,
  });

  // The retained automatic implementation uses database backfill triggers
  // when enabled in a future release. Opt-out cleanup remains active now.
  // Reconcile after every successful save so retrying an already-persisted
  // value repairs a scheduler refresh interrupted by a crash.
  await refreshOpenFoodFactsAutoSyncScheduleBestEffort();

  return getOpenFoodFactsSyncSettings(userId);
}

export async function saveGlobalSettingsWithOpenFoodFactsSync(
  settings: GlobalSettingsInput
): Promise<Record<string, unknown>> {
  const saved = await globalSettingsRepository.saveGlobalSettings(settings);
  // The retained automatic scheduler reconciles after the durable save;
  // its release gate currently makes this a no-op.
  await refreshOpenFoodFactsAutoSyncScheduleBestEffort();

  return saved;
}

export async function getOpenFoodFactsAdminSyncStatus(): Promise<OpenFoodFactsAdminSyncStatusResponse> {
  const [enabled, queueState] = await Promise.all([
    globalSettingsRepository.isOpenFoodFactsContributionAllowed(),
    openFoodFactsSyncQueueRepository.getStatusForAll(),
  ]);
  return { enabled, ...queueState };
}
