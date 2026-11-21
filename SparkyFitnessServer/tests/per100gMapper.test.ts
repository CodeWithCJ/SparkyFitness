import { describe, it, expect } from 'vitest';
import { buildPer100gFood } from '../integrations/foodProviders/per100gMapper.js';

describe('per100gMapper (buildPer100gFood)', () => {
  it('builds standard 100g default variant with proper rounding', () => {
    const food = buildPer100gFood({
      providerType: 'cooktool' as any,
      externalId: '123',
      name: 'Oats',
      brand: 'Quaker',
      per100g: {
        calories: 389.4,
        protein: 16.89,
        carbs: 66.27,
        fat: 6.9,
        saturated_fat: 1.217,
        dietary_fiber: 10.6,
      },
    });

    expect(food.name).toBe('Oats');
    expect(food.brand).toBe('Quaker');
    expect(food.provider_external_id).toBe('123');
    expect(food.default_variant.serving_size).toBe(100);
    expect(food.default_variant.serving_unit).toBe('g');
    expect(food.default_variant.calories).toBe(389);
    expect(food.default_variant.protein).toBe(16.9);
    expect(food.default_variant.carbs).toBe(66.3);
    expect(food.default_variant.fat).toBe(6.9);
    expect(food.default_variant.saturated_fat).toBe(1.2);
    expect(food.default_variant.dietary_fiber).toBe(10.6);
    expect(food.default_variant.is_default).toBe(true);

    // Unreported nutrients stay undefined, not 0
    expect(food.default_variant.vitamin_c).toBeUndefined();
    expect(food.default_variant.cholesterol).toBeUndefined();
  });

  it('sets serving_unit to ml when isLiquid is true', () => {
    const food = buildPer100gFood({
      providerType: 'cooktool' as any,
      externalId: '456',
      name: 'Milk',
      per100g: {
        calories: 42,
        protein: 3.4,
        carbs: 5.0,
        fat: 1.0,
      },
      isLiquid: true,
    });

    expect(food.default_variant.serving_unit).toBe('ml');
  });

  it('scales portion measures into additional non-default variants', () => {
    const food = buildPer100gFood({
      providerType: 'cooktool' as any,
      externalId: '789',
      name: 'Banana',
      per100g: {
        calories: 89,
        protein: 1.09,
        carbs: 22.84,
        fat: 0.33,
        potassium: 358,
      },
      portions: [
        { description: '1 medium (7" to 7-7/8" long)', grams: 118 },
        { description: '1 cup, sliced', grams: 150 },
      ],
    });

    expect(food.variants).toHaveLength(3); // 1 default 100g + 2 portions
    expect(food.variants[0].is_default).toBe(true);
    expect(food.variants[0].serving_size).toBe(100);

    const mediumBanana = food.variants[1];
    expect(mediumBanana.is_default).toBe(false);
    expect(mediumBanana.serving_size).toBe(118);
    expect(mediumBanana.serving_unit).toBe('1 medium (7" to 7-7/8" long)');
    // 89 * 1.18 = 105.02 -> 105
    expect(mediumBanana.calories).toBe(105);
    // 1.09 * 1.18 = 1.2862 -> 1.3
    expect(mediumBanana.protein).toBe(1.3);
    // 22.84 * 1.18 = 26.9512 -> 27.0
    expect(mediumBanana.carbs).toBe(27.0);
    // 358 * 1.18 = 422.44 -> 422.4
    expect(mediumBanana.potassium).toBe(422.4);

    const cupBanana = food.variants[2];
    expect(cupBanana.serving_size).toBe(150);
    // 89 * 1.5 = 133.5 -> 134
    expect(cupBanana.calories).toBe(134);
  });
});
