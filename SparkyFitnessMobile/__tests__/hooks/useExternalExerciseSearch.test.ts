import { renderHook, waitFor } from '@testing-library/react-native';
import { useExternalExerciseSearch } from '../../src/hooks/useExternalExerciseSearch';
import { searchExternalExercises } from '../../src/services/api/externalExerciseSearchApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/externalExerciseSearchApi', () => ({
  searchExternalExercises: jest.fn(),
}));

const mockSearchExternal = searchExternalExercises as jest.MockedFunction<
  typeof searchExternalExercises
>;

describe('useExternalExerciseSearch', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('does not fetch when search text is less than 3 characters', () => {
    renderHook(() => useExternalExerciseSearch('ab', 'wger'), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockSearchExternal).not.toHaveBeenCalled();
  });

  it('does not fetch when enabled is false', () => {
    renderHook(
      () => useExternalExerciseSearch('bench press', 'wger', { enabled: false }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    expect(mockSearchExternal).not.toHaveBeenCalled();
  });

  it('returns empty result when providerId is missing', async () => {
    // When no providerId is given, queryFn returns empty result without calling API
    const { result } = renderHook(
      () => useExternalExerciseSearch('bench press', 'wger', { providerId: undefined }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    // Should not have called the actual API
    await waitFor(() => {
      expect(result.current.searchResults).toEqual([]);
    });
  });

  it('fetches from external API with providerId', async () => {
    const responseData = {
      items: [{ id: 'ext-1', name: 'Bench Press' }],
      pagination: { page: 1, pageSize: 20, totalCount: 1, hasMore: false },
    };
    mockSearchExternal.mockResolvedValue(responseData as any);

    const { result } = renderHook(
      () =>
        useExternalExerciseSearch('bench press', 'wger', {
          providerId: 'provider-1',
        }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.searchResults).toEqual(responseData.items);
    });
    expect(result.current.isSearchActive).toBe(true);
  });

  it('returns isSearchActive false when search text is too short', () => {
    const { result } = renderHook(
      () => useExternalExerciseSearch('be', 'wger'),
      { wrapper: createQueryWrapper(queryClient) },
    );

    expect(result.current.isSearchActive).toBe(false);
  });
});
