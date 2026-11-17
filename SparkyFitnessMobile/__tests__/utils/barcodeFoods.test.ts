import { barcodeResultToFoodInfo } from '../../src/utils/barcodeFoods';
import { buildExternalVariantOptions } from '../../src/utils/foodDetails';
import type { BarcodeLookupResult } from '../../src/services/api/externalFoodSearchApi';

const food: NonNullable<BarcodeLookupResult['food']> = {
  name: 'Milk',
  brand: 'Example',
  is_custom: false,
  provider_type: 'openfoodfacts',
  provider_external_id: 'remote-2',
  image_url: 'https://example.com/milk.jpg',
  images: ['/uploads/milk.jpg'],
  default_variant: {
    serving_size: 100,
    serving_unit: 'ml',
    calories: 50,
    protein: 3,
    carbs: 5,
    fat: 2,
    is_default: true,
  },
  variants: [
    {
      serving_size: 250,
      serving_unit: 'ml',
      serving_description: 'Glass (250 ml)',
      calories: 125,
      protein: 7.5,
      carbs: 12.5,
      fat: 5,
      is_default: false,
    },
  ],
};

describe('barcodeResultToFoodInfo', () => {
  it('keeps exact external identity, photos and all portions on a source switch', () => {
    const result = barcodeResultToFoodInfo(
      { source: 'openfoodfacts', food },
      '1234567890123'
    );
    expect(result).toMatchObject({
      id: 'remote-2',
      source: 'external',
      provider_external_id: 'remote-2',
      provider_type: 'openfoodfacts',
      barcode: '1234567890123',
      images: ['/uploads/milk.jpg'],
      image_url: 'https://example.com/milk.jpg',
    });
    expect(result.externalVariants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ serving_size: 250, serving_unit: 'ml' }),
      ])
    );
  });

  it('keeps saved-food and variant identities for a local alternative', () => {
    const result = barcodeResultToFoodInfo(
      {
        source: 'local',
        food: {
          ...food,
          id: 'saved-food',
          default_variant: { ...food.default_variant, id: 'saved-variant' },
        },
      },
      '1234567890123'
    );
    expect(result).toMatchObject({
      id: 'saved-food',
      variantId: 'saved-variant',
      source: 'local',
    });
  });

  // #3402: the server's mapping of an Open Food Facts product whose serving is
  // "1 portion (100 g)": the 100 g default plus a 1 serving variant with the
  // same values and no description.
  it('labels an Open Food Facts portion with its weight', () => {
    const portion = { calories: 125, protein: 9.5, carbs: 6.9, fat: 7 };
    const meatballs: NonNullable<BarcodeLookupResult['food']> = {
      name: 'Meatballs In Tomato Sauce',
      brand: 'Cook',
      is_custom: false,
      provider_type: 'openfoodfacts',
      provider_external_id: '5056517325056',
      default_variant: {
        ...portion,
        serving_size: 100,
        serving_unit: 'g',
        is_default: true,
      },
      variants: [
        { ...portion, serving_size: 100, serving_unit: 'g', is_default: true },
        {
          ...portion,
          serving_size: 1,
          serving_unit: 'serving',
          is_default: false,
        },
      ],
    };

    const result = barcodeResultToFoodInfo(
      { source: 'openfoodfacts', food: meatballs },
      '5056517325056'
    );
    const options = buildExternalVariantOptions(result.externalVariants);

    expect(result).toMatchObject({ servingSize: 1, servingUnit: 'serving' });
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      label: '1 serving (100 g) (125 cal)',
      quantityUnitLabel: 'serving (100 g)',
    });
  });
});
