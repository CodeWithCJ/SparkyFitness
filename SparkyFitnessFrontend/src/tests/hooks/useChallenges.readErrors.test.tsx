import { renderHook, waitFor } from '@testing-library/react';
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';
import * as challengesApi from '@/api/Challenges/challengesApi';
import {
  useChallenge,
  useChallengePeriodStandings,
  useChallengeRuleChanges,
  useChallengeStandings,
  useChallenges,
} from '@/hooks/Challenges/useChallenges';

jest.mock('@/api/Challenges/challengesApi');

// The app's QueryCache toasts `meta.errorMessage` (main.tsx). Challenge reads
// show an inline LoadError instead, and standings refetch every minute, so a
// failed read must not toast at all (one toast a minute per challenge).
const setup = () => {
  const toasted: unknown[] = [];
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (_e, query) => {
        if (query.meta?.errorMessage) toasted.push(query.meta.errorMessage);
      },
    }),
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { toasted, wrapper };
};

describe('challenge reads that show an inline error', () => {
  beforeEach(() => {
    const down = () => Promise.reject(new Error('server down'));
    jest.mocked(challengesApi.listChallenges).mockImplementation(down);
    jest.mocked(challengesApi.getChallenge).mockImplementation(down);
    jest.mocked(challengesApi.getChallengeStandings).mockImplementation(down);
    jest.mocked(challengesApi.getChallengeRuleChanges).mockImplementation(down);
  });

  it('fail without a toast', async () => {
    const { toasted, wrapper } = setup();
    const { result } = renderHook(
      () => ({
        list: useChallenges(),
        detail: useChallenge('c1'),
        standings: useChallengeStandings('c1'),
        periods: useChallengePeriodStandings('c1', ['2026-11-10']),
        ruleChanges: useChallengeRuleChanges('c1'),
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.list.isError).toBe(true);
      expect(result.current.detail.isError).toBe(true);
      expect(result.current.standings.isError).toBe(true);
      expect(result.current.periods[0]?.isError).toBe(true);
      expect(result.current.ruleChanges.isError).toBe(true);
    });
    expect(toasted).toEqual([]);
  });
});
