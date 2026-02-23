import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFoods } from '../../src/hooks/useFoods';
import { foodsQueryKey } from '../../src/hooks/queryKeys';
import { fetchFoods } from '../../src/services/api/foodsApi';

jest.mock('../../src/services/api/foodsApi', () => ({
  fetchFoods: jest.fn(),
}));

const mockFetchFoods = fetchFoods as jest.MockedFunction<typeof fetchFoods>;

describe('useFoods', () => {
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
        queries: {
          retry: false,
          staleTime: 0,
        },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('query behavior', () => {
    test('fetches foods on mount', async () => {
      mockFetchFoods.mockResolvedValue({
        recentFoods: [],
        topFoods: [],
      });

      renderHook(() => useFoods(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(mockFetchFoods).toHaveBeenCalled();
      });
    });

    test('returns food data', async () => {
      const foodsData = {
        recentFoods: [
          {
            id: '1',
            name: 'Banana',
            brand: null,
            is_custom: false,
            default_variant: {
              serving_size: 1,
              serving_unit: 'medium',
              calories: 105,
              protein: 1.3,
              carbs: 27,
              fat: 0.4,
            },
          },
        ],
        topFoods: [
          {
            id: '2',
            name: 'Chicken Breast',
            brand: 'Generic',
            is_custom: false,
            usage_count: 15,
            default_variant: {
              serving_size: 100,
              serving_unit: 'g',
              calories: 165,
              protein: 31,
              carbs: 0,
              fat: 3.6,
            },
          },
        ],
      };
      mockFetchFoods.mockResolvedValue(foodsData);

      const { result } = renderHook(() => useFoods(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.recentFoods).toEqual(foodsData.recentFoods);
      expect(result.current.topFoods).toEqual(foodsData.topFoods);
    });

    test('returns empty arrays when no data', async () => {
      mockFetchFoods.mockResolvedValue({
        recentFoods: [],
        topFoods: [],
      });

      const { result } = renderHook(() => useFoods(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.recentFoods).toEqual([]);
      expect(result.current.topFoods).toEqual([]);
    });

    test('isError is true on fetch failure', async () => {
      mockFetchFoods.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useFoods(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe('refetch', () => {
    test('provides refetch function', async () => {
      mockFetchFoods.mockResolvedValue({
        recentFoods: [],
        topFoods: [],
      });

      const { result } = renderHook(() => useFoods(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.refetch).toBe('function');
    });

    test('refetch updates data', async () => {
      mockFetchFoods.mockResolvedValue({
        recentFoods: [],
        topFoods: [],
      });

      const { result } = renderHook(() => useFoods(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.recentFoods).toEqual([]);
      });

      mockFetchFoods.mockResolvedValue({
        recentFoods: [
          {
            id: '1',
            name: 'Apple',
            brand: null,
            is_custom: false,
            default_variant: {
              serving_size: 1,
              serving_unit: 'medium',
              calories: 95,
              protein: 0.5,
              carbs: 25,
              fat: 0.3,
            },
          },
        ],
        topFoods: [],
      });

      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.recentFoods).toHaveLength(1);
        expect(result.current.recentFoods[0].name).toBe('Apple');
      });
    });
  });

  describe('query key', () => {
    test('exports correct query key', () => {
      expect(foodsQueryKey).toEqual(['foods']);
    });
  });
});
