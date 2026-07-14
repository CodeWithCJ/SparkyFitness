import { renderHook, waitFor } from '@testing-library/react-native';
import { useFavorites } from '../../src/hooks/useFavorites';
import { fetchFavorites } from '../../src/services/api/favoritesApi';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/favoritesApi', () => ({
  fetchFavorites: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockFetchFavorites = fetchFavorites as jest.MockedFunction<
  typeof fetchFavorites
>;

describe('useFavorites', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('returns favorite foods and meals from the API', async () => {
    mockFetchFavorites.mockResolvedValue({
      favoriteFoods: [{ id: 'f1', name: 'Green Tea' }] as never,
      favoriteMeals: [{ id: 'm1', name: 'Breakfast' }] as never,
    });

    const { result } = renderHook(() => useFavorites(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.favoriteFoods).toHaveLength(1);
    });
    expect(result.current.favoriteFoods[0].name).toBe('Green Tea');
    expect(result.current.favoriteMeals[0].name).toBe('Breakfast');
  });

  test('does not fetch when disabled', () => {
    renderHook(() => useFavorites({ enabled: false }), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockFetchFavorites).not.toHaveBeenCalled();
  });
});
