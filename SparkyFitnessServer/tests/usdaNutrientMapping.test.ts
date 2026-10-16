import { describe, expect, it } from 'vitest';
import {
  mapUsdaBarcodeProduct,
  type UsdaFood,
} from '../integrations/usda/usdaService.js';

describe('USDA mapping & Vitamin A verification (#2936)', () => {
  it('maps all variants and full nutritional profile for SR Legacy food (Fenugreek Seed 171324)', () => {
    // Realistic representation of FDC ID 171324 with full macros, micronutrients, and portions
    const usdaFood: UsdaFood = {
      fdcId: 171324,
      description: 'Spices, fenugreek seed',
      servingSize: 100,
      servingSizeUnit: 'g',
      foodNutrients: [
        { nutrientId: 1008, nutrientName: 'Energy', value: 323 },
        { nutrientId: 1003, nutrientName: 'Protein', value: 23 },
        { nutrientId: 1004, nutrientName: 'Total lipid (fat)', value: 6.41 },
        {
          nutrientId: 1005,
          nutrientName: 'Carbohydrate, by difference',
          value: 58.35,
        },
        {
          nutrientId: 1079,
          nutrientName: 'Fiber, total dietary',
          value: 24.6,
        },
        { nutrientId: 1087, nutrientName: 'Calcium, Ca', value: 176 },
        { nutrientId: 1089, nutrientName: 'Iron, Fe', value: 33.53 },
        { nutrientId: 1092, nutrientName: 'Potassium, K', value: 770 },
        { nutrientId: 1093, nutrientName: 'Sodium, Na', value: 67 },
        {
          nutrientId: 1162,
          nutrientName: 'Vitamin C, total ascorbic acid',
          value: 3,
        },
        { nutrientId: 1051, nutrientName: 'Water', value: 8.84 },
        {
          nutrientId: 1258,
          nutrientName: 'Fatty acids, total saturated',
          value: 1.46,
        },
        // Vitamin A reported as both 1106 (RAE) and 1104 (IU) in SR Legacy:
        {
          nutrientId: 1106,
          nutrientName: 'Vitamin A, RAE',
          nutrient: { id: 1106, name: 'Vitamin A, RAE', unitName: 'UG' },
          value: 3,
        },
        {
          nutrientId: 1104,
          nutrientName: 'Vitamin A, IU',
          nutrient: { id: 1104, name: 'Vitamin A, IU', unitName: 'IU' },
          value: 60,
        },
      ],
      foodPortions: [
        {
          gramWeight: 3.7,
          amount: 1,
          modifier: 'tsp',
        },
        {
          gramWeight: 11.1,
          amount: 1,
          modifier: 'tbsp',
        },
      ],
    };

    const food = mapUsdaBarcodeProduct(usdaFood);

    expect(food.name).toBe('Spices, fenugreek seed');
    expect(food.provider_type).toBe('usda');
    expect(food.provider_external_id).toBe('171324');

    // Should create 3 variants: 100g (default), 1 tsp (3.7g), 1 tbsp (11.1g)
    expect(food.variants).toHaveLength(3);

    // 1. Default 100g variant
    const defaultVariant = food.default_variant;
    expect(defaultVariant).toBeDefined();
    expect(defaultVariant?.serving_size).toBe(100);
    expect(defaultVariant?.serving_unit).toBe('g');
    expect(defaultVariant?.is_default).toBe(true);
    expect(defaultVariant?.calories).toBe(323);
    expect(defaultVariant?.protein).toBe(23);
    expect(defaultVariant?.fat).toBe(6.4);
    expect(defaultVariant?.carbs).toBe(58.4);
    expect(defaultVariant?.dietary_fiber).toBe(24.6);
    expect(defaultVariant?.calcium).toBe(176);
    expect(defaultVariant?.iron).toBe(33.5);
    expect(defaultVariant?.potassium).toBe(770);
    expect(defaultVariant?.sodium).toBe(67);
    expect(defaultVariant?.water_ml).toBe(8.8);
    expect(defaultVariant?.saturated_fat).toBe(1.5);
    // Crucial check: Vitamin A must be 3 µg RAE, NOT 18 µg (60 * 0.3)
    expect(defaultVariant?.vitamin_a).toBe(3);
    expect(defaultVariant?.vitamin_c).toBe(3);

    // 2. 1 tsp variant (3.7g -> scale 0.037)
    const tspVariant = food.variants.find((v) => v.serving_unit === 'tsp');
    expect(tspVariant).toBeDefined();
    expect(tspVariant?.serving_size).toBe(1);
    expect(tspVariant?.serving_unit).toBe('tsp');
    expect(tspVariant?.calories).toBe(Math.round(323 * 0.037)); // 12 kcal
    expect(tspVariant?.protein).toBe(
      Math.round(23 * 0.037 * 10) / 10 // 0.9 g
    );
    expect(tspVariant?.carbs).toBe(
      Math.round(58.35 * 0.037 * 10) / 10 // 2.2 g
    );
    expect(tspVariant?.fat).toBe(
      Math.round(6.41 * 0.037 * 10) / 10 // 0.2 g
    );
    expect(tspVariant?.vitamin_a).toBe(0.1);

    // 3. 1 tbsp variant (11.1g -> scale 0.111)
    const tbspVariant = food.variants.find((v) => v.serving_unit === 'tbsp');
    expect(tbspVariant).toBeDefined();
    expect(tbspVariant?.serving_size).toBe(1);
    expect(tbspVariant?.serving_unit).toBe('tbsp');
    expect(tbspVariant?.calories).toBe(Math.round(323 * 0.111)); // 36 kcal
    expect(tbspVariant?.protein).toBe(
      Math.round(23 * 0.111 * 10) / 10 // 2.6 g
    );
    expect(tbspVariant?.vitamin_a).toBe(0.3);
  });

  it('correctly maps all variants when food only reports nutrient 1106 (Survey / FNDDS foods)', () => {
    // Hot peppers (FDC ID 2709798) reports 51 µg RAE with household portions
    const usdaFood: UsdaFood = {
      fdcId: 2709798,
      description: 'Peppers, hot, raw',
      servingSize: 100,
      servingSizeUnit: 'g',
      foodNutrients: [
        { nutrientId: 1008, nutrientName: 'Energy', value: 40 },
        { nutrientId: 1003, nutrientName: 'Protein', value: 1.87 },
        {
          nutrientId: 1106,
          nutrientName: 'Vitamin A, RAE',
          nutrient: { id: 1106, name: 'Vitamin A, RAE', unitName: 'UG' },
          value: 51,
        },
      ],
      foodPortions: [
        {
          gramWeight: 45,
          amount: 1,
          modifier: 'pepper',
        },
      ],
    };

    const food = mapUsdaBarcodeProduct(usdaFood);
    expect(food.variants).toHaveLength(2);

    const defaultVariant = food.default_variant;
    expect(defaultVariant?.serving_size).toBe(100);
    expect(defaultVariant?.vitamin_a).toBe(51);

    const pepperVariant = food.variants.find(
      (v) => v.serving_unit === 'pepper'
    );
    expect(pepperVariant).toBeDefined();
    expect(pepperVariant?.serving_size).toBe(1);
    // 51 µg * (45g / 100g) = 22.95 -> 23 µg
    expect(pepperVariant?.vitamin_a).toBe(23);
  });

  it('does not convert undifferentiated nutrient 1104 (IU) when 1106 (RAE) is absent', () => {
    const usdaFood: UsdaFood = {
      fdcId: 1952060,
      description: 'FORTIFIED BREAKFAST CEREAL',
      dataType: 'Branded',
      servingSize: 40,
      servingSizeUnit: 'g',
      householdServingFullText: '1 cup (40 g)',
      foodNutrients: [
        { nutrientId: 1008, nutrientName: 'Energy', value: 375 }, // per 100g
        { nutrientId: 1003, nutrientName: 'Protein', value: 7.5 },
        // Legacy branded food with only 1104 (IU)
        {
          nutrientId: 1104,
          nutrientName: 'Vitamin A, IU',
          value: 2500, // per 100g
        },
      ],
    };

    const food = mapUsdaBarcodeProduct(usdaFood);

    // Default 40g serving variant
    const defaultVariant = food.default_variant;
    expect(defaultVariant?.serving_size).toBe(40);
    // When 1106 is absent, 1104 is not converted using 0.3 factor; defaults to 0
    expect(defaultVariant?.vitamin_a).toBe(0);

    // 100g variant
    const variant100g = food.variants.find((v) => v.serving_size === 100);
    expect(variant100g).toBeDefined();
    expect(variant100g?.vitamin_a).toBe(0);
  });

  it('respects explicitly reported 0 for nutrient 1106 across all variants', () => {
    const usdaFood: UsdaFood = {
      fdcId: 888888,
      description: 'Zero Vitamin A Food',
      servingSize: 100,
      servingSizeUnit: 'g',
      foodNutrients: [
        {
          nutrientId: 1106,
          nutrientName: 'Vitamin A, RAE',
          value: 0,
        },
        {
          nutrientId: 1104,
          nutrientName: 'Vitamin A, IU',
          value: 50,
        },
      ],
      foodPortions: [
        {
          gramWeight: 50,
          amount: 1,
          modifier: 'slice',
        },
      ],
    };

    const food = mapUsdaBarcodeProduct(usdaFood);
    for (const v of food.variants) {
      expect(v.vitamin_a).toBe(0);
    }
  });

  it('correctly maps all other foods reported in issue #2936', () => {
    const issueCases: Array<{
      fdcId: number;
      description: string;
      nutrients: Array<{ nutrientId: number; value: number }>;
      expectedVitaminA: number;
    }> = [
      {
        // Ginger Powder (170926): USDA reports 2 µg RAE and 30 IU. Sparky used to import 9 µg (30 * 0.3)
        fdcId: 170926,
        description: 'Spices, ginger, ground',
        nutrients: [
          { nutrientId: 1106, value: 2 },
          { nutrientId: 1104, value: 30 },
        ],
        expectedVitaminA: 2,
      },
      {
        // Hemp Seed (170148): USDA reports 1 µg RAE and 11 IU. Sparky used to import 3 µg (11 * 0.3)
        fdcId: 170148,
        description: 'Seeds, hemp seed, hulled',
        nutrients: [
          { nutrientId: 1106, value: 1 },
          { nutrientId: 1104, value: 11 },
        ],
        expectedVitaminA: 1,
      },
      {
        // Pigeon Peas (172436): USDA reports 1 µg RAE and 28 IU. Sparky used to import 8 µg (28 * 0.3)
        fdcId: 172436,
        description: 'Pigeon peas, red gram, mature seeds, raw',
        nutrients: [
          { nutrientId: 1106, value: 1 },
          { nutrientId: 1104, value: 28 },
        ],
        expectedVitaminA: 1,
      },
      {
        // Urad Dal / Mungo Beans (174259): USDA reports 1 µg RAE and 23 IU. Sparky used to import 7 µg (23 * 0.3)
        fdcId: 174259,
        description: 'Mungo beans, mature seeds, raw',
        nutrients: [
          { nutrientId: 1106, value: 1 },
          { nutrientId: 1104, value: 23 },
        ],
        expectedVitaminA: 1,
      },
      {
        // Hot Peppers (2709798): USDA reports 51 µg RAE. Sparky used to import 0 µg
        fdcId: 2709798,
        description: 'Peppers, hot, raw',
        nutrients: [{ nutrientId: 1106, value: 51 }],
        expectedVitaminA: 51,
      },
    ];

    for (const testCase of issueCases) {
      const usdaFood: UsdaFood = {
        fdcId: testCase.fdcId,
        description: testCase.description,
        servingSize: 100,
        servingSizeUnit: 'g',
        foodNutrients: testCase.nutrients.map((n) => ({
          nutrientId: n.nutrientId,
          value: n.value,
        })),
      };

      const food = mapUsdaBarcodeProduct(usdaFood);
      expect(
        food.default_variant?.vitamin_a,
        `Expected ${testCase.description} (${testCase.fdcId}) to have vitamin_a = ${testCase.expectedVitaminA}`
      ).toBe(testCase.expectedVitaminA);
    }
  });
});
