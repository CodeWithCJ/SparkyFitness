import { QueryClient } from '@tanstack/react-query';
import type { FoodFormData } from '../../src/components/FoodForm';
import { persistFoodEdits } from '../../src/screens/foodForm/persistence';
import { updateFoodVariant } from '../../src/services/api/foodsApi';

jest.mock('../../src/services/api/foodsApi', () => ({
  updateFoodVariant: jest.fn(),
  updateFood: jest.fn(),
}));

const mockedUpdateFoodVariant = updateFoodVariant as jest.MockedFunction<
  typeof updateFoodVariant
>;

const formValues = {
  name: 'Oatmeal',
  brand: '',
  servingSize: '100',
  servingUnit: 'g',
  calories: '380',
  protein: '13',
  carbs: '67',
  fat: '7',
  fiber: '',
  saturatedFat: '',
  transFat: '',
  sodium: '',
  sugars: '',
  potassium: '',
  cholesterol: '',
  calcium: '',
  iron: '',
  vitaminA: '',
  vitaminC: '',
  caffeineMg: '',
  waterMl: '',
  alcoholG: '',
} as FoodFormData;

describe('persistFoodEdits custom nutrients', () => {
  beforeEach(() => {
    mockedUpdateFoodVariant.mockReset();
    mockedUpdateFoodVariant.mockResolvedValue({ id: 'variant-1' } as never);
  });

  it('saves the variant when only a custom nutrient changed', async () => {
    const saved = await persistFoodEdits({
      queryClient: new QueryClient(),
      foodId: 'food-1',
      variantId: 'variant-1',
      customNutrients: { Zinc: 3 },
      data: formValues,
      variantInitialValues: formValues,
      variantInitialCustomNutrients: { Zinc: 1 },
      foodInitialValues: formValues,
    });

    expect(saved).toBe(true);
    expect(mockedUpdateFoodVariant).toHaveBeenCalledWith(
      'variant-1',
      expect.objectContaining({ custom_nutrients: { Zinc: 3 } })
    );
  });

  it('sends nothing when neither the fields nor the custom nutrients changed', async () => {
    const saved = await persistFoodEdits({
      queryClient: new QueryClient(),
      foodId: 'food-1',
      variantId: 'variant-1',
      customNutrients: { Zinc: 1 },
      data: formValues,
      variantInitialValues: formValues,
      variantInitialCustomNutrients: { Zinc: '1' },
      foodInitialValues: formValues,
    });

    expect(saved).toBe(false);
    expect(mockedUpdateFoodVariant).not.toHaveBeenCalled();
  });
});
