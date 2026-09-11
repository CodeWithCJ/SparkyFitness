import { describe, expect, it } from 'vitest';
import { mapOpenFoodFactsProduct } from '../integrations/openfoodfacts/openFoodFactsService.js';

describe('OpenFoodFacts alcohol mapping (#1925)', () => {
  it('maps OFF alcohol_100g to abv_percent and derives alcohol_g from volume', () => {
    const product = {
      product_name: 'Craft IPA',
      serving_quantity: 330,
      serving_size: '330 ml',
      nutriments: {
        'energy-kcal_100g': 45,
        alcohol_100g: 5.0, // In OFF, alcohol_100g is % ABV
        proteins_100g: 0.5,
        carbohydrates_100g: 3.5,
        fat_100g: 0,
      },
    };

    const food = mapOpenFoodFactsProduct(product as any);
    const variant = food.default_variant;

    expect(variant).toBeDefined();
    // abv_percent is set directly to 5.0
    expect(variant?.abv_percent).toBe(5.0);
    // alcohol_g derived: 330 ml * 0.05 * 0.789 = 13.0185 g pure ethanol
    expect(variant?.alcohol_g).toBeCloseTo(13.019, 3);
    // alcohol is excluded from raw provider_nutrients sweep
    expect(variant?.provider_nutrients?.['alcohol']).toBeUndefined();
  });

  // A record with no serving_quantity_unit, no product_quantity_unit and no
  // unit in its free-text serving_size used to fall back to grams, so a real
  // beer imported as "Nutrition per 100 g" -- a mass the source never claimed.
  it('reads a unitless drink as millilitres, not grams', () => {
    const product = {
      product_name: 'Heineken',
      nutriments: {
        'energy-kcal_100g': 42,
        alcohol_100g: 5.0,
      },
    };

    const variant = mapOpenFoodFactsProduct(product as any).default_variant;

    expect(variant?.serving_unit).toBe('ml');
    expect(variant?.serving_size).toBe(100);
    // 100 ml * 0.05 * 0.789, now through the volume table rather than by
    // treating a gram figure as a millilitre one.
    expect(variant?.alcohol_g).toBeCloseTo(3.945, 3);
  });

  it('reads a unitless soft drink as millilitres from its pack quantity', () => {
    const product = {
      product_name: 'Cola',
      product_quantity_unit: 'ml',
      nutriments: { 'energy-kcal_100g': 42 },
    };

    expect(
      mapOpenFoodFactsProduct(product as any).default_variant?.serving_unit
    ).toBe('ml');
  });

  it('still reads a unitless solid as grams', () => {
    const product = {
      product_name: 'Cheddar',
      nutriments: { 'energy-kcal_100g': 400, fat_100g: 33 },
    };

    expect(
      mapOpenFoodFactsProduct(product as any).default_variant?.serving_unit
    ).toBe('g');
  });

  it('lets a stated unit win over the drink inference', () => {
    // Alcohol powder and rum cake are real products; the record says grams, so
    // the inference must not override it.
    const product = {
      product_name: 'Rum Cake',
      serving_quantity_unit: 'g',
      nutriments: { 'energy-kcal_100g': 350, alcohol_100g: 1.2 },
    };

    expect(
      mapOpenFoodFactsProduct(product as any).default_variant?.serving_unit
    ).toBe('g');
  });

  it('handles OFF product without alcohol gracefully', () => {
    const product = {
      product_name: 'Orange Juice',
      serving_quantity: 250,
      serving_size: '250 ml',
      nutriments: {
        'energy-kcal_100g': 45,
        proteins_100g: 0.7,
      },
    };

    const food = mapOpenFoodFactsProduct(product as any);
    const variant = food.default_variant;

    expect(variant?.abv_percent).toBeUndefined();
    expect(variant?.alcohol_g).toBe(0);
  });
});
