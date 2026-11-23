import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  challengeStandingsRefetchInterval,
  type ChallengeStandingsResponse,
  type JoinChallengeBody,
} from '@workspace/shared';
import {
  fetchChallenge,
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
    // An open period is scored a minute or so after a save; read it again.
    refetchInterval: challengeStandingsRefetchInterval,
  });
}

function combineStandings(
  ids: readonly string[],
  results: UseQueryResult<ChallengeStandingsResponse>[]
): {
  byId: ReadonlyMap<string, ChallengeStandingsResponse>;
  failedIds: ReadonlySet<string>;
  isLoading: boolean;
  isError: boolean;
} {
  const byId = new Map<string, ChallengeStandingsResponse>();
  const failedIds = new Set<string>();
  results.forEach((result, index) => {
    if (result.data) byId.set(result.data.challenge_id, result.data);
    if (result.isError) failedIds.add(ids[index]);
  });
  return {
    byId,
    failedIds,
    isLoading: results.some((result) => result.isLoading),
    isError: failedIds.size > 0,
  };
}

/**
 * Standings for several challenges at once (the dashboard card, the week
 * notification), keyed by challenge id. `poll` re-reads open periods every
 * minute, as the server scores a save a minute or so later.
 */
export function useChallengesStandings(
  ids: readonly string[],
  date: string | null,
  { poll = false }: { poll?: boolean } = {}
) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: challengeStandingsQueryKey(id, date),
      queryFn: () => fetchChallengeStandings(id, date ?? undefined),
      // Only for a screen showing them: the always-mounted week notification
      // reads them again on return to the foreground instead.
      refetchInterval: poll ? challengeStandingsRefetchInterval : false,
    })),
    combine: (results: UseQueryResult<ChallengeStandingsResponse>[]) =>
      combineStandings(ids, results),
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
