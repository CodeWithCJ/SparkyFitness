import { QueryObserver } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react-native';
import { invalidateExerciseCache } from '../../src/hooks/invalidateExerciseCache';
import { refreshHealthSyncCache } from '../../src/hooks/refreshHealthSyncCache';
import { goalsRangeQueryKey } from '../../src/hooks/queryKeys';
import { createTestQueryClient, type QueryClient } from './queryTestUtils';

const date = '2026-11-01';

describe('activity changes refresh cached report macro goals', () => {
  it.each([
    {
      action: 'workout deletion',
      refresh: (client: QueryClient) => invalidateExerciseCache(client, date),
      before: 187.5,
      after: 150,
    },
    {
      action: 'health sync',
      refresh: refreshHealthSyncCache,
      before: 150,
      after: 187.5,
    },
  ])(
    'refetches every open goal range after $action despite infinite staleTime',
    async ({ refresh, before, after }) => {
      const client = createTestQueryClient({
        queries: { retry: false, staleTime: Infinity },
      });
      let serverProtein = before;
      const queryFn = jest.fn(async () => ({
        [date]: { protein: serverProtein },
      }));
      const ranges = [
        goalsRangeQueryKey(date, date, true),
        goalsRangeQueryKey('2026-10-26', date, true),
      ];
      const unsubscribe: (() => void)[] = [];

      try {
        for (const queryKey of ranges) {
          await client.fetchQuery({ queryKey, queryFn });
          const observer = new QueryObserver(client, { queryKey, queryFn });
          unsubscribe.push(observer.subscribe(() => {}));
        }
        expect(queryFn).toHaveBeenCalledTimes(2);
        serverProtein = after;

        refresh(client);

        await waitFor(() => {
          for (const queryKey of ranges) {
            expect(client.getQueryData(queryKey)).toEqual({
              [date]: { protein: after },
            });
          }
        });
        expect(queryFn).toHaveBeenCalledTimes(4);
      } finally {
        unsubscribe.forEach((stop) => stop());
        client.clear();
      }
    }
  );
});
