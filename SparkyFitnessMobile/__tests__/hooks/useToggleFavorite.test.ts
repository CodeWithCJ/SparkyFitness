import { renderHook, waitFor, act } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import { useToggleFavorite } from '../../src/hooks/useToggleFavorite';
import { addFavorite, removeFavorite } from '../../src/services/api/favoritesApi';
import { favoritesQueryKey } from '../../src/hooks/queryKeys';
import type { FavoritesResponse, FoodItem } from '../../src/types/foods';
import type { Meal } from '../../src/types/meals';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/favoritesApi', () => ({
  addFavorite: jest.fn(),
  removeFavorite: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockAdd = addFavorite as jest.MockedFunction<typeof addFavorite>;
const mockRemove = removeFavorite as jest.MockedFunction<typeof removeFavorite>;

const makeFood = (id: string, name: string): FoodItem => ({
  id,
  name,
  brand: null,
  is_custom: true,
  default_variant: {
    serving_size: 1,
    serving_unit: 'serving',
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  },
});

const makeMeal = (id: string, name: string): Meal =>
  ({ id, name, foods: [] }) as unknown as Meal;

const seed = (queryClient: QueryClient, data: FavoritesResponse) =>
  queryClient.setQueryData<FavoritesResponse>(favoritesQueryKey, data);

const readFoods = (queryClient: QueryClient) =>
  queryClient.getQueryData<FavoritesResponse>(favoritesQueryKey)
    ?.favoriteFoods ?? [];
const readMeals = (queryClient: QueryClient) =>
  queryClient.getQueryData<FavoritesResponse>(favoritesQueryKey)
    ?.favoriteMeals ?? [];

describe('useToggleFavorite', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('optimistically inserts a food when adding', async () => {
    seed(queryClient, { favoriteFoods: [], favoriteMeals: [] });
    mockAdd.mockResolvedValue({ type: 'food', id: 'f1', is_favorite: true });

    const { result } = renderHook(() => useToggleFavorite(), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => {
      result.current.toggleFavorite({
        type: 'food',
        id: 'f1',
        isFavorite: false,
        food: makeFood('f1', 'Green Tea'),
      });
    });

    await waitFor(() => {
      expect(readFoods(queryClient).map((f) => f.id)).toContain('f1');
    });
    expect(mockAdd).toHaveBeenCalledWith('food', 'f1');
  });

  test('optimistically inserts a meal when adding', async () => {
    seed(queryClient, { favoriteFoods: [], favoriteMeals: [] });
    mockAdd.mockResolvedValue({ type: 'meal', id: 'm1', is_favorite: true });

    const { result } = renderHook(() => useToggleFavorite(), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => {
      result.current.toggleFavorite({
        type: 'meal',
        id: 'm1',
        isFavorite: false,
        meal: makeMeal('m1', 'Breakfast'),
      });
    });

    await waitFor(() => {
      expect(readMeals(queryClient).map((m) => m.id)).toContain('m1');
    });
    expect(mockAdd).toHaveBeenCalledWith('meal', 'm1');
  });

  test('optimistically removes a meal when unfavoriting', async () => {
    seed(queryClient, {
      favoriteFoods: [],
      favoriteMeals: [makeMeal('m1', 'Breakfast')],
    });
    mockRemove.mockResolvedValue({ type: 'meal', id: 'm1', is_favorite: false });

    const { result } = renderHook(() => useToggleFavorite(), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => {
      result.current.toggleFavorite({ type: 'meal', id: 'm1', isFavorite: true });
    });

    await waitFor(() => {
      expect(readMeals(queryClient).map((m) => m.id)).not.toContain('m1');
    });
    expect(mockRemove).toHaveBeenCalledWith('meal', 'm1');
  });

  test('rolls back and toasts on error', async () => {
    seed(queryClient, { favoriteFoods: [], favoriteMeals: [] });
    mockAdd.mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useToggleFavorite(), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => {
      result.current.toggleFavorite({
        type: 'food',
        id: 'f1',
        isFavorite: false,
        food: makeFood('f1', 'Green Tea'),
      });
    });

    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ text1: 'Failed to update favorites' })
      );
    });
    expect(readFoods(queryClient)).toHaveLength(0);
  });
});
