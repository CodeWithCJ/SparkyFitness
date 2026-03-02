import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEditFood } from '../../src/hooks/useEditFood';
import { updateFood, updateFoodVariant, updateFoodSnapshot } from '../../src/services/api/foodsApi';
import { dailySummaryQueryKey, foodsQueryKey, foodVariantsQueryKey } from '../../src/hooks/queryKeys';
import type { FoodEntry } from '../../src/types/foodEntries';
import type { FoodFormData } from '../../src/components/FoodForm';

jest.mock('../../src/services/api/foodsApi', () => ({
  updateFood: jest.fn(),
  updateFoodVariant: jest.fn(),
  updateFoodSnapshot: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const mockUpdateFood = updateFood as jest.MockedFunction<typeof updateFood>;
const mockUpdateFoodVariant = updateFoodVariant as jest.MockedFunction<typeof updateFoodVariant>;
const mockUpdateFoodSnapshot = updateFoodSnapshot as jest.MockedFunction<typeof updateFoodSnapshot>;

const mockEntry: FoodEntry = {
  id: 'entry-1',
  food_id: 'food-1',
  variant_id: 'variant-1',
  user_id: 'user-1',
  meal_type: 'breakfast',
  quantity: 100,
  unit: 'g',
  serving_size: 100,
  entry_date: '2026-03-01T00:00:00.000Z',
  food_name: 'Chicken Breast',
  brand_name: 'Generic',
  calories: 165,
  protein: 31,
  carbs: 0,
  fat: 3.6,
  dietary_fiber: 0,
  saturated_fat: 1,
  sodium: 74,
  sugars: 0,
};

const mockFormData: FoodFormData = {
  name: 'Grilled Chicken',
  brand: 'Healthy Brand',
  servingSize: '150',
  servingUnit: 'g',
  calories: '200',
  protein: '35',
  carbs: '2',
  fat: '5',
  fiber: '1',
  saturatedFat: '1.5',
  sodium: '80',
  sugars: '0.5',
};

describe('useEditFood', () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
    Wrapper.displayName = 'QueryClientWrapper';
    return Wrapper;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('calls all three API functions with correct arguments', async () => {
    mockUpdateFood.mockResolvedValue(undefined);
    mockUpdateFoodVariant.mockResolvedValue(undefined);
    mockUpdateFoodSnapshot.mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useEditFood({ entry: mockEntry }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.editFood(mockFormData);
    });

    await waitFor(() => {
      expect(mockUpdateFood).toHaveBeenCalledWith('food-1', {
        name: 'Grilled Chicken',
        brand: 'Healthy Brand',
      });
    });

    expect(mockUpdateFoodVariant).toHaveBeenCalledWith('variant-1', {
      food_id: 'food-1',
      serving_size: 150,
      serving_unit: 'g',
      calories: 200,
      protein: 35,
      carbs: 2,
      fat: 5,
      dietary_fiber: 1,
      saturated_fat: 1.5,
      sodium: 80,
      sugars: 0.5,
    });

    expect(mockUpdateFoodSnapshot).toHaveBeenCalledWith({
      foodId: 'food-1',
      variantId: 'variant-1',
    });
  });

  test('maps fiber to dietary_fiber correctly', async () => {
    mockUpdateFood.mockResolvedValue(undefined);
    mockUpdateFoodVariant.mockResolvedValue(undefined);
    mockUpdateFoodSnapshot.mockResolvedValue(undefined);

    const formWithFiber: FoodFormData = {
      ...mockFormData,
      fiber: '8.5',
    };

    const { result } = renderHook(
      () => useEditFood({ entry: mockEntry }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.editFood(formWithFiber);
    });

    await waitFor(() => {
      expect(mockUpdateFoodVariant).toHaveBeenCalledWith(
        'variant-1',
        expect.objectContaining({ dietary_fiber: 8.5 }),
      );
    });
  });

  test('builds correct updated entry object', async () => {
    mockUpdateFood.mockResolvedValue(undefined);
    mockUpdateFoodVariant.mockResolvedValue(undefined);
    mockUpdateFoodSnapshot.mockResolvedValue(undefined);
    const onSuccess = jest.fn();

    const { result } = renderHook(
      () => useEditFood({ entry: mockEntry, onSuccess }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.editFood(mockFormData);
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'entry-1',
          food_name: 'Grilled Chicken',
          brand_name: 'Healthy Brand',
          serving_size: 150,
          unit: 'g',
          calories: 200,
          protein: 35,
          carbs: 2,
          fat: 5,
          dietary_fiber: 1,
          saturated_fat: 1.5,
          sodium: 80,
          sugars: 0.5,
        }),
      );
    });
  });

  test('calls onSuccess with updated entry', async () => {
    mockUpdateFood.mockResolvedValue(undefined);
    mockUpdateFoodVariant.mockResolvedValue(undefined);
    mockUpdateFoodSnapshot.mockResolvedValue(undefined);
    const onSuccess = jest.fn();

    const { result } = renderHook(
      () => useEditFood({ entry: mockEntry, onSuccess }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.editFood(mockFormData);
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  test('shows Alert on error', async () => {
    mockUpdateFood.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(
      () => useEditFood({ entry: mockEntry }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.editFood(mockFormData);
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Failed to save changes', 'Please try again.');
    });
  });

  test('shows permission error on 403', async () => {
    mockUpdateFood.mockRejectedValue(new Error('Server error: 403 - Forbidden'));

    const { result } = renderHook(
      () => useEditFood({ entry: mockEntry }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.editFood(mockFormData);
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Failed to save changes',
        "You don't have permission to edit this food.",
      );
    });
  });

  test('invalidateCache invalidates correct query keys', () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => useEditFood({ entry: mockEntry }),
      { wrapper: createWrapper() },
    );

    act(() => {
      result.current.invalidateCache();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: dailySummaryQueryKey('2026-03-01'),
      refetchType: 'all',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [...foodsQueryKey],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: foodVariantsQueryKey('food-1'),
    });

    invalidateSpy.mockRestore();
  });

  test('handles empty optional fields', async () => {
    mockUpdateFood.mockResolvedValue(undefined);
    mockUpdateFoodVariant.mockResolvedValue(undefined);
    mockUpdateFoodSnapshot.mockResolvedValue(undefined);

    const formWithEmptyOptionals: FoodFormData = {
      ...mockFormData,
      fiber: '',
      saturatedFat: '',
      sodium: '',
      sugars: '',
      brand: '',
    };

    const onSuccess = jest.fn();
    const { result } = renderHook(
      () => useEditFood({ entry: mockEntry, onSuccess }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.editFood(formWithEmptyOptionals);
    });

    await waitFor(() => {
      expect(mockUpdateFood).toHaveBeenCalledWith('food-1', {
        name: 'Grilled Chicken',
        brand: null,
      });
      expect(mockUpdateFoodVariant).toHaveBeenCalledWith(
        'variant-1',
        expect.objectContaining({
          dietary_fiber: undefined,
          saturated_fat: undefined,
          sodium: undefined,
          sugars: undefined,
        }),
      );
    });
  });
});
