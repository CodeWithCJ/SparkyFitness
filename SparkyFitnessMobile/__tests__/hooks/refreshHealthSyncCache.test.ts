import { refreshHealthSyncCache } from '../../src/hooks/refreshHealthSyncCache';
import {
  exerciseHistoryQueryKey,
  exerciseHistoryResetQueryKey,
  foodsQueryKey,
} from '../../src/hooks/queryKeys';
import { createTestQueryClient, type QueryClient } from './queryTestUtils';

describe('refreshHealthSyncCache', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.restoreAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('invalidates health-derived families and resets exercise history', () => {
    const now = 1_713_182_400_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    queryClient.setQueryData(exerciseHistoryQueryKey, { pages: [], pageParams: [] });
    queryClient.setQueryData(foodsQueryKey, [{ id: 'food-1' }]);

    refreshHealthSyncCache(queryClient);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dailySummary'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['measurements'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['measurementsRange'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['exerciseHistory'],
      refetchType: 'none',
    });
    expect(queryClient.getQueryData(exerciseHistoryQueryKey)).toBeUndefined();
    expect(queryClient.getQueryData(exerciseHistoryResetQueryKey)).toBe(now);
    expect(queryClient.getQueryData(foodsQueryKey)).toEqual([{ id: 'food-1' }]);
  });
});
