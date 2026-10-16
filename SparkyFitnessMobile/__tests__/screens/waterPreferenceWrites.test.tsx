import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from '@tanstack/react-query';
import {
  WATER_PREFERENCES_SCOPE,
  refreshAfterWaterPreferenceWrite,
} from '../../src/screens/WaterContainersScreen';
import {
  dailySummaryRootQueryKey,
  preferencesQueryKey,
} from '../../src/hooks/queryKeys';

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function refetchesFor(
  invalidate: jest.SpiedFunction<QueryClient['invalidateQueries']>,
  queryKey: readonly unknown[]
) {
  return invalidate.mock.calls.filter((call) => call[0]?.queryKey === queryKey);
}

describe('refreshAfterWaterPreferenceWrite', () => {
  test('refetches once, after the last queued write settles', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const first = deferred();
    const second = deferred();
    let settled = 0;
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useMutation({
          scope: { id: WATER_PREFERENCES_SCOPE },
          mutationFn: async (id: 'first' | 'second') => {
            await (id === 'first' ? first.promise : second.promise);
          },
          onSettled: () => {
            settled += 1;
            refreshAfterWaterPreferenceWrite(queryClient);
          },
        }),
      { wrapper }
    );

    act(() => {
      result.current.mutate('first');
      result.current.mutate('second');
    });

    await act(async () => {
      first.resolve();
    });
    await waitFor(() => {
      expect(settled).toBe(1);
    });
    expect(refetchesFor(invalidate, preferencesQueryKey)).toHaveLength(0);
    expect(refetchesFor(invalidate, dailySummaryRootQueryKey)).toHaveLength(0);

    await act(async () => {
      second.resolve();
    });
    await waitFor(() => {
      expect(settled).toBe(2);
    });
    expect(refetchesFor(invalidate, preferencesQueryKey)).toHaveLength(1);
    expect(refetchesFor(invalidate, dailySummaryRootQueryKey)).toHaveLength(1);
  });
});
