import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../integrations/openfoodfacts/openFoodFactsService.js', () => ({
  searchOpenFoodFactsByBarcodeFields: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { searchOpenFoodFactsByBarcodeFields } from '../integrations/openfoodfacts/openFoodFactsService.js';
import {
  lookupSupplementInOpenFoodFacts,
  mapOpenFoodFactsSupplement,
} from '../services/supplementOpenFoodFactsService.js';

describe('mapOpenFoodFactsSupplement', () => {
  it('uses the per-serving amounts, converted from grams', () => {
    const product = mapOpenFoodFactsSupplement({
      code: '4009932004533',
      product_name: 'A-Z Depot Tabletten',
      brands: 'Doppelherz, Queisser Pharma',
      serving_size: '1 tablet',
      nutriments: {
        'vitamin-c_serving': 0.08,
        'vitamin-d_serving': 0.000005,
        zinc_serving: 0.01,
        'energy-kcal_serving': 2,
        // per-100 g values are not a dose
        'vitamin-c_100g': 4,
      },
    });

    expect(product.source).toBe('off');
    expect(product.brand).toBe('Doppelherz');
    expect(product.name).toBe('Doppelherz A-Z Depot Tabletten');
    expect(product.form).toBe('tablet');
    expect(product.serving).toBe('1 tablet');
    const vitaminD = product.catalog.find((c) => c.catalogId === 'vitamin_d');
    expect(vitaminD?.amount).toBeCloseTo(5, 3);
    expect(product.fixed).toEqual(
      expect.arrayContaining([
        { key: 'calories', amount: 2 },
        { key: 'vitamin_c', amount: 80 },
      ])
    );
  });

  it('still names a product that has no per-serving nutrients', () => {
    const product = mapOpenFoodFactsSupplement({
      code: '1',
      product_name: 'Vitamin D3 1000 IU',
      brands: 'Holland & Barrett',
      nutriments: { 'vitamin-d_100g': 0.00001 },
    });

    expect(product.name).toBe('Holland & Barrett Vitamin D3 1000 IU');
    expect(product.fixed).toEqual([]);
    expect(product.catalog).toEqual([]);
  });
});

describe('lookupSupplementInOpenFoodFacts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is null when Open Food Facts has no such product', async () => {
    vi.mocked(searchOpenFoodFactsByBarcodeFields).mockResolvedValue({
      status: 0,
      status_verbose: 'product not found',
    });

    expect(
      await lookupSupplementInOpenFoodFacts('1', { userId: 'u1' })
    ).toBeNull();
  });

  it('is null, not an error, when Open Food Facts cannot be reached', async () => {
    vi.mocked(searchOpenFoodFactsByBarcodeFields).mockRejectedValue(
      new Error('503')
    );

    expect(
      await lookupSupplementInOpenFoodFacts('1', { userId: 'u1' })
    ).toBeNull();
  });

  it('maps the product it finds', async () => {
    vi.mocked(searchOpenFoodFactsByBarcodeFields).mockResolvedValue({
      status: 1,
      status_verbose: 'product found',
      product: { code: '2', product_name: 'Magnesium', brands: 'Acme' },
    } as never);

    const product = await lookupSupplementInOpenFoodFacts('2', {
      userId: 'u1',
      providerId: 'p2',
    });

    expect(product?.source).toBe('off');
    expect(searchOpenFoodFactsByBarcodeFields).toHaveBeenCalledWith(
      '2',
      expect.arrayContaining(['nutriments']),
      'en',
      'u1',
      'p2'
    );
  });
});
