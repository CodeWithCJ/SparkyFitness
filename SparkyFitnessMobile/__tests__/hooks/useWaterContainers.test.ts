import { renderHook, waitFor, act } from '@testing-library/react-native';
import {
  useWaterContainersQuery,
  useCreateWaterContainerMutation,
  useUpdateWaterContainerMutation,
  useDeleteWaterContainerMutation,
  useSetPrimaryWaterContainerMutation,
  useReorderWaterContainersMutation,
  useAddDrinkPresetMutation,
} from '../../src/hooks/useWaterContainers';
import {
  fetchWaterContainers,
  createWaterContainer,
  updateWaterContainer,
  deleteWaterContainer,
  setPrimaryWaterContainer,
  reorderWaterContainers,
  addDrinkPreset,
} from '../../src/services/api/measurementsApi';
import {
  waterContainersQueryKey,
  dailySummaryQueryKey,
} from '../../src/hooks/queryKeys';
import { createTestQueryClient, createQueryWrapper } from './queryTestUtils';

jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchWaterContainers: jest.fn(),
  createWaterContainer: jest.fn(),
  updateWaterContainer: jest.fn(),
  deleteWaterContainer: jest.fn(),
  setPrimaryWaterContainer: jest.fn(),
  reorderWaterContainers: jest.fn(),
  addDrinkPreset: jest.fn(),
  fetchDrinkPresetCatalog: jest.fn(),
}));

const mockFetchWaterContainers = fetchWaterContainers as jest.MockedFunction<
  typeof fetchWaterContainers
>;

const container = {
  id: 1,
  name: 'Glass',
  volume: 250,
  unit: 'ml',
  is_primary: true,
  servings_per_container: 1,
};

describe('useWaterContainersQuery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses staleTime: Infinity, so mutations must invalidate explicitly (#2115)', async () => {
    mockFetchWaterContainers.mockResolvedValue([container]);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useWaterContainersQuery(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.containers).toEqual([container]);

    const query = queryClient
      .getQueryCache()
      .find({ queryKey: waterContainersQueryKey });
    expect(query?.options.staleTime).toBe(Infinity);
  });
});

// Every mutation must invalidate both waterContainersQueryKey and
// dailySummaryRootQueryKey -- a factor or link change alters a day's water
// total, and mobile's staleTime: Infinity means nothing refetches on its own.
describe('water container mutations invalidate both caches', () => {
  let invalidateSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const expectBothInvalidated = (
    queryClient: ReturnType<typeof createTestQueryClient>
  ) => {
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: waterContainersQueryKey,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dailySummary'],
    });
    void queryClient;
  };

  it('useCreateWaterContainerMutation invalidates on success', async () => {
    (createWaterContainer as jest.Mock).mockResolvedValue(container);
    const queryClient = createTestQueryClient();
    invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateWaterContainerMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.createWaterContainerAsync({
        name: 'Bottle',
        volume: 500,
        unit: 'ml',
      });
    });

    expectBothInvalidated(queryClient);
  });

  it('useUpdateWaterContainerMutation invalidates on success', async () => {
    (updateWaterContainer as jest.Mock).mockResolvedValue(container);
    const queryClient = createTestQueryClient();
    invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateWaterContainerMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.updateWaterContainerAsync(1, {
        hydration_factor: 0.8,
      });
    });

    expectBothInvalidated(queryClient);
  });

  it('useDeleteWaterContainerMutation invalidates on success', async () => {
    (deleteWaterContainer as jest.Mock).mockResolvedValue(undefined);
    const queryClient = createTestQueryClient();
    invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteWaterContainerMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.deleteWaterContainerAsync(1);
    });

    expectBothInvalidated(queryClient);
  });

  it('useSetPrimaryWaterContainerMutation invalidates on success', async () => {
    (setPrimaryWaterContainer as jest.Mock).mockResolvedValue(container);
    const queryClient = createTestQueryClient();
    invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSetPrimaryWaterContainerMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.setPrimaryWaterContainerAsync(1);
    });

    expectBothInvalidated(queryClient);
  });

  it('useReorderWaterContainersMutation invalidates on success', async () => {
    (reorderWaterContainers as jest.Mock).mockResolvedValue(undefined);
    const queryClient = createTestQueryClient();
    invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useReorderWaterContainersMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.reorderWaterContainersAsync([2, 1]);
    });

    expectBothInvalidated(queryClient);
  });

  it('useAddDrinkPresetMutation invalidates on success', async () => {
    (addDrinkPreset as jest.Mock).mockResolvedValue(container);
    const queryClient = createTestQueryClient();
    invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useAddDrinkPresetMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.addDrinkPresetAsync('espresso');
    });

    expectBothInvalidated(queryClient);
  });
});

// Sanity: the key used in expectBothInvalidated above is the actual daily
// summary root prefix, not a copy that could silently drift.
describe('dailySummaryQueryKey prefix sanity', () => {
  it('dailySummaryQueryKey(date) starts with the same prefix used for invalidation', () => {
    expect(dailySummaryQueryKey('2026-09-05')[0]).toBe('dailySummary');
  });
});
