import { beforeEach, describe, expect, it, vi } from 'vitest';
import externalProviderRepository from '../models/externalProviderRepository.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import externalProviderService from '../services/externalProviderService.js';

vi.mock('../models/externalProviderRepository.js');
vi.mock('../models/globalSettingsRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock(
  '../integrations/openfoodfacts/openFoodFactsAuth.js',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../integrations/openfoodfacts/openFoodFactsAuth.js')
      >();
    return {
      ...actual,
      invalidateOpenFoodFactsSession: vi.fn(),
      assertSecureOpenFoodFactsWriteBaseUrl: vi.fn(
        (url?: string | null) => url ?? 'https://world.openfoodfacts.org'
      ),
    };
  }
);
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const USER_ID = 'user-1';
const publicProviderOwnedByUser = {
  id: 'global-provider',
  user_id: USER_ID,
  provider_type: 'openfoodfacts',
  is_active: true,
  is_public: true,
  app_id: 'global-user',
  app_key: 'global-password',
};
const privateProvider = {
  id: 'personal-provider',
  user_id: USER_ID,
  provider_type: 'openfoodfacts',
  is_active: true,
  is_public: false,
  app_id: 'personal-user',
  app_key: 'personal-password',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(
    externalProviderRepository.getExternalDataProviders
  ).mockResolvedValue([publicProviderOwnedByUser, privateProvider]);
  vi.mocked(
    globalSettingsRepository.isOpenFoodFactsContributionAllowed
  ).mockResolvedValue(true);
  vi.mocked(
    preferenceRepository.getOpenFoodFactsContributionPreferences
  ).mockResolvedValue({
    enabled: true,
    productLanguage: 'en',
    backfillPending: false,
  });
});

describe('Open Food Facts automatic provider selection', () => {
  it('keeps provider rows credential-only and prefers a private personal account', async () => {
    await expect(
      externalProviderService.getAutomaticOpenFoodFactsProvider(USER_ID)
    ).resolves.toEqual({
      id: 'personal-provider',
      scope: 'personal',
      configurationIdentity: expect.any(String),
    });
  });

  it('requires both the server gate and the individual user consent', async () => {
    vi.mocked(
      globalSettingsRepository.isOpenFoodFactsContributionAllowed
    ).mockResolvedValue(false);

    await expect(
      externalProviderService.getAutomaticOpenFoodFactsProvider(USER_ID)
    ).resolves.toBeNull();

    vi.mocked(
      globalSettingsRepository.isOpenFoodFactsContributionAllowed
    ).mockResolvedValue(true);
    vi.mocked(
      preferenceRepository.getOpenFoodFactsContributionPreferences
    ).mockResolvedValue({
      enabled: false,
      productLanguage: 'en',
      backfillPending: false,
    });

    await expect(
      externalProviderService.getAutomaticOpenFoodFactsProvider(USER_ID)
    ).resolves.toBeNull();
  });

  it('classifies a public row as global even when the signed-in admin owns it', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviders
    ).mockResolvedValue([publicProviderOwnedByUser]);

    await expect(
      externalProviderService.getAvailableOpenFoodFactsProvider(USER_ID)
    ).resolves.toEqual({
      id: 'global-provider',
      scope: 'global',
      configurationIdentity: expect.any(String),
    });
  });
});
