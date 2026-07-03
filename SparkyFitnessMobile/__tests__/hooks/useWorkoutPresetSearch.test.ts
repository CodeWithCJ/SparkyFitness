import { renderHook, waitFor } from '@testing-library/react-native';
import { useWorkoutPresetSearch } from '../../src/hooks/useWorkoutPresetSearch';
import { searchWorkoutPresets } from '../../src/services/api/workoutPresetsApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/workoutPresetsApi', () => ({
  searchWorkoutPresets: jest.fn(),
}));

const mockSearchPresets = searchWorkoutPresets as jest.MockedFunction<typeof searchWorkoutPresets>;

describe('useWorkoutPresetSearch', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('does not fetch when search text is less than 2 characters', () => {
    renderHook(() => useWorkoutPresetSearch('p'), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockSearchPresets).not.toHaveBeenCalled();
  });

  it('fetches when search text is 2+ characters', async () => {
    mockSearchPresets.mockResolvedValue([]);

    renderHook(() => useWorkoutPresetSearch('pu'), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(mockSearchPresets).toHaveBeenCalledWith('pu');
    });
  });

  it('returns search results', async () => {
    const presets = [{ id: 'preset-1', name: 'Push Day' }];
    mockSearchPresets.mockResolvedValue(presets as any);

    const { result } = renderHook(() => useWorkoutPresetSearch('push'), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.searchResults).toEqual(presets);
    });
    expect(result.current.isSearchActive).toBe(true);
  });

  it('does not fetch when enabled is false', () => {
    renderHook(() => useWorkoutPresetSearch('push', { enabled: false }), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockSearchPresets).not.toHaveBeenCalled();
  });
});
