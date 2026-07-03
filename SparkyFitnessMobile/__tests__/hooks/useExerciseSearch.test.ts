import { renderHook, waitFor } from '@testing-library/react-native';
import { useExerciseSearch } from '../../src/hooks/useExerciseSearch';
import { searchExercises } from '../../src/services/api/exerciseApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/exerciseApi', () => ({
  searchExercises: jest.fn(),
}));

const mockSearchExercises = searchExercises as jest.MockedFunction<typeof searchExercises>;

describe('useExerciseSearch', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('does not fetch when search text is less than 2 characters', () => {
    renderHook(() => useExerciseSearch('a'), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockSearchExercises).not.toHaveBeenCalled();
  });

  it('does not fetch when search text is empty', () => {
    renderHook(() => useExerciseSearch(''), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockSearchExercises).not.toHaveBeenCalled();
  });

  it('fetches when search text is 2+ characters', async () => {
    mockSearchExercises.mockResolvedValue([]);

    renderHook(() => useExerciseSearch('be'), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(mockSearchExercises).toHaveBeenCalledWith('be');
    });
  });

  it('returns search results', async () => {
    const exercises = [
      { id: 'ex-1', name: 'Bench Press', category: 'Strength' },
    ];
    mockSearchExercises.mockResolvedValue(exercises as any);

    const { result } = renderHook(() => useExerciseSearch('bench'), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.searchResults).toEqual(exercises);
    });
    expect(result.current.isSearchActive).toBe(true);
  });
});
