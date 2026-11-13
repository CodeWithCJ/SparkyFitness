import { beforeEach, describe, expect, it, vi } from 'vitest';
import foodRepository from '../models/foodRepository.js';
import externalProviderService from '../services/externalProviderService.js';
import { lookupBarcode } from '../services/foodCoreService.js';
import { searchFatSecretByBarcode } from '../integrations/fatsecret/fatsecretService.js';
import { searchUsdaFoodsByBarcode } from '../integrations/usda/usdaService.js';
import { searchYazioByBarcode } from '../integrations/yazio/yazioService.js';
import { searchOpenFoodFactsByBarcodeFields } from '../integrations/openfoodfacts/openFoodFactsService.js';

vi.mock('../models/foodRepository.js');
vi.mock('../services/preferenceService.js');
vi.mock('../services/externalProviderService.js');
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock(
  '../integrations/fatsecret/fatsecretService.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../integrations/fatsecret/fatsecretService.js')
    >()),
    searchFatSecretByBarcode: vi.fn(),
  })
);
vi.mock('../integrations/usda/usdaService.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../integrations/usda/usdaService.js')
  >()),
  searchUsdaFoodsByBarcode: vi.fn(),
}));
vi.mock('../integrations/yazio/yazioService.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../integrations/yazio/yazioService.js')
  >()),
  searchYazioByBarcode: vi.fn(),
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

type ProviderDetails = NonNullable<
  Awaited<
    ReturnType<typeof externalProviderService.getExternalDataProviderDetails>
  >
>;
const providerId = '11111111-1111-4111-8111-111111111111';
const provider = (type: string): ProviderDetails => ({
  id: providerId,
  provider_name: 'Barcode source',
  provider_type: type,
  user_id: 'actor',
  is_public: false,
  is_active: true,
  base_url: null,
  sync_frequency: 'manual',
  app_id: 'test-client',
  app_key: 'test-credential',
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
  skipLocal: true,
  skipFallback: true,
  ignoreDefaultProvider: true,
  surfaceErrors: true,
  preferences: { language: 'en' },
};
const abortReason = () =>
  new DOMException('Barcode source timed out', 'AbortError');

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(
    externalProviderService.getExternalDataProviderDetails
  ).mockResolvedValue(provider('usda'));
  vi.mocked(searchFatSecretByBarcode).mockResolvedValue(null);
  vi.mocked(searchUsdaFoodsByBarcode).mockResolvedValue({ foods: [] });
  vi.mocked(searchYazioByBarcode).mockResolvedValue(null);
  vi.mocked(searchOpenFoodFactsByBarcodeFields).mockResolvedValue({
    status: 0,
    status_verbose: 'product not found',
  });
});

describe('barcode lookup cancellation', () => {
  it('rejects an already aborted lookup before database or provider work', async () => {
    const controller = new AbortController();
    const reason = abortReason();
    controller.abort(reason);
    await expect(
      lookupBarcode('3017620422003', 'profile', providerId, 'actor', {
        ...options,
        skipLocal: false,
        signal: controller.signal,
      })
    ).rejects.toBe(reason);
    expect(foodRepository.findFoodByBarcode).not.toHaveBeenCalled();
    expect(
      externalProviderService.getExternalDataProviderDetails
    ).not.toHaveBeenCalled();
  });

  it('does not start a provider request if canceled while resolving its configuration', async () => {
    let resolveProvider!: (value: ProviderDetails) => void;
    vi.mocked(
      externalProviderService.getExternalDataProviderDetails
    ).mockReturnValue(
      new Promise((resolve) => {
        resolveProvider = resolve;
      })
    );
    const controller = new AbortController();
    const result = lookupBarcode(
      '3017620422003',
      'profile',
      providerId,
      'actor',
      { ...options, signal: controller.signal }
    );
    await vi.waitFor(() =>
      expect(
        externalProviderService.getExternalDataProviderDetails
      ).toHaveBeenCalledOnce()
    );
    const reason = abortReason();
    controller.abort(reason);
    resolveProvider(provider('usda'));
    await expect(result).rejects.toBe(reason);
    expect(searchUsdaFoodsByBarcode).not.toHaveBeenCalled();
  });

  it.each(['fatsecret', 'usda', 'yazio', 'openfoodfacts'] as const)(
    'passes the source signal to the %s transport',
    async (type) => {
      vi.mocked(
        externalProviderService.getExternalDataProviderDetails
      ).mockResolvedValue(provider(type));
      const controller = new AbortController();
      await lookupBarcode('3017620422003', 'profile', providerId, 'actor', {
        ...options,
        signal: controller.signal,
      });
      const transports = {
        fatsecret: searchFatSecretByBarcode,
        usda: searchUsdaFoodsByBarcode,
        yazio: searchYazioByBarcode,
        openfoodfacts: searchOpenFoodFactsByBarcodeFields,
      };
      const call = vi.mocked(transports[type]).mock.calls[0];
      expect(call?.at(-1)).toBe(controller.signal);
    }
  );

  it('stops alternate UPC/EAN searches and fallback after cancellation', async () => {
    let resolveSearch!: (value: { foods: [] }) => void;
    vi.mocked(searchUsdaFoodsByBarcode).mockReturnValue(
      new Promise((resolve) => {
        resolveSearch = resolve;
      })
    );
    const controller = new AbortController();
    const result = lookupBarcode(
      '123456789012',
      'profile',
      providerId,
      'actor',
      { ...options, skipFallback: false, signal: controller.signal }
    );
    await vi.waitFor(() =>
      expect(searchUsdaFoodsByBarcode).toHaveBeenCalledOnce()
    );
    const reason = abortReason();
    controller.abort(reason);
    resolveSearch({ foods: [] });
    await expect(result).rejects.toBe(reason);
    expect(searchUsdaFoodsByBarcode).toHaveBeenCalledOnce();
    expect(searchOpenFoodFactsByBarcodeFields).not.toHaveBeenCalled();
    expect(
      externalProviderService.getActiveOpenFoodFactsProviderId
    ).not.toHaveBeenCalled();
  });

  it('rejects a late successful provider response after cancellation', async () => {
    vi.mocked(
      externalProviderService.getExternalDataProviderDetails
    ).mockResolvedValue(provider('openfoodfacts'));
    let resolveSearch!: (
      value: Awaited<ReturnType<typeof searchOpenFoodFactsByBarcodeFields>>
    ) => void;
    vi.mocked(searchOpenFoodFactsByBarcodeFields).mockReturnValue(
      new Promise((resolve) => {
        resolveSearch = resolve;
      })
    );
    const controller = new AbortController();
    const result = lookupBarcode(
      '3017620422003',
      'profile',
      providerId,
      'actor',
      { ...options, signal: controller.signal }
    );
    await vi.waitFor(() =>
      expect(searchOpenFoodFactsByBarcodeFields).toHaveBeenCalledOnce()
    );
    const reason = abortReason();
    controller.abort(reason);
    resolveSearch({
      status: 1,
      status_verbose: 'product found',
      product: {
        code: '3017620422003',
        product_name: 'Spread',
        nutriments: { 'energy-kcal_100g': 539 },
      },
    });
    await expect(result).rejects.toBe(reason);
  });
});
