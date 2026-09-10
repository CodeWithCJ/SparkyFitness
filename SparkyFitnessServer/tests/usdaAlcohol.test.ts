import { describe, expect, it } from 'vitest';
import { mapUsdaBarcodeProduct } from '../integrations/usda/usdaService.js';

describe('USDA alcohol mapping (#1925)', () => {
  it('maps FDC nutrient 1018 directly to alcohol_g without setting abv_percent', () => {
    const usdaFood = {
      fdcId: 123456,
      description: 'Red Wine',
      servingSize: 150,
      servingSizeUnit: 'ml',
      foodNutrients: [
        {
          nutrientId: 1008,
          nutrientName: 'Energy',
          nutrientNumber: '208',
          unitName: 'kcal',
          value: 85, // 85 kcal per 100g
        },
        {
          nutrientId: 1018,
          nutrientName: 'Alcohol, ethyl',
          nutrientNumber: '221',
          unitName: 'g',
          value: 10.6, // 10.6 g alcohol per 100g -> 15.9 g per 150ml
        },
      ],
    };

    const food = mapUsdaBarcodeProduct(usdaFood as any);
    const variant = food.default_variant;

    expect(variant).toBeDefined();
    // 10.6 * (150 / 100) = 15.9 g
    expect(variant?.alcohol_g).toBeCloseTo(15.9, 1);
    // USDA does not report ABV% metadata, so abv_percent should remain undefined
    expect(variant?.abv_percent).toBeUndefined();
  });
});
