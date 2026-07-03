import { renderHook, waitFor } from '@testing-library/react-native';
import { useSuggestedExercises } from '../../src/hooks/useSuggestedExercises';
import { fetchSuggestedExercises } from '../../src/services/api/exerciseApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/exerciseApi', () => ({
  fetchSuggestedExercises: jest.fn(),
}));

const mockFetchSuggested = fetchSuggestedExercises as jest.MockedFunction<
  typeof fetchSuggestedExercises
>;

describe('useSuggestedExercises', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns empty arrays when loading', () => {
    mockFetchSuggested.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useSuggestedExercises(), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(result.current.recentExercises).toEqual([]);
    expect(result.current.topExercises).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns fetched data', async () => {
    const data = {
      recentExercises: [{ id: 'ex-1', name: 'Running' }],
      topExercises: [{ id: 'ex-2', name: 'Bench Press' }],
    };
    mockFetchSuggested.mockResolvedValue(data as any);

    const { result } = renderHook(() => useSuggestedExercises(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.recentExercises).toEqual(data.recentExercises);
    });
    expect(result.current.topExercises).toEqual(data.topExercises);
    expect(result.current.isLoading).toBe(false);
  });

  it('sets isError on failure', async () => {
    mockFetchSuggested.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSuggestedExercises(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.recentExercises).toEqual([]);
    expect(result.current.topExercises).toEqual([]);
  });
});
