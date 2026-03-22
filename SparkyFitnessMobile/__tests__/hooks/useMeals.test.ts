import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useMeals } from '../../src/hooks/useMeals';
import { mealsQueryKey } from '../../src/hooks/queryKeys';
import { fetchMeals } from '../../src/services/api/mealsApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/mealsApi', () => ({
  fetchMeals: jest.fn(),
}));

const mockFetchMeals = fetchMeals as jest.MockedFunction<typeof fetchMeals>;

describe('useMeals', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('fetches meals on mount', async () => {
    mockFetchMeals.mockResolvedValue([]);

    renderHook(() => useMeals(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(mockFetchMeals).toHaveBeenCalled();
    });
  });

  test('returns meals array from response', async () => {
    const mealsData = [
      { id: 'meal-1', name: 'Overnight Oats', foods: [] },
      { id: 'meal-2', name: 'Protein Shake', foods: [] },
    ];
    mockFetchMeals.mockResolvedValue(mealsData);

    const { result } = renderHook(() => useMeals(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.meals).toEqual(mealsData);
    });
  });

  test('returns empty array when no data', () => {
    // No mock resolution — query is disabled or not yet resolved
    const { result } = renderHook(() => useMeals({ enabled: false }), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(result.current.meals).toEqual([]);
  });

  test('does not fetch when enabled is false', () => {
    renderHook(() => useMeals({ enabled: false }), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockFetchMeals).not.toHaveBeenCalled();
  });

  test('returns isError on failure', async () => {
    mockFetchMeals.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useMeals(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  test('refetch triggers a new fetch', async () => {
    mockFetchMeals.mockResolvedValue([]);

    const { result } = renderHook(() => useMeals(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.meals).toEqual([]);
    });

    const updatedMeals = [{ id: 'meal-1', name: 'Updated Meal', foods: [] }];
    mockFetchMeals.mockResolvedValue(updatedMeals);

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.meals).toEqual(updatedMeals);
    });
  });

  describe('query key', () => {
    test('exports correct query key', () => {
      expect(mealsQueryKey).toEqual(['meals']);
    });
  });
});
