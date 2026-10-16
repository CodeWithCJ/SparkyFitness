import * as shared from '@workspace/shared';

describe('named food portions', () => {
  const fish = {
    id: 'reference',
    food_id: 'one-food',
    is_default: true,
    serving_size: 100,
    serving_unit: 'g',
    calories: 120,
    protein: 20,
    carbs: 0,
    fat: 4,
    water_ml: 70,
    caffeine_mg: 2,
    alcohol_g: 1,
    abv_percent: 5,
    glycemic_index: 'Low',
    custom_nutrients: { iodine: '12' },
  };

  it('defines a 150 g packet without changing or duplicating the reference food', () => {
    const before = { ...fish, custom_nutrients: { ...fish.custom_nutrients } };
    const portion = shared.buildNamedFoodPortion(fish, {
      name: 'packet',
      amount: 150,
      unit: 'g',
    });
    expect(portion).toMatchObject({
      serving_size: 1,
      serving_unit: 'packet (150 g)',
      calories: 180,
      protein: 30,
      fat: 6,
      water_ml: 105,
      caffeine_mg: 3,
      alcohol_g: 1.5,
      custom_nutrients: { iodine: 18 },
      abv_percent: 5,
      glycemic_index: 'Low',
    });
    expect(portion).not.toHaveProperty('id');
    expect(portion).not.toHaveProperty('food_id');
    expect(portion).not.toHaveProperty('is_default');
    expect(fish).toEqual(before);
    expect((portion?.calories ?? 0) * 0.5).toBe(90);
    expect((portion?.calories ?? 0) * 2).toBe(360);
  });

  it('converts reference units and handles bottle volumes', () => {
    expect(
      shared.buildNamedFoodPortion(
        { ...fish, serving_size: 0.1, serving_unit: 'kg' },
        {
          name: 'Packung',
          amount: 150,
          unit: 'g',
        }
      )?.calories
    ).toBeCloseTo(180);
    expect(
      shared.buildNamedFoodPortion(
        { ...fish, serving_unit: 'ml', calories: 40 },
        {
          name: 'bottle',
          amount: 500,
          unit: 'ml',
        }
      )?.calories
    ).toBe(200);
  });

  it.each([0, -1, NaN, Infinity])(
    'rejects invalid portion amounts (%s)',
    (amount) => {
      expect(
        shared.buildNamedFoodPortion(fish, {
          name: 'packet',
          amount,
          unit: 'g',
        })
      ).toBeNull();
    }
  );

  it('rejects blank names, nonpositive reference servings and incompatible measurements', () => {
    expect(
      shared.buildNamedFoodPortion(fish, {
        name: ' ',
        amount: 150,
        unit: 'g',
      })
    ).toBeNull();
    expect(
      shared.buildNamedFoodPortion(
        { ...fish, serving_size: 0 },
        { name: 'packet', amount: 150, unit: 'g' }
      )
    ).toBeNull();
    expect(
      shared.buildNamedFoodPortion(fish, {
        name: 'bottle',
        amount: 500,
        unit: 'ml',
      })
    ).toBeNull();
  });

  it('round-trips the explicit metric context and preserves literal user names', () => {
    expect(shared.parseNamedFoodPortion('Meine Packung (150.5 g)')).toEqual({
      name: 'Meine Packung',
      amount: 150.5,
      unit: 'g',
    });
    expect(shared.parseNamedFoodPortion('packet (0 g)')).toBeNull();
    expect(shared.parseNamedFoodPortion('g')).toBeNull();
    expect(shared.getFoodPortionUnit('oz')).toBe('g');
    expect(shared.getFoodPortionUnit('l')).toBe('ml');
    expect(shared.getFoodPortionUnit('piece')).toBeNull();
  });
});
