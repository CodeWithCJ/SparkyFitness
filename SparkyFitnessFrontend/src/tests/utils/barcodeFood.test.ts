import { barcodeFoodToFood } from '@/utils/barcodeFood';
import type { NormalizedFood } from '@workspace/shared';

it('keeps the selected provider identity, images, verification and original serving intact', () => {
  const food: NormalizedFood = {
    name: 'Selected yogurt',
    brand: 'Brand B',
    is_custom: false,
    barcode: '1234567890123',
    provider_type: 'fatsecret',
    provider_external_id: 'product-b',
    provider_verified: true,
    image_url: 'https://example.com/yogurt.jpg',
    default_variant: {
      serving_size: 200,
      serving_unit: 'g',
      calories: 200,
      protein: 20,
      carbs: 12,
      fat: 8,
      is_default: true,
    },
  };
  expect(barcodeFoodToFood(food)).toEqual({
    ...food,
    id: '',
    variants: undefined,
    default_variant: { ...food.default_variant, glycemic_index: undefined },
  });
});
