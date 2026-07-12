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

  it('does not update an existing provider variant with provider display metadata', async () => {
    mockedFetchFoodVariants.mockResolvedValue([
      {
        id: 'existing-piece',
        food_id: 'food-1',
        serving_size: 1,
        serving_unit: 'piece',
        serving_description: '1 piece',
        calories: 50,
        protein: 1,
        carbs: 10,
        fat: 1,
      } as any,
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
      expect.objectContaining({ serving_size: 1, serving_unit: 'serving' }),
    );
  });
});
