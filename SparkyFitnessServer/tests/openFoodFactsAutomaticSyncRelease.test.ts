import { beforeEach, describe, expect, it, vi } from 'vitest';
import cron from 'node-cron';
import { resolveOpenFoodFactsProvider } from '../integrations/openfoodfacts/openFoodFactsAuth.js';
import { submitOpenFoodFactsProduct } from '../integrations/openfoodfacts/openFoodFactsContribution.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import openFoodFactsSyncQueueRepository from '../models/openFoodFactsSyncQueueRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { contributeFoodToOpenFoodFacts } from '../services/openFoodFactsContributionService.js';
import externalProviderService from '../services/externalProviderService.js';
import foodCoreService from '../services/foodCoreService.js';

vi.mock('node-cron', () => ({
  default: { schedule: vi.fn(() => ({ stop: vi.fn(), destroy: vi.fn() })) },
}));
vi.mock('../models/globalSettingsRepository.js');
vi.mock('../models/openFoodFactsSyncQueueRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../services/openFoodFactsContributionService.js');
vi.mock('../services/externalProviderService.js');
vi.mock('../services/foodCoreService.js');
vi.mock('../integrations/openfoodfacts/openFoodFactsAuth.js');
vi.mock('../integrations/openfoodfacts/openFoodFactsContribution.js');
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

// Use the real release setting. Dormant implementation suites opt in with a
// separate mock; these tests must catch accidental activation in a release.
beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
  vi.mocked(openFoodFactsSyncQueueRepository.isFeatureActive).mockResolvedValue(
    true
  );
  vi.mocked(
    globalSettingsRepository.isOpenFoodFactsContributionAllowed
  ).mockResolvedValue(true);
  vi.mocked(
    preferenceRepository.getOpenFoodFactsContributionPreferences
  ).mockResolvedValue({
    enabled: true,
    productLanguage: 'de',
    backfillPending: true,
  });
  vi.mocked(
    openFoodFactsSyncQueueRepository.getStatusForUser
  ).mockResolvedValue({
    status: { pending: 2, processing: 1, failed: 0, succeeded: 4 },
    recentFailures: [],
  });
  vi.mocked(
    externalProviderService.getAvailableOpenFoodFactsProvider
  ).mockResolvedValue({
    id: 'provider-1',
    scope: 'personal',
    configurationIdentity: 'provider-configuration',
  });
});

