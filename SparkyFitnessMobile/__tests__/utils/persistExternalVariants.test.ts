import { persistExternalVariants } from '../../src/utils/persistExternalVariants';
import {
  createFoodVariant,
  fetchFoodVariants,
} from '../../src/services/api/foodsApi';

jest.mock('../../src/services/api/foodsApi', () => ({
  createFoodVariant: jest.fn(),
  fetchFoodVariants: jest.fn(),
}));

const mockedCreateFoodVariant = jest.mocked(createFoodVariant);
const mockedFetchFoodVariants = jest.mocked(fetchFoodVariants);

describe('persistExternalVariants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCreateFoodVariant.mockResolvedValue({ id: 'created-variant' } as any);
  });

  it('backfills missing Yazio provider variants for an already saved old food without duplicating existing variants', async () => {
    mockedFetchFoodVariants.mockResolvedValue([
      {
        id: 'existing-serving',
        food_id: 'food-1',
        serving_size: 1,
        serving_unit: 'serving',
        calories: 180,
        protein: 5,
        carbs: 30,
        fat: 4,
      } as any,
    ]);

    await persistExternalVariants(
      {
        id: 'food-1',
        // Existing backend response may report the refreshed provider default,
        // even if legacy local variants still only contain "1 serving".
        default_variant: { serving_size: 100, serving_unit: 'g' },
      },
      [
        {
          serving_size: 100,
          serving_unit: 'g',
          serving_description: '100 g',
          calories: 220,
          protein: 7,
          carbs: 40,
          fat: 5,
        },
        {
          serving_size: 1,
          serving_unit: 'serving',
          serving_description: '1 serving (80 g)',
          calories: 176,
          protein: 5.6,
          carbs: 32,
          fat: 4,
        },
      ],
    );

    expect(mockedCreateFoodVariant).toHaveBeenCalledTimes(1);
    expect(mockedCreateFoodVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        food_id: 'food-1',
        serving_size: 100,
        serving_unit: 'g',
      }),
    );
  });

  it('persists named YAZIO servings with their distinct metric descriptions', async () => {
    mockedFetchFoodVariants.mockResolvedValue([
      {
        id: 'default-variant',
        food_id: 'food-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 50,
        protein: 5,
        carbs: 6,
        fat: 1,
      },
    ]);

    await persistExternalVariants(
      {
        id: 'food-1',
        default_variant: {
          serving_size: 100,
          serving_unit: 'g',
        },
      },
      [
        {
          serving_size: 100,
          serving_unit: 'g',
          serving_description: '100 g',
          calories: 50,
          protein: 5,
          carbs: 6,
          fat: 1,
        },
        {
          serving_size: 1,
          serving_unit: 'package',
          serving_description: '1 package (200 g)',
          calories: 100,
          protein: 10,
          carbs: 12,
          fat: 2,
        },
        {
          serving_size: 200,
          serving_unit: 'g',
          serving_description: '200 g',
          calories: 100,
          protein: 10,
          carbs: 12,
          fat: 2,
        },
        {
          serving_size: 1,
          serving_unit: 'package',
          serving_description: '1 package (400 g)',
          calories: 200,
          protein: 20,
          carbs: 24,
          fat: 4,
        },
        {
          serving_size: 400,
          serving_unit: 'g',
          serving_description: '400 g',
          calories: 200,
          protein: 20,
          carbs: 24,
          fat: 4,
        },
      ],
    );

    expect(mockedCreateFoodVariant).toHaveBeenCalledTimes(4);
    expect(mockedCreateFoodVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        food_id: 'food-1',
        serving_size: 1,
        serving_unit: 'package (200 g)',
        calories: 100,
      }),
    );
    expect(mockedCreateFoodVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        food_id: 'food-1',
        serving_size: 1,
        serving_unit: 'package (400 g)',
        calories: 200,
      }),
    );
    expect(mockedCreateFoodVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        food_id: 'food-1',
        serving_size: 200,
        serving_unit: 'g',
        calories: 100,
      }),
    );
    expect(mockedCreateFoodVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        food_id: 'food-1',
        serving_size: 400,
        serving_unit: 'g',
        calories: 200,
      }),
    );
  });

  it('does not update an existing provider variant with provider display metadata', async () => {
    mockedFetchFoodVariants.mockResolvedValue([
      {
        id: 'existing-piece',
        food_id: 'food-1',
        serving_size: 1,
        serving_unit: 'piece (200g)',
        calories: 50,
        protein: 1,
        carbs: 10,
        fat: 1,
      },
    ]);

    await persistExternalVariants(
      {
        id: 'food-1',
        default_variant: { serving_size: 1, serving_unit: 'piece' },
      },
      [
        {
          serving_size: 1,
          serving_unit: 'piece',
          serving_description: '1 piece (200 g)',
          calories: 50,
          protein: 1,
          carbs: 10,
          fat: 1,
        },
      ],
    );

    expect(mockedCreateFoodVariant).not.toHaveBeenCalled();
  });

  it('creates an encoded variant when multiple legacy rows are ambiguous', async () => {
    mockedFetchFoodVariants.mockResolvedValue([
      {
        id: 'legacy-a',
        food_id: 'food-1',
        serving_size: 1,
        serving_unit: 'package',
        calories: 100,
        protein: 1,
        carbs: 10,
        fat: 1,
      },
      {
        id: 'legacy-b',
        food_id: 'food-1',
        serving_size: 1,
        serving_unit: 'package',
        calories: 200,
        protein: 2,
        carbs: 20,
        fat: 2,
      },
    ]);

    await persistExternalVariants(
      {
        id: 'food-1',
        default_variant: { serving_size: 100, serving_unit: 'g' },
      },
      [
        {
          serving_size: 1,
          serving_unit: 'package',
          serving_description: '1 package (300 g)',
          calories: 300,
          protein: 3,
          carbs: 30,
          fat: 3,
        },
      ],
    );

    expect(mockedCreateFoodVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        serving_size: 1,
        serving_unit: 'package (300 g)',
      }),
    );
  });

  it('falls back to skipping the saved default when existing variants cannot be fetched', async () => {
    mockedFetchFoodVariants.mockRejectedValue(new Error('network'));

    await persistExternalVariants(
      {
        id: 'food-1',
        default_variant: { serving_size: 100, serving_unit: 'g' },
      },
      [
        {
          serving_size: 100,
          serving_unit: 'g',
          serving_description: '100 g',
          calories: 220,
          protein: 7,
          carbs: 40,
          fat: 5,
        },
        {
          serving_size: 1,
          serving_unit: 'serving',
          serving_description: '1 serving (80 g)',
          calories: 176,
          protein: 5.6,
          carbs: 32,
          fat: 4,
        },
      ],
    );

    expect(mockedCreateFoodVariant).toHaveBeenCalledTimes(1);
    expect(mockedCreateFoodVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        serving_size: 1,
        serving_unit: 'serving (80 g)',
      }),
    );
  });
});
