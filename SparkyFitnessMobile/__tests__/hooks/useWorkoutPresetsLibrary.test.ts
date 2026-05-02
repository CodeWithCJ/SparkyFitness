import { renderHook, waitFor } from '@testing-library/react-native';
import { useWorkoutPresetsLibrary } from '../../src/hooks/useWorkoutPresetsLibrary';
import {
  fetchWorkoutPresetsPage,
  searchWorkoutPresets,
} from '../../src/services/api/workoutPresetsApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';
import type { WorkoutPreset } from '../../src/types/workoutPresets';

jest.mock('../../src/services/api/workoutPresetsApi', () => ({
  fetchWorkoutPresetsPage: jest.fn(),
  searchWorkoutPresets: jest.fn(),
}));

jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));

const mockFetchWorkoutPresetsPage = fetchWorkoutPresetsPage as jest.MockedFunction<
  typeof fetchWorkoutPresetsPage
>;
const mockSearchWorkoutPresets = searchWorkoutPresets as jest.MockedFunction<
  typeof searchWorkoutPresets
>;

function createPreset(id: string, name: string): WorkoutPreset {
  return {
    id,
    user_id: 'user-1',
    name,
    description: null,
    is_public: false,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    exercises: [],
  };
}

describe('useWorkoutPresetsLibrary', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  // Regression: list-mode and search-mode must use distinct cache keys.
  // If both observers register on the same key, the InfiniteQueryObserver
  // sees the regular QueryObserver's flat-array data (or a non-InfiniteData
  // shape on the existing Query) and crashes inside hasNextPage with
  // "Cannot read property 'length' of undefined". We simulate that prior
  // cache state (e.g., something else writing to the search-mode key)
  // before mounting to make the conflict deterministic.
  it('mounts cleanly even when the search-mode key already has data in the cache', async () => {
    mockFetchWorkoutPresetsPage.mockResolvedValue({
      presets: [createPreset('p-1', 'Push Day')],
      pagination: { page: 1, pageSize: 20, totalCount: 1, hasMore: false },
    });

    // Prime the cache at the empty-search key with a flat array (the shape a
    // regular Query would store). If the list query shares this key, its
    // InfiniteQueryObserver will try to read `.pages` on a flat array and
    // crash.
    queryClient.setQueryData(['workoutPresetsLibrary', ''], []);

    const { result } = renderHook(() => useWorkoutPresetsLibrary(''), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.presets).toEqual([
        expect.objectContaining({ id: 'p-1', name: 'Push Day' }),
      ]);
    });
    expect(result.current.hasNextPage).toBe(false);
    expect(mockSearchWorkoutPresets).not.toHaveBeenCalled();
  });

  it('does not call the search endpoint until the input is at least 2 characters', () => {
    mockFetchWorkoutPresetsPage.mockResolvedValue({
      presets: [],
      pagination: { page: 1, pageSize: 20, totalCount: 0, hasMore: false },
    });

    renderHook(() => useWorkoutPresetsLibrary('a'), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockSearchWorkoutPresets).not.toHaveBeenCalled();
  });
});
