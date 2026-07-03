import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useAddFoodEntryMeal } from '../../src/hooks/useAddFoodEntryMeal';
import { createFoodEntryMeal } from '../../src/services/api/foodEntryMealsApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/foodEntryMealsApi', () => ({
  createFoodEntryMeal: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockCreateFoodEntryMeal = createFoodEntryMeal as jest.MockedFunction<typeof createFoodEntryMeal>;

describe('useAddFoodEntryMeal', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('invalidates recent meals after a successful create', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    mockCreateFoodEntryMeal.mockResolvedValue({
      id: 'fem-1',
      user_id: 'u-1',
      meal_template_id: 'tpl-1',
      meal_type: 'lunch',
      meal_type_id: 'mt-1',
      entry_date: '2026-05-15',
      name: 'My Meal',
      description: null,
      quantity: 1,
      unit: 'serving',
      foods: [],
    });

    const { result } = renderHook(() => useAddFoodEntryMeal(), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => {
      result.current.addMeal({
        meal_template_id: 'tpl-1',
        meal_type: 'lunch',
        meal_type_id: 'mt-1',
        entry_date: '2026-05-15',
        name: 'My Meal',
        quantity: 1,
        unit: 'serving',
      });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['recentMeals'],
        refetchType: 'all',
      });
    });

    invalidateSpy.mockRestore();
  });

  test('invalidateCache invalidates dailySummary and foods for the date', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useAddFoodEntryMeal(), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => {
      result.current.invalidateCache('2026-05-15');
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dailySummary', '2026-05-15'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['foods'] });

    invalidateSpy.mockRestore();
  });
});
