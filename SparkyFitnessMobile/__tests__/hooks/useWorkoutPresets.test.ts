import { renderHook, waitFor } from '@testing-library/react-native';
import { useWorkoutPresets } from '../../src/hooks/useWorkoutPresets';
import { fetchWorkoutPresets } from '../../src/services/api/workoutPresetsApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/workoutPresetsApi', () => ({
  fetchWorkoutPresets: jest.fn(),
}));

const mockFetchPresets = fetchWorkoutPresets as jest.MockedFunction<typeof fetchWorkoutPresets>;

describe('useWorkoutPresets', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns empty presets array when loading', () => {
    mockFetchPresets.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useWorkoutPresets(), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(result.current.presets).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns fetched presets', async () => {
    const data = {
      presets: [
        { id: 'preset-1', name: 'Push Day' },
        { id: 'preset-2', name: 'Pull Day' },
      ],
      total: 2,
      page: 1,
      limit: 50,
    };
    mockFetchPresets.mockResolvedValue(data as any);

    const { result } = renderHook(() => useWorkoutPresets(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.presets).toEqual(data.presets);
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('does not fetch when enabled is false', () => {
    const { result } = renderHook(() => useWorkoutPresets({ enabled: false }), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockFetchPresets).not.toHaveBeenCalled();
    expect(result.current.presets).toEqual([]);
  });

  it('sets isError on failure', async () => {
    mockFetchPresets.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useWorkoutPresets(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
