import {
  convertNutritionixToFood,
  pinDefaultVariantToServing,
} from '@/utils/foodSearch';
import type { Food, FoodVariant } from '@/types/food';

const makeVariant = (
  serving_size: number,
  serving_unit: string,
  overrides: Partial<FoodVariant> = {}
): FoodVariant => ({
  serving_size,
  serving_unit,
  calories: 100,
  protein: 10,
  carbs: 5,
  fat: 3,
  ...overrides,
});

const makeFood = (
  variants: FoodVariant[],
  defaultVariant = variants.find((v) => v.is_default)
): Food =>
  ({
    id: '',
    name: 'Pork Chop',
    is_custom: false,
    provider_type: 'fatsecret',
    default_variant: defaultVariant,
    variants,
  }) as Food;

describe('pinDefaultVariantToServing', () => {
  it('re-flags the variant matching the clicked serving as the default', () => {
    // Regression: a FatSecret search card promising "100 g" opened the edit
    // form with the provider's "1 small" default serving instead.
    const small = makeVariant(1, 'small', { is_default: true, calories: 118 });
    const medium = makeVariant(1, 'medium', { calories: 197 });
    const reference = makeVariant(100, 'g', { calories: 231 });
    const detailed = makeFood([small, medium, reference]);

    const result = pinDefaultVariantToServing(detailed, {
      serving_size: 100,
      serving_unit: 'g',
    });

    expect(result.default_variant?.serving_size).toBe(100);
    expect(result.default_variant?.serving_unit).toBe('g');
    expect(result.default_variant?.calories).toBe(231);
    expect(result.variants?.map((v) => !!v.is_default)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('leaves the food untouched when no variant matches the clicked serving', () => {
    const small = makeVariant(1, 'small', { is_default: true });
    const detailed = makeFood([small]);

    const result = pinDefaultVariantToServing(detailed, {
      serving_size: 100,
      serving_unit: 'g',
    });

    expect(result).toBe(detailed);
  });

  it('leaves the food untouched when the default already matches', () => {
    const reference = makeVariant(100, 'g', { is_default: true });
    const small = makeVariant(1, 'small');
    const detailed = makeFood([reference, small]);

    const result = pinDefaultVariantToServing(detailed, {
      serving_size: 100,
      serving_unit: 'g',
    });

    expect(result).toBe(detailed);
  });

  it('leaves the food untouched without a clicked serving or variants', () => {
    const detailed = makeFood([makeVariant(1, 'small', { is_default: true })]);

    expect(pinDefaultVariantToServing(detailed, undefined)).toBe(detailed);

    const empty = makeFood([]);
    expect(
      pinDefaultVariantToServing(empty, {
        serving_size: 100,
        serving_unit: 'g',
      })
    ).toBe(empty);
  });

  it('matches serving units case- and whitespace-insensitively', () => {
    const grams = makeVariant(100, ' G ', { calories: 231 });
    const small = makeVariant(1, 'small', { is_default: true });
    const detailed = makeFood([small, grams]);

    const result = pinDefaultVariantToServing(detailed, {
      serving_size: 100,
      serving_unit: 'g',
    });

    expect(result.default_variant?.calories).toBe(231);
  });

  it('pins the description match even when a same-named sibling is the default', () => {
    const serving200 = makeVariant(1, 'serving', {
      serving_description: '1 serving (200 g)',
      calories: 162,
      is_default: true,
    });
    const serving400 = makeVariant(1, 'serving', {
      serving_description: '1 serving (400 g)',
      calories: 324,
    });
    const detailed = makeFood([serving200, serving400]);

    const result = pinDefaultVariantToServing(detailed, {
      serving_size: 1,
      serving_unit: 'serving',
      serving_description: '1 serving (400 g)',
    });

    expect(result.default_variant?.calories).toBe(324);
    expect(result.variants?.map((v) => !!v.is_default)).toEqual([false, true]);
  });

  it('keeps the default when the clicked serving has no description', () => {
    const serving200 = makeVariant(1, 'serving', {
      serving_description: '1 serving (200 g)',
      calories: 162,
    });
    const serving400 = makeVariant(1, 'serving', {
      serving_description: '1 serving (400 g)',
      calories: 324,
      is_default: true,
    });
    const detailed = makeFood([serving200, serving400]);

    const result = pinDefaultVariantToServing(detailed, {
      serving_size: 1,
      serving_unit: 'serving',
    });

    expect(result).toBe(detailed);
  });

  it('disambiguates same-named servings by description', () => {
    const serving200 = makeVariant(1, 'serving', {
      serving_description: '1 serving (200 g)',
      calories: 162,
    });
    const serving400 = makeVariant(1, 'serving', {
      serving_description: '1 serving (400 g)',
      calories: 324,
    });
    const reference = makeVariant(100, 'g', { is_default: true });
    const detailed = makeFood([reference, serving200, serving400]);

    const result = pinDefaultVariantToServing(detailed, {
      serving_size: 1,
      serving_unit: 'serving',
      serving_description: '1 serving (400 g)',
    });

    expect(result.default_variant?.calories).toBe(324);
    expect(result.default_variant?.serving_description).toBe(
      '1 serving (400 g)'
    );
  });
});

// Regression: Nutritionix's instant search calls the photo `image`, so the
// converter silently dropped it while every other provider used `image_url`.
describe('convertNutritionixToFood', () => {
  it('maps the Nutritionix photo onto image_url', () => {
    const food = convertNutritionixToFood({
      id: 'nix-1',
      name: 'Banana',
      image: 'https://nix-tag-images.s3.amazonaws.com/banana.jpg',
    });

    expect(food.image_url).toBe(
      'https://nix-tag-images.s3.amazonaws.com/banana.jpg'
    );
  });

  it('falls back to the search item photo when the detail response has none', () => {
    const food = convertNutritionixToFood(
      { id: 'nix-1', name: 'Banana', image: 'https://example.com/thumb.jpg' },
      { id: 'nix-1', name: 'Banana', calories: 105 }
    );

    expect(food.image_url).toBe('https://example.com/thumb.jpg');
  });

  it('is null when Nutritionix returns no photo', () => {
    const food = convertNutritionixToFood({ id: 'nix-1', name: 'Banana' });

    expect(food.image_url).toBeNull();
  });
});
