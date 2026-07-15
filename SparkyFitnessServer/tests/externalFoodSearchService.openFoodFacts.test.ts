import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../services/foodIntegrationService.js', () => ({
  getFatSecretNutrients: vi.fn(),
  searchFatSecretFoods: vi.fn(),
  searchMealieFoods: vi.fn(),
  searchTandoorFoods: vi.fn(),
  searchNorishFoods: vi.fn(),
}));

vi.mock('../integrations/fatsecret/fatsecretService.js', () => ({
  mapFatSecretSearchItem: vi.fn((item) => item),
  mapFatSecretFood: vi.fn(),
  foodNutrientCache: new Map(),
  getFatSecretAccessToken: vi.fn(),
}));

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../services/externalProviderService.js', () => ({
  default: {
    getExternalDataProviderDetails: vi.fn(),
    getActiveOpenFoodFactsProviderId: vi.fn(),
  },
}));
vi.mock('../services/preferenceService.js', () => ({
  default: { getUserPreferences: vi.fn() },
}));
vi.mock('../integrations/openfoodfacts/openFoodFactsService.js', () => ({
  searchOpenFoodFacts: vi.fn(),
  mapOpenFoodFactsProduct: vi.fn(),
}));
vi.mock('../integrations/usda/usdaService.js', () => ({
  searchUsdaFoods: vi.fn(),
  mapUsdaBarcodeProduct: vi.fn(),
}));
vi.mock('../integrations/yazio/yazioService.js', () => ({
  searchYazioFoods: vi.fn(),
}));
vi.mock('../integrations/swissfood/swissFoodService.js', () => ({
  searchSwissFoods: vi.fn(),
}));

import externalProviderService from '../services/externalProviderService.js';
import { resolveOpenFoodFactsProviderId } from '../services/externalFoodSearchService.js';

const mockGetDetails = vi.mocked(
  externalProviderService.getExternalDataProviderDetails
);
const mockGetActiveId = vi.mocked(
  externalProviderService.getActiveOpenFoodFactsProviderId
);

const USER_ID = 'user-A';
const PROVIDER_ID = 'prov-1';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveOpenFoodFactsProviderId', () => {
  it('accepts an explicit providerId for a self-hosted provider with no credentials', async () => {
    // @ts-expect-error test doubles only need the fields the code under test reads
    mockGetDetails.mockResolvedValue({
      is_active: true,
      provider_type: 'openfoodfacts',
      app_id: null,
      app_key: null,
      base_url: 'http://sparkyfitness-foodfacts:8080',
    });

    const id = await resolveOpenFoodFactsProviderId(USER_ID, PROVIDER_ID);

    expect(id).toBe(PROVIDER_ID);
    expect(mockGetActiveId).not.toHaveBeenCalled();
  });

  it('rejects an explicit providerId that is inactive', async () => {
    // @ts-expect-error test doubles only need the fields the code under test reads
    mockGetDetails.mockResolvedValue({
      is_active: false,
      provider_type: 'openfoodfacts',
    });

    const id = await resolveOpenFoodFactsProviderId(USER_ID, PROVIDER_ID);

    expect(id).toBe(null);
  });

  it('rejects an explicit providerId of the wrong provider type', async () => {
    // @ts-expect-error test doubles only need the fields the code under test reads
    mockGetDetails.mockResolvedValue({
      is_active: true,
      provider_type: 'fatsecret',
    });

    const id = await resolveOpenFoodFactsProviderId(USER_ID, PROVIDER_ID);

    expect(id).toBe(null);
  });

  it('falls back to getActiveOpenFoodFactsProviderId when no providerId is given', async () => {
    mockGetActiveId.mockResolvedValue('active-id');

    const id = await resolveOpenFoodFactsProviderId(USER_ID, undefined);

    expect(id).toBe('active-id');
    expect(mockGetDetails).not.toHaveBeenCalled();
  });
});
