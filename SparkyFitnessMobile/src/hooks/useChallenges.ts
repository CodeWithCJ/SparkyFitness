import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  ChallengeRuleChange,
  ChallengeStandingsResponse,
  JoinChallengeBody,
} from '@workspace/shared';
import {
  fetchChallenge,
  fetchChallengeRuleChanges,
  fetchChallengeStandings,
  fetchChallenges,
  fetchChallengesStatus,
  joinChallenge,
  leaveChallenge,
} from '../services/api/challengesApi';

export const challengesQueryKeyRoot = ['challenges'] as const;
export const challengesStatusQueryKey = [
  ...challengesQueryKeyRoot,
  'status',
] as const;
export const challengesListQueryKey = [
  ...challengesQueryKeyRoot,
  'list',
] as const;
export const challengeDetailQueryKey = (id: string) =>
  [...challengesQueryKeyRoot, 'detail', id] as const;
/** `date` is any day of the period; null asks for the server's today. */
export const challengeStandingsQueryKey = (id: string, date: string | null) =>
  [...challengesQueryKeyRoot, 'standings', id, date ?? 'today'] as const;
export const challengeRuleChangesQueryKey = (id: string) =>
  [...challengesQueryKeyRoot, 'ruleChanges', id] as const;

/**
 * The user's challenges, once the server says the feature is on. A server
 * without Challenges (older, or turned off by the admin) reports
 * `isEnabled: false` and no list is requested.
 */
export function useChallenges({ enabled = true }: { enabled?: boolean } = {}) {
  const status = useQuery({
    queryKey: challengesStatusQueryKey,
    queryFn: fetchChallengesStatus,
    enabled,
  });
  const isEnabled = status.data?.enabled === true;
  const list = useQuery({
    queryKey: challengesListQueryKey,
    queryFn: fetchChallenges,
    enabled: enabled && isEnabled,
  });

  return {
    // Turning a query off keeps its cached data, so a list read before the
    // feature was turned off is not handed out after.
    challenges: isEnabled ? (list.data ?? []) : [],
    isEnabled,
    /** True while either answer is still on its way. */
    isLoading: status.isLoading || (isEnabled && list.isLoading),
    isError: status.isError || list.isError,
    refetch: async () => {
      const next = await status.refetch();
      if (next.data?.enabled) await list.refetch();
    },
  };
}

export function useChallenge(id: string) {
  return useQuery({
    queryKey: challengeDetailQueryKey(id),
    queryFn: () => fetchChallenge(id),
    enabled: Boolean(id),
  });
}

export function useChallengeStandings(id: string, date: string | null) {
  return useQuery({
    queryKey: challengeStandingsQueryKey(id, date),
    queryFn: () => fetchChallengeStandings(id, date ?? undefined),
    enabled: Boolean(id),
  });
}

function combineStandings(
  results: UseQueryResult<ChallengeStandingsResponse>[]
): {
  byId: ReadonlyMap<string, ChallengeStandingsResponse>;
  isLoading: boolean;
  isError: boolean;
} {
  const byId = new Map<string, ChallengeStandingsResponse>();
  for (const result of results) {
    if (result.data) byId.set(result.data.challenge_id, result.data);
  }
  return {
    byId,
    isLoading: results.some((result) => result.isLoading),
    isError: results.some((result) => result.isError),
  };
}

/**
 * The rules change log of a challenge. A change made mid-period counts from
 * the next one, so a period's totals are shown with the rules in effect then
 * (`rulesInEffect`), not the newest saved rules.
 */
export function useChallengeRuleChanges(id: string) {
  return useQuery({
    queryKey: challengeRuleChangesQueryKey(id),
    queryFn: () => fetchChallengeRuleChanges(id),
    enabled: Boolean(id),
  });
}

/** Rule change logs for several challenges, keyed by challenge id. */
export function useChallengesRuleChanges(ids: readonly string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: challengeRuleChangesQueryKey(id),
      queryFn: () => fetchChallengeRuleChanges(id),
    })),
    combine: (results: UseQueryResult<ChallengeRuleChange[]>[]) => {
      const byId = new Map<string, ChallengeRuleChange[]>();
      results.forEach((result, i) => {
        if (result.data) byId.set(ids[i] as string, result.data);
      });
      return {
        byId: byId as ReadonlyMap<string, ChallengeRuleChange[]>,
        isLoading: results.some((result) => result.isLoading),
        isError: results.some((result) => result.isError),
        /** Reads the failed logs again. */
        retry: () => {
          for (const result of results) {
            if (result.isError) void result.refetch();
          }
        },
      };
    },
  });
}

/**
 * Standings for several challenges at once (the dashboard card, the week
 * notification), keyed by challenge id.
 */
export function useChallengesStandings(
  ids: readonly string[],
  date: string | null
) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: challengeStandingsQueryKey(id, date),
      queryFn: () => fetchChallengeStandings(id, date ?? undefined),
    })),
    combine: combineStandings,
  });
}

/** Joining or leaving changes the list, its member counts and every standing. */
export function useChallengeMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: challengesQueryKeyRoot });

  const join = useMutation({
    mutationFn: (body: JoinChallengeBody) => joinChallenge(body),
    onSuccess: invalidate,
  });
  const leave = useMutation({
    mutationFn: (id: string) => leaveChallenge(id),
    // The left challenge can no longer be read. Its screen is still mounted
    // until the caller goes back, so mark its queries stale without
    // refetching them (a refetch would only get a 404), and refresh the list
    // without waiting for it.
    onSuccess: (_data, id) => {
      for (const queryKey of [
        challengeDetailQueryKey(id),
        [...challengesQueryKeyRoot, 'standings', id],
        challengeRuleChangesQueryKey(id),
      ]) {
        void queryClient.cancelQueries({ queryKey });
        void queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
      }
      void queryClient.invalidateQueries({ queryKey: challengesListQueryKey });
    },
  });

  return {
    joinChallenge: join.mutateAsync,
    leaveChallenge: leave.mutateAsync,
    isJoining: join.isPending,
  };
}