describe('Open Food Facts automatic sync is unavailable in the first release', () => {
  it('starts without an activation watcher, worker timer, or database activity probe', async () => {
    const { scheduleOpenFoodFactsAutoSyncOnStartup } =
      await import('../services/openFoodFactsAutoSyncScheduler.js');

    await scheduleOpenFoodFactsAutoSyncOnStartup();

    expect(cron.schedule).not.toHaveBeenCalled();
    expect(
      openFoodFactsSyncQueueRepository.isFeatureActive
    ).not.toHaveBeenCalled();
    expect(openFoodFactsSyncQueueRepository.claimDue).not.toHaveBeenCalled();
  });

  it('does not schedule or probe persisted enabled rows when settings refresh the schedule', async () => {
    const { refreshOpenFoodFactsAutoSyncSchedule } =
      await import('../services/openFoodFactsAutoSyncScheduler.js');

    await refreshOpenFoodFactsAutoSyncSchedule();

    expect(cron.schedule).not.toHaveBeenCalled();
    expect(
      openFoodFactsSyncQueueRepository.isFeatureActive
    ).not.toHaveBeenCalled();
  });

  it('leaves queued and pending backfill work untouched when the worker is invoked directly', async () => {
    const { processOpenFoodFactsAutoSyncBatch } =
      await import('../services/openFoodFactsAutoSyncService.js');
    vi.mocked(openFoodFactsSyncQueueRepository.claimDue)
      .mockResolvedValueOnce([
        { userId: 'user-1', foodId: 'food-1', revision: 4, attemptCount: 1 },
      ])
      .mockResolvedValue([]);

    await expect(processOpenFoodFactsAutoSyncBatch()).resolves.toEqual({
      claimed: 0,
      contributed: 0,
      failed: 0,
      retried: 0,
    });

    for (const operation of Object.values(openFoodFactsSyncQueueRepository)) {
      expect(operation).not.toHaveBeenCalled();
    }
    expect(
      preferenceRepository.getOpenFoodFactsContributionPreferences
    ).not.toHaveBeenCalled();
    expect(contributeFoodToOpenFoodFacts).not.toHaveBeenCalled();
  });

  it('reports automatic sync as disabled even for previously opted-in users', async () => {
    const { getOpenFoodFactsSyncSettings } =
      await import('../services/openFoodFactsSyncSettingsService.js');

    await expect(getOpenFoodFactsSyncSettings('user-1')).resolves.toMatchObject(
      {
        serverEnabled: true,
        userEnabled: false,
        productLanguage: 'de',
        providerScope: 'personal',
      }
    );
  });

  it('rejects a direct automatic contribution before reading food or using provider credentials', async () => {
    const { contributeFoodToOpenFoodFacts: contributeAutomatically } =
      await vi.importActual<
        typeof import('../services/openFoodFactsContributionService.js')
      >('../services/openFoodFactsContributionService.js');

    await expect(
      contributeAutomatically('user-1', 'user-1', 'food-1', {
        productLanguage: 'de',
        queueRevision: 4,
      })
    ).rejects.toMatchObject({ statusCode: 503 });

    expect(foodCoreService.getFoodById).not.toHaveBeenCalled();
    expect(
      externalProviderService.getAutomaticOpenFoodFactsProvider
    ).not.toHaveBeenCalled();
    expect(resolveOpenFoodFactsProvider).not.toHaveBeenCalled();
    expect(submitOpenFoodFactsProduct).not.toHaveBeenCalled();
    expect(
      preferenceRepository.getOpenFoodFactsContributionPreferences
    ).not.toHaveBeenCalled();
    for (const operation of Object.values(openFoodFactsSyncQueueRepository)) {
      expect(operation).not.toHaveBeenCalled();
    }
  });

  it('rejects enabling automatic sync before saving preferences or changing queued work', async () => {
    const { updateOpenFoodFactsSyncSettings } =
      await import('../services/openFoodFactsSyncSettingsService.js');

    await expect(
      updateOpenFoodFactsSyncSettings('user-1', {
        enabled: true,
        productLanguage: 'de',
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(
      preferenceRepository.setOpenFoodFactsContributionPreferences
    ).not.toHaveBeenCalled();
    expect(cron.schedule).not.toHaveBeenCalled();
    for (const operation of Object.values(openFoodFactsSyncQueueRepository)) {
      expect(operation).not.toHaveBeenCalled();
    }
  });

  it('can save a packaging language and opt out without activating automatic sync', async () => {
    const { updateOpenFoodFactsSyncSettings } =
      await import('../services/openFoodFactsSyncSettingsService.js');
    vi.mocked(
      preferenceRepository.getOpenFoodFactsContributionPreferences
    ).mockResolvedValue({
      enabled: false,
      productLanguage: 'fr',
      backfillPending: false,
    });

    await expect(
      updateOpenFoodFactsSyncSettings('user-1', {
        enabled: false,
        productLanguage: 'fr',
      })
    ).resolves.toMatchObject({ userEnabled: false, productLanguage: 'fr' });

    expect(
      preferenceRepository.setOpenFoodFactsContributionPreferences
    ).toHaveBeenCalledWith('user-1', {
      enabled: false,
      productLanguage: 'fr',
    });
    expect(cron.schedule).not.toHaveBeenCalled();
    expect(
      openFoodFactsSyncQueueRepository.isFeatureActive
    ).not.toHaveBeenCalled();
  });
});
