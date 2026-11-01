import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../services/externalFoodSearchService.js', () => ({
  isValidProviderType: vi.fn(() => true),
  resolveOpenFoodFactsProviderId: vi.fn(async () => null),
  resolveProviderCredentials: vi.fn(async () => ({})),
}));
vi.mock(
  '../integrations/openfoodfacts/openFoodFactsService.js',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    searchOpenFoodFactsByBarcodeFields: vi.fn(),
  })
);

import { searchOpenFoodFactsByBarcodeFields } from '../integrations/openfoodfacts/openFoodFactsService.js';
import { fetchProviderFoodDetails } from '../services/foodProviderDetailService.js';

// Product Opener can hold a product whose nutrients are missing; the mapper
// turns those into zeros.
const productWithoutNutrients = {
  code: '0071315040159',
  product_name: 'Bread',
  nutriments: {},
};

function fetchBread(requireNutrition?: boolean) {
  return fetchProviderFoodDetails({
    credentialUserId: 'user-1',
    dataUserId: 'user-1',
    providerType: 'openfoodfacts',
    externalId: '0071315040159',
    requireNutrition,
  });
}

describe('fetchProviderFoodDetails - openfoodfacts nutrition', () => {
  beforeEach(() => {
    vi.mocked(searchOpenFoodFactsByBarcodeFields).mockResolvedValue({
      status: 1,
      product: productWithoutNutrients,
    } as never);
  });

  it('returns null for a product without nutrients when nutrition is required', async () => {
    expect(await fetchBread(true)).toBeNull();
  });

  it('still returns the product when nutrition is not required', async () => {
    expect(await fetchBread()).toMatchObject({ name: 'Bread' });
  });

  function serve(product: Record<string, unknown>) {
    vi.mocked(searchOpenFoodFactsByBarcodeFields).mockResolvedValue({
      status: 1,
      product: { code: '0071315040159', product_name: 'Bread', ...product },
    } as never);
  }

  it('returns null when only some core nutrients are declared', async () => {
    serve({ nutriments: { 'energy-kcal_100g': 250 } });
    expect(await fetchBread(true)).toBeNull();
    serve({
      nutriments: {
        'energy-kcal_100g': 250,
        proteins_100g: 9,
        carbohydrates_100g: 48,
      },
    });
    expect(await fetchBread(true)).toBeNull();
  });

  it('keeps a declared zero and accepts energy in kJ', async () => {
    serve({
      nutriments: {
        'energy-kj_100g': 1046,
        proteins_100g: 9,
        carbohydrates_100g: 48,
        fat_100g: 0,
      },
    });
    expect(await fetchBread(true)).toMatchObject({
      name: 'Bread',
      default_variant: { fat: 0 },
    });
  });

  it('accepts per-serving values only with a serving quantity', async () => {
    const nutriments = {
      'energy-kcal_serving': 75,
      proteins_serving: 2.7,
      carbohydrates_serving: 14.4,
      fat_serving: 1,
    };
    serve({ nutriments });
    expect(await fetchBread(true)).toBeNull();
    serve({ nutriments, serving_quantity: 30 });
    expect(await fetchBread(true)).toMatchObject({ name: 'Bread' });
  });

  it('accepts a mix of per-100 g and per-serving values', async () => {
    serve({
      serving_quantity: 50,
      nutriments: {
        'energy-kcal_100g': 250,
        proteins_serving: 4.5,
        carbohydrates_100g: 48,
        fat_serving: 1,
      },
    });
    expect(await fetchBread(true)).toMatchObject({
      default_variant: {
        serving_size: 50,
        calories: 125,
        protein: 4.5,
        carbs: 24,
        fat: 1,
      },
    });
  });
});
