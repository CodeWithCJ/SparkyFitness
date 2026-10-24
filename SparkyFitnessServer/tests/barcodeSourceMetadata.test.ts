import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BARCODE_FALLBACK_PROVIDER_ID } from '@workspace/shared';
import foodRepository from '../models/foodRepository.js';
import externalProviderService from '../services/externalProviderService.js';
import { lookupBarcode } from '../services/foodCoreService.js';
import { searchOpenFoodFactsByBarcodeFields } from '../integrations/openfoodfacts/openFoodFactsService.js';
import { searchUsdaFoodsByBarcode } from '../integrations/usda/usdaService.js';

vi.mock('../models/foodRepository.js');
vi.mock('../services/preferenceService.js');
vi.mock('../services/externalProviderService.js');
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../integrations/usda/usdaService.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../integrations/usda/usdaService.js')
  >()),
  searchUsdaFoodsByBarcode: vi.fn(),
}));
vi.mock(
  '../integrations/openfoodfacts/openFoodFactsService.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../integrations/openfoodfacts/openFoodFactsService.js')
    >()),
    searchOpenFoodFactsByBarcodeFields: vi.fn(),
  })
);

const barcode = '3017620422003';
const providerId = '11111111-1111-4111-8111-111111111111';
const fallbackId = '22222222-2222-4222-8222-222222222222';
type ProviderDetails = NonNullable<
  Awaited<
    ReturnType<typeof externalProviderService.getExternalDataProviderDetails>
  >
>;
const makeProvider = (
  id = providerId,
  type = 'usda',
  name = 'Primary database'
): ProviderDetails => ({
  id,
  provider_name: name,
  provider_type: type,
  user_id: 'actor',
  is_public: false,
  is_active: true,
  base_url: null,
  sync_frequency: 'manual',
  app_id: null,
  app_key: 'provider-test-key',
  token_expires_at: null,
  external_user_id: null,
  garth_dump: null,
  is_strictly_private: false,
  categories: ['food'],
  required_fields: [],
  field_labels: {},
  supports_barcode: true,
});
const options = {
  includeProviderMetadata: true,
  preferences: {
    default_barcode_provider_id: providerId,
    barcode_fallback_open_food_facts: true,
    language: 'en',
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(foodRepository.findFoodByBarcode).mockResolvedValue(null);
  vi.mocked(
    externalProviderService.getExternalDataProviderDetails
  ).mockImplementation(async (_actor, id) =>
    id === fallbackId
      ? makeProvider(fallbackId, 'openfoodfacts', 'Backup database')
      : makeProvider()
  );
  vi.mocked(
    externalProviderService.getActiveOpenFoodFactsProviderId
  ).mockResolvedValue(null);
  vi.mocked(searchUsdaFoodsByBarcode).mockResolvedValue({ foods: [] });
  vi.mocked(searchOpenFoodFactsByBarcodeFields).mockResolvedValue({
    status: 1,
    status_verbose: 'product found',
    product: {
      code: barcode,
      product_name: 'Spread',
      nutriments: { 'energy-kcal_100g': 539 },
    },
  });
});

describe('barcode source metadata', () => {
  it('identifies a local match without resolving any external provider', async () => {
    vi.mocked(foodRepository.findFoodByBarcode).mockResolvedValue({
      id: 'local-food',
      name: 'Saved spread',
    });
    const result = await lookupBarcode(
      barcode,
      'profile',
      providerId,
      'actor',
      options
    );
    expect(result).toMatchObject({
      source: 'local',
      providerId: 'local',
      providerName: 'Saved food',
    });
    expect(
      externalProviderService.getExternalDataProviderDetails
    ).not.toHaveBeenCalled();
  });
  it.each([providerId, undefined])(
    'identifies the actual primary provider for explicit/default selection %s',
    async (selectedId) => {
      vi.mocked(searchUsdaFoodsByBarcode).mockResolvedValue({
        foods: [
          {
            fdcId: 42,
            gtinUpc: barcode,
            description: 'Spread',
            foodNutrients: [],
          },
        ],
      });
      const result = await lookupBarcode(
        barcode,
        'profile',
        selectedId,
        'actor',
        options
      );
      expect(result).toMatchObject({
        source: 'usda',
        providerId,
        providerName: 'Primary database',
      });
      expect(
        externalProviderService.getExternalDataProviderDetails
      ).toHaveBeenCalledWith('actor', providerId);
      expect(JSON.stringify(result)).not.toContain('provider-test-key');
    }
  );
  it('identifies the configured OFF fallback instead of the primary provider that missed', async () => {
    vi.mocked(
      externalProviderService.getActiveOpenFoodFactsProviderId
    ).mockResolvedValue(fallbackId);
    const result = await lookupBarcode(
      barcode,
      'profile',
      providerId,
      'actor',
      options
    );
    expect(result).toMatchObject({
      source: 'openfoodfacts',
      providerId: fallbackId,
      providerName: 'Backup database',
    });
    expect(searchOpenFoodFactsByBarcodeFields).toHaveBeenCalledWith(
      barcode,
      undefined,
      'en',
      'actor',
      fallbackId,
      'personal'
    );
    expect(JSON.stringify(result)).not.toContain('provider-test-key');
  });
  it('gives anonymous OFF fallback its stable sentinel identity', async () => {
    const result = await lookupBarcode(
      barcode,
      'profile',
      providerId,
      'actor',
      options
    );
    expect(result).toMatchObject({
      source: 'openfoodfacts',
      providerId: BARCODE_FALLBACK_PROVIDER_ID,
      providerName: 'Open Food Facts',
    });
  });
  it('keeps a successful fallback match when its display-name lookup fails', async () => {
    vi.mocked(
      externalProviderService.getActiveOpenFoodFactsProviderId
    ).mockResolvedValue(fallbackId);
    vi.mocked(
      externalProviderService.getExternalDataProviderDetails
    ).mockImplementation(async (_actor, id) => {
      if (id === fallbackId) throw new Error('Provider metadata unavailable');
      return makeProvider();
    });
    const result = await lookupBarcode(
      barcode,
      'profile',
      providerId,
      'actor',
      options
    );
    expect(result).toMatchObject({
      source: 'openfoodfacts',
      providerId: fallbackId,
      providerName: 'Open Food Facts',
    });
  });
  it('preserves the legacy response shape and avoids display-name reads unless requested', async () => {
    vi.mocked(
      externalProviderService.getActiveOpenFoodFactsProviderId
    ).mockResolvedValue(fallbackId);
    const result = await lookupBarcode(
      barcode,
      'profile',
      providerId,
      'actor',
      { preferences: options.preferences }
    );
    expect(result).not.toHaveProperty('providerId');
    expect(result).not.toHaveProperty('providerName');
    expect(
      externalProviderService.getExternalDataProviderDetails
    ).toHaveBeenCalledTimes(1);
  });
});
