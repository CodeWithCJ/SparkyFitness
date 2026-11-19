import type { FoodVariant } from '@/types/food';
import {
  foodVariantToFormVariant,
  formVariantToFoodVariant,
} from '@/utils/foodForm';

const baseVariant = {
  serving_size: 100,
  serving_unit: 'g',
  calories: 100,
} as FoodVariant;

describe('added_sugars unknown vs zero in the food form', () => {
  it('keeps NULL as blank in the form and back as null', () => {
    const form = foodVariantToFormVariant({
      ...baseVariant,
      added_sugars: null,
    });
    expect(form.added_sugars).toBeUndefined();
    expect(formVariantToFoodVariant(form).added_sugars).toBeNull();
  });

  it('keeps an explicit 0 as 0', () => {
    const form = foodVariantToFormVariant({ ...baseVariant, added_sugars: 0 });
    expect(form.added_sugars).toBe(0);
    expect(formVariantToFoodVariant(form).added_sugars).toBe(0);
  });
});
