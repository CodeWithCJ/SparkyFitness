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
vi.mock('../integrations/cnf/cnfService.js', () => ({
  searchCanadianNutrientFoods: vi.fn(),
  getCanadianNutrientFoodDetails: vi.fn(),
}));
vi.mock('../integrations/livsmedelsverket/livsmedelsverketService.js', () => ({
  searchLivsmedelsverketFoods: vi.fn(),
  getLivsmedelsverketFoodDetails: vi.fn(),
}));

import {
  searchLivsmedelsverketFoods,
  getLivsmedelsverketFoodDetails,
} from '../integrations/livsmedelsverket/livsmedelsverketService.js';
import {
  searchProviderFoods,
  resolveProviderCredentials,
} from '../services/externalFoodSearchService.js';
import { fetchProviderFoodDetails } from '../services/foodProviderDetailService.js';

const mockSearchLivsmedelsverketFoods = vi.mocked(searchLivsmedelsverketFoods);
const mockGetLivsmedelsverketFoodDetails = vi.mocked(
  getLivsmedelsverketFoodDetails
);

describe('externalFoodSearchService - livsmedelsverket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveProviderCredentials', () => {
    it('returns empty object when providerId is omitted for livsmedelsverket', async () => {
      const creds = await resolveProviderCredentials(
        'user-1',
        undefined,
        'livsmedelsverket'
      );
      expect(creds).toEqual({});
    });
  });

  describe('searchProviderFoods', () => {
    it('delegates to searchLivsmedelsverketFoods and ranks matches', async () => {
      mockSearchLivsmedelsverketFoods.mockResolvedValue({
        foods: [
          {
            name: 'Knäckebröd',
            brand: 'Swedish Food Agency (Livsmedelsverket)',
            provider_external_id: '101',
            provider_type: 'livsmedelsverket',
            is_custom: false,
            default_variant: {
              serving_size: 100,
              serving_unit: 'g',
              calories: 350,
              protein: 10,
              carbs: 65,
              fat: 2,
              is_default: true,
            },
            variants: [],
          },
        ],
        pagination: { page: 1, pageSize: 20, totalCount: 1, hasMore: false },
      });

      const res = await searchProviderFoods(
        'user-1',
        'livsmedelsverket',
        'knäckebröd',
        { page: 1, pageSize: 20 }
      );

      expect(mockSearchLivsmedelsverketFoods).toHaveBeenCalledWith(
        'knäckebröd',
        1,
        20,
        'en',
        undefined
      );
      expect(res.foods).toHaveLength(1);
      expect((res.foods[0] as { name: string }).name).toBe('Knäckebröd');
    });
  });

  describe('fetchProviderFoodDetails', () => {
    it('delegates to getLivsmedelsverketFoodDetails without requiring providerId', async () => {
      mockGetLivsmedelsverketFoodDetails.mockResolvedValue({
        name: 'Ägg kokt',
        brand: 'Swedish Food Agency (Livsmedelsverket)',
        provider_external_id: '202',
        provider_type: 'livsmedelsverket',
        is_custom: false,
        default_variant: {
          serving_size: 100,
          serving_unit: 'g',
          calories: 140,
          protein: 12.5,
          carbs: 0.5,
          fat: 10,
          is_default: true,
        },
        variants: [],
      });

      const result = await fetchProviderFoodDetails({
        credentialUserId: 'user-1',
        dataUserId: 'user-1',
        providerType: 'livsmedelsverket',
        externalId: '202',
        language: 'sv',
      });

      expect(mockGetLivsmedelsverketFoodDetails).toHaveBeenCalledWith(
        '202',
        'sv',
        undefined
      );
      expect(result).not.toBeNull();
      expect((result as { name: string }).name).toBe('Ägg kokt');
    });
  });
});
