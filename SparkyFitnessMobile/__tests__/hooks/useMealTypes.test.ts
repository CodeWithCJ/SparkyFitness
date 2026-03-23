import { renderHook, waitFor } from '@testing-library/react-native';
import { useMealTypes } from '../../src/hooks/useMealTypes';
import { mealTypesQueryKey } from '../../src/hooks/queryKeys';
import { fetchMealTypes } from '../../src/services/api/mealTypesApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/mealTypesApi', () => ({
  fetchMealTypes: jest.fn(),
}));

const mockFetchMealTypes = fetchMealTypes as jest.MockedFunction<typeof fetchMealTypes>;

// Full set of meal types used in tests that require all four to be present so
// getDefaultMealTypeId always finds a name match regardless of the current hour.
const allMealTypes = [
  { id: 'mt-breakfast', name: 'Breakfast', is_visible: true, sort_order: 1 },
  { id: 'mt-lunch', name: 'Lunch', is_visible: true, sort_order: 2 },
  { id: 'mt-dinner', name: 'Dinner', is_visible: true, sort_order: 3 },
  { id: 'mt-snacks', name: 'Snacks', is_visible: true, sort_order: 4 },
];

describe('useMealTypes', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('fetches meal types on mount', async () => {
    mockFetchMealTypes.mockResolvedValue(allMealTypes);

    renderHook(() => useMealTypes(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(mockFetchMealTypes).toHaveBeenCalled();
    });
  });

  test('filters out non-visible meal types', async () => {
    const mixedMealTypes = [
      { id: 'mt-1', name: 'Breakfast', is_visible: true, sort_order: 1 },
      { id: 'mt-2', name: 'Hidden Snack', is_visible: false, sort_order: 2 },
      { id: 'mt-3', name: 'Lunch', is_visible: true, sort_order: 3 },
    ];
    mockFetchMealTypes.mockResolvedValue(mixedMealTypes);

    const { result } = renderHook(() => useMealTypes(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.mealTypes).toHaveLength(2);
    expect(result.current.mealTypes.every((mt) => mt.is_visible)).toBe(true);
    expect(result.current.mealTypes.find((mt) => mt.name === 'Hidden Snack')).toBeUndefined();
  });

  test('sorts meal types by sort_order ascending', async () => {
    const unsortedMealTypes = [
      { id: 'mt-dinner', name: 'Dinner', is_visible: true, sort_order: 3 },
      { id: 'mt-breakfast', name: 'Breakfast', is_visible: true, sort_order: 1 },
      { id: 'mt-lunch', name: 'Lunch', is_visible: true, sort_order: 2 },
    ];
    mockFetchMealTypes.mockResolvedValue(unsortedMealTypes);

    const { result } = renderHook(() => useMealTypes(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.mealTypes[0].name).toBe('Breakfast');
    expect(result.current.mealTypes[1].name).toBe('Lunch');
    expect(result.current.mealTypes[2].name).toBe('Dinner');
  });

  test('returns defaultMealTypeId from getDefaultMealTypeId', async () => {
    // Fix the hour to 8 (morning) so getDefaultMealType returns 'breakfast'
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(8);

    mockFetchMealTypes.mockResolvedValue(allMealTypes);

    const { result } = renderHook(() => useMealTypes(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.defaultMealTypeId).toBe('mt-breakfast');

    jest.restoreAllMocks();
  });

  test('defaultMealTypeId falls back to first meal type when no name matches', async () => {
    // Use a meal type list whose names do not match any of the four default names
    const customMealTypes = [
      { id: 'mt-custom-1', name: 'Pre-Workout', is_visible: true, sort_order: 1 },
      { id: 'mt-custom-2', name: 'Post-Workout', is_visible: true, sort_order: 2 },
    ];
    mockFetchMealTypes.mockResolvedValue(customMealTypes);

    const { result } = renderHook(() => useMealTypes(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // getDefaultMealTypeId falls back to first id when no name matches
    expect(result.current.defaultMealTypeId).toBe('mt-custom-1');
  });

  test('returns empty array and null defaultMealTypeId when no data', () => {
    const { result } = renderHook(() => useMealTypes({ enabled: false }), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(result.current.mealTypes).toEqual([]);
    expect(result.current.defaultMealTypeId).toBeNull();
  });

  test('does not fetch when enabled is false', () => {
    renderHook(() => useMealTypes({ enabled: false }), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockFetchMealTypes).not.toHaveBeenCalled();
  });

  test('returns isError on failure', async () => {
    mockFetchMealTypes.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useMealTypes(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  describe('query key', () => {
    test('exports correct query key', () => {
      expect(mealTypesQueryKey).toEqual(['mealTypes']);
    });
  });
});
