import { barcodeResultToFoodInfo } from '../../src/utils/barcodeFoods';
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
});
