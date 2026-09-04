import { beforeEach, describe, expect, it, vi } from 'vitest';
import { log } from '../config/logging.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import openFoodFactsSyncQueueRepository from '../models/openFoodFactsSyncQueueRepository.js';
import externalProviderService from '../services/externalProviderService.js';
import {
  getOpenFoodFactsSyncSettings,
  saveGlobalSettingsWithOpenFoodFactsSync,
  updateOpenFoodFactsSyncSettings,
} from '../services/openFoodFactsSyncSettingsService.js';
import { refreshOpenFoodFactsAutoSyncSchedule } from '../services/openFoodFactsAutoSyncScheduler.js';

vi.mock('../models/globalSettingsRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../models/openFoodFactsSyncQueueRepository.js');
vi.mock('../services/externalProviderService.js');
vi.mock('../services/openFoodFactsAutoSyncScheduler.js', () => ({
  refreshOpenFoodFactsAutoSyncSchedule: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const USER_ID = 'user-1';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(
    openFoodFactsSyncQueueRepository.getStatusForUser
  ).mockResolvedValue({
    status: { pending: 2, processing: 1, failed: 1, succeeded: 4 },
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

describe('getOpenFoodFactsSyncSettings', () => {
  it('reports the independent server and user consent gates plus queue visibility', async () => {
    vi.mocked(
      globalSettingsRepository.isOpenFoodFactsContributionAllowed
    ).mockResolvedValue(false);
    vi.mocked(
      preferenceRepository.getOpenFoodFactsContributionPreferences
    ).mockResolvedValue({
      enabled: true,
      productLanguage: 'de',
      backfillPending: false,
    });

    await expect(getOpenFoodFactsSyncSettings(USER_ID)).resolves.toEqual({
      serverEnabled: false,
      userEnabled: true,
      productLanguage: 'de',
      providerScope: 'personal',
      status: { pending: 2, processing: 1, failed: 1, succeeded: 4 },
      recentFailures: [],
    });
  });
});

describe('updateOpenFoodFactsSyncSettings', () => {
  it('leaves consent-transition backfill decisions entirely to the database', async () => {
    vi.mocked(
      preferenceRepository.setOpenFoodFactsContributionPreferences
    ).mockResolvedValue({
      enabled: true,
      productLanguage: 'de',
      backfillPending: true,
    });
    vi.mocked(
      globalSettingsRepository.isOpenFoodFactsContributionAllowed
    ).mockResolvedValue(true);
    vi.mocked(
      preferenceRepository.getOpenFoodFactsContributionPreferences
    ).mockResolvedValueOnce({
      enabled: true,
      productLanguage: 'de',
      backfillPending: true,
    });

    await updateOpenFoodFactsSyncSettings(USER_ID, {
      enabled: true,
      productLanguage: 'de',
    });

    expect(
      preferenceRepository.setOpenFoodFactsContributionPreferences
    ).toHaveBeenCalledWith(USER_ID, {
      enabled: true,
      productLanguage: 'de',
    });
    expect(
      preferenceRepository.getOpenFoodFactsContributionPreferences
    ).toHaveBeenCalledTimes(1);
    expect(refreshOpenFoodFactsAutoSyncSchedule).toHaveBeenCalledOnce();
  });

  it('relies on the database opt-out trigger and always reconciles the scheduler', async () => {
    vi.mocked(
      preferenceRepository.setOpenFoodFactsContributionPreferences
    ).mockResolvedValue({
      enabled: false,
      productLanguage: 'en',
      backfillPending: false,
    });
    vi.mocked(
      globalSettingsRepository.isOpenFoodFactsContributionAllowed
    ).mockResolvedValue(true);
    vi.mocked(
      preferenceRepository.getOpenFoodFactsContributionPreferences
    ).mockResolvedValueOnce({
      enabled: false,
      productLanguage: 'en',
      backfillPending: false,
    });

    await updateOpenFoodFactsSyncSettings(USER_ID, {
      enabled: false,
      productLanguage: 'en',
    });

    expect(
      preferenceRepository.getOpenFoodFactsContributionPreferences
    ).toHaveBeenCalledTimes(1);
    expect(refreshOpenFoodFactsAutoSyncSchedule).toHaveBeenCalledOnce();
  });

  it('reconciles the scheduler when a same-value retry follows an interrupted save', async () => {
    vi.mocked(
      preferenceRepository.getOpenFoodFactsContributionPreferences
    ).mockResolvedValue({
      enabled: true,
      productLanguage: 'de',
      backfillPending: false,
    });
    vi.mocked(
      preferenceRepository.setOpenFoodFactsContributionPreferences
    ).mockResolvedValue({
      enabled: true,
      productLanguage: 'de',
      backfillPending: false,
    });
    vi.mocked(
      globalSettingsRepository.isOpenFoodFactsContributionAllowed
    ).mockResolvedValue(true);

    await updateOpenFoodFactsSyncSettings(USER_ID, {
      enabled: true,
      productLanguage: 'de',
    });

    expect(
      preferenceRepository.setOpenFoodFactsContributionPreferences
    ).toHaveBeenCalledWith(USER_ID, {
      enabled: true,
      productLanguage: 'de',
    });
    expect(
      preferenceRepository.getOpenFoodFactsContributionPreferences
    ).toHaveBeenCalledTimes(1);
    expect(refreshOpenFoodFactsAutoSyncSchedule).toHaveBeenCalledOnce();
  });

  it('returns the saved settings when post-commit scheduler reconciliation fails', async () => {
    const schedulerError = new Error('scheduler database unavailable');
    vi.mocked(
      preferenceRepository.setOpenFoodFactsContributionPreferences
    ).mockResolvedValue({
      enabled: true,
      productLanguage: 'de',
      backfillPending: false,
    });
    vi.mocked(
      globalSettingsRepository.isOpenFoodFactsContributionAllowed
    ).mockResolvedValue(true);
    vi.mocked(
      preferenceRepository.getOpenFoodFactsContributionPreferences
    ).mockResolvedValue({
      enabled: true,
      productLanguage: 'de',
      backfillPending: false,
    });
    vi.mocked(refreshOpenFoodFactsAutoSyncSchedule).mockRejectedValueOnce(
      schedulerError
    );

    await expect(
      updateOpenFoodFactsSyncSettings(USER_ID, {
        enabled: true,
        productLanguage: 'de',
      })
    ).resolves.toEqual({
      serverEnabled: true,
      userEnabled: true,
      productLanguage: 'de',
      providerScope: 'personal',
      status: { pending: 2, processing: 1, failed: 1, succeeded: 4 },
      recentFailures: [],
    });
    expect(log).toHaveBeenCalledWith(
      'warn',
      '[OpenFoodFacts] Settings saved but automatic sync schedule refresh failed; the activity watcher will retry:',
      schedulerError
    );
  });
});

describe('saveGlobalSettingsWithOpenFoodFactsSync', () => {
  it('lets the database atomically mark opted-in users when the server gate turns on', async () => {
    vi.mocked(globalSettingsRepository.saveGlobalSettings).mockResolvedValue({
      allow_openfoodfacts_contributions: true,
    });

    await saveGlobalSettingsWithOpenFoodFactsSync({
      allow_openfoodfacts_contributions: true,
    });

    expect(refreshOpenFoodFactsAutoSyncSchedule).toHaveBeenCalledOnce();
  });

  it('lets the server gate stop claims without a post-commit queue cleanup', async () => {
    vi.mocked(globalSettingsRepository.saveGlobalSettings).mockResolvedValue({
      allow_openfoodfacts_contributions: false,
    });

    await saveGlobalSettingsWithOpenFoodFactsSync({
      allow_openfoodfacts_contributions: false,
    });

    expect(refreshOpenFoodFactsAutoSyncSchedule).toHaveBeenCalledOnce();
  });

  it('does not requeue the catalog but still reconciles scheduling after every global save', async () => {
    vi.mocked(globalSettingsRepository.saveGlobalSettings).mockResolvedValue({
      allow_openfoodfacts_contributions: true,
    });

    await saveGlobalSettingsWithOpenFoodFactsSync({
      allow_user_ai_config: false,
    });

    expect(refreshOpenFoodFactsAutoSyncSchedule).toHaveBeenCalledOnce();
  });

  it('returns the durable global settings when scheduler reconciliation fails', async () => {
    const schedulerError = new Error('scheduler database unavailable');
    const saved = { allow_openfoodfacts_contributions: true };
    vi.mocked(globalSettingsRepository.saveGlobalSettings).mockResolvedValue(
      saved
    );
    vi.mocked(refreshOpenFoodFactsAutoSyncSchedule).mockRejectedValueOnce(
      schedulerError
    );

    await expect(
      saveGlobalSettingsWithOpenFoodFactsSync({
        allow_openfoodfacts_contributions: true,
      })
    ).resolves.toEqual(saved);
    expect(log).toHaveBeenCalledWith(
      'warn',
      '[OpenFoodFacts] Settings saved but automatic sync schedule refresh failed; the activity watcher will retry:',
      schedulerError
    );
  });
});
