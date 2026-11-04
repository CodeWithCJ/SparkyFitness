import { invalidateFoodCache } from '../../src/hooks/invalidateFoodCache';
import {
  caffeineActiveQueryKey,
  caffeineActiveRootQueryKey,
  dailySummaryQueryKey,
  dailySummaryRootQueryKey,
  foodEntriesRangeRootQueryKey,
  foodsQueryKey,
  waterIntakeLogQueryKey,
} from '../../src/hooks/queryKeys';
import { createTestQueryClient, type QueryClient } from './queryTestUtils';

describe('invalidateFoodCache', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test.each(['2026-08-23', undefined])(
    'invalidates raw family-copy source snapshots after own diary changes for %s',
    (date) => {
      const changedDay = ['familyCopySource', '2026-08-23'];
      const otherDay = ['familyCopySource', '2026-08-24'];
      queryClient.setQueryData(changedDay, { foodEntries: [] });
      queryClient.setQueryData(otherDay, { foodEntries: [] });
      invalidateFoodCache(queryClient, date);
      expect(queryClient.getQueryState(changedDay)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(otherDay)?.isInvalidated).toBe(
        date === undefined
      );
    }
  );

  test('invalidates day-specific queries and foods when entryDate is supplied', () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const testDate = '2026-09-18';

    invalidateFoodCache(queryClient, testDate);

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: dailySummaryQueryKey(testDate),
      refetchType: 'all',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: caffeineActiveQueryKey(testDate),
      refetchType: 'all',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: waterIntakeLogQueryKey(testDate),
      refetchType: 'all',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [...foodsQueryKey],
    });

    invalidateSpy.mockRestore();
  });

  test('invalidates root summary, root caffeine, and foods when entryDate is omitted', () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    invalidateFoodCache(queryClient);

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: dailySummaryRootQueryKey,
      refetchType: 'all',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: caffeineActiveRootQueryKey,
      refetchType: 'all',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [...foodsQueryKey],
    });

    invalidateSpy.mockRestore();
  });

  test.each([
    ['with an entry date', '2026-09-18'],
    ['without one', undefined],
  ])('invalidates every cached food-entry range %s', (_label, entryDate) => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    invalidateFoodCache(queryClient, entryDate);

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: foodEntriesRangeRootQueryKey,
      refetchType: 'all',
    });

    invalidateSpy.mockRestore();
  });
});
