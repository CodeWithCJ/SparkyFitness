import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useMealSearch } from '../../src/hooks/useMealSearch';
import { mealSearchQueryKey } from '../../src/hooks/queryKeys';
import { searchMeals } from '../../src/services/api/mealsApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/mealsApi', () => ({
  searchMeals: jest.fn(),
}));

const mockSearchMeals = searchMeals as jest.MockedFunction<typeof searchMeals>;

describe('useMealSearch', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
    jest.useRealTimers();
  });

  describe('search activation', () => {
    test('does not fetch when search text is empty', () => {
      renderHook(() => useMealSearch(''), {
        wrapper: createQueryWrapper(queryClient),
      });

      expect(mockSearchMeals).not.toHaveBeenCalled();
    });

    test('does not fetch when search text is less than 2 characters', () => {
      renderHook(() => useMealSearch('a'), {
        wrapper: createQueryWrapper(queryClient),
      });

      expect(mockSearchMeals).not.toHaveBeenCalled();
    });

    test('isSearchActive is false when under 2 characters', () => {
      const { result } = renderHook(() => useMealSearch('a'), {
        wrapper: createQueryWrapper(queryClient),
      });

      expect(result.current.isSearchActive).toBe(false);
    });

    test('isSearchActive is false when search is empty', () => {
      const { result } = renderHook(() => useMealSearch(''), {
        wrapper: createQueryWrapper(queryClient),
      });

      expect(result.current.isSearchActive).toBe(false);
    });
  });

  describe('fetching', () => {
    test('fetches when search text is 2 or more characters', async () => {
      mockSearchMeals.mockResolvedValue([]);

      renderHook(() => useMealSearch('pr'), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(mockSearchMeals).toHaveBeenCalledWith('pr');
      });
    });

    test('fetches when search text changes to 2+ characters', async () => {
      mockSearchMeals.mockResolvedValue([]);

      const { rerender } = renderHook(
        (props: { text: string }) => useMealSearch(props.text),
        {
          initialProps: { text: 'a' },
          wrapper: createQueryWrapper(queryClient),
        },
      );

      expect(mockSearchMeals).not.toHaveBeenCalled();

      rerender({ text: 'ab' });

      await waitFor(() => {
        expect(mockSearchMeals).toHaveBeenCalledWith('ab');
      });
    });

    test('returns search results from response', async () => {
      const mealsData = [
        { id: 'meal-1', name: 'Protein Shake', foods: [] },
        { id: 'meal-2', name: 'Protein Bowl', foods: [] },
      ];
      mockSearchMeals.mockResolvedValue(mealsData);

      const { result } = renderHook(() => useMealSearch('protein'), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.searchResults).toEqual(mealsData);
      });
    });

    test('returns empty array when no data', () => {
      const { result } = renderHook(() => useMealSearch('a'), {
        wrapper: createQueryWrapper(queryClient),
      });

      expect(result.current.searchResults).toEqual([]);
    });

    test('does not fetch when enabled is false', () => {
      renderHook(() => useMealSearch('protein', { enabled: false }), {
        wrapper: createQueryWrapper(queryClient),
      });

      expect(mockSearchMeals).not.toHaveBeenCalled();
    });

    test('returns isSearchError on failure', async () => {
      mockSearchMeals.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useMealSearch('protein'), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSearchError).toBe(true);
      });
    });

    test('trims whitespace before searching', async () => {
      mockSearchMeals.mockResolvedValue([]);

      renderHook(() => useMealSearch('  pr  '), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(mockSearchMeals).toHaveBeenCalledWith('pr');
      });
    });

    test('does not search when trimmed text is under 2 characters', () => {
      renderHook(() => useMealSearch('  a  '), {
        wrapper: createQueryWrapper(queryClient),
      });

      expect(mockSearchMeals).not.toHaveBeenCalled();
    });
  });

  describe('query key', () => {
    test('exports correct query key function', () => {
      expect(mealSearchQueryKey('test')).toEqual(['mealSearch', 'test']);
    });
  });
});
