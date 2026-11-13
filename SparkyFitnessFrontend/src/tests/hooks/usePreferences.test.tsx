import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUpdatePreferencesMutation } from '@/hooks/Settings/usePreferences';
import { upsertUserPreferences } from '@/api/Settings/preferences';

jest.mock('@/api/Settings/preferences', () => ({
  upsertUserPreferences: jest.fn(),
}));

it('refreshes calorie goals, summaries, adaptive estimates and reports after saving separate activity', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  });
  const keys = [
    ['dailyProgress', 'summary', '2026-10-22'],
    ['dailyProgress', 'adaptiveTdee', '2026-10-22'],
    ['goals', 'daily', '2026-10-22'],
    ['diaryReports', '2026-10-22'],
    ['reports', 'calorieBalance', '2026-10-01', '2026-10-22'],
  ];
  for (const key of keys) client.setQueryData(key, { calories: 2000 });
  jest.mocked(upsertUserPreferences).mockResolvedValue({
    adaptive_activity_separate: true,
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useUpdatePreferencesMutation(), {
    wrapper,
  });

  await act(async () => {
    await result.current.mutateAsync({ adaptive_activity_separate: true });
  });

  for (const key of keys) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  }
  expect(client.getQueryData(['preferences', 'user'])).toEqual({
    adaptive_activity_separate: true,
  });
  client.clear();
});

it('does not let an older inactive summary request make the pre-save goal fresh again', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  });
  const summaryKey = ['dailyProgress', 'summary', '2026-10-22'];
  client.setQueryData(summaryKey, { calories: 2540 });
  let resolveOldSummary: ((value: { calories: number }) => void) | undefined;
  const oldSummaryResponse = new Promise<{ calories: number }>((resolve) => {
    resolveOldSummary = resolve;
  });
  const oldRequest = client
    .fetchQuery({
      queryKey: summaryKey,
      queryFn: () => oldSummaryResponse,
      staleTime: 0,
    })
    .catch(() => undefined);
  jest.mocked(upsertUserPreferences).mockResolvedValue({
    adaptive_activity_separate: true,
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useUpdatePreferencesMutation(), {
    wrapper,
  });

  await act(async () => {
    await result.current.mutateAsync({ adaptive_activity_separate: true });
    resolveOldSummary?.({ calories: 2540 });
    await oldRequest;
  });

  expect(client.getQueryState(summaryKey)?.isInvalidated).toBe(true);
  expect(
    await client.fetchQuery({
      queryKey: summaryKey,
      queryFn: async () => ({ calories: 1989 }),
      staleTime: Infinity,
    })
  ).toEqual({ calories: 1989 });
  client.clear();
});
