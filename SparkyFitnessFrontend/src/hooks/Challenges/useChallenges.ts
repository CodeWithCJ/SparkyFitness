import { useMemo } from 'react';
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import i18n from 'i18next';
import type {
  ChallengeRulesInput,
  CreateChallengeBody,
  JoinChallengeBody,
} from '@workspace/shared';
import { HttpApiError } from '@/api/api';
import * as challengesApi from '@/api/Challenges/challengesApi';
import { challengeKeys } from '@/api/keys/challenges';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import type { MetricUnits } from '@/pages/Challenges/challengeCopy';

/** The server's error code (`CHALLENGE_FULL`, ...) of a failed request. */
export const challengeErrorCode = (error: unknown): string | undefined =>
  error instanceof HttpApiError ? error.code : undefined;

// A join, a leave or a rules change moves the list, the detail, the standings
// and the rules log together, so the whole family refreshes.
const invalidateChallenges = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: challengeKeys.all });

/**
 * Whether Challenges show for the person on screen: the admin switch is on and
 * they are not acting for someone else (every route but `/status` is
 * owner-only, and joining is consent only the person can give).
 */
export const useChallengesAvailable = (): {
  available: boolean;
  isLoading: boolean;
} => {
  const { isActingOnBehalf } = useActiveUser();
  const status = useQuery({
    queryKey: challengeKeys.status(),
    queryFn: challengesApi.getChallengesStatus,
    staleTime: 5 * 60 * 1000,
    enabled: !isActingOnBehalf,
  });
  return {
    available: !isActingOnBehalf && status.data?.enabled === true,
    isLoading: !isActingOnBehalf && status.isLoading,
  };
};

export const useChallenges = (enabled = true) =>
  useQuery({
    queryKey: challengeKeys.list(),
    queryFn: challengesApi.listChallenges,
    enabled,
    meta: {
      errorMessage: i18n.t(
        'challenges.errors.load',
        'Could not load your challenges.'
      ),
    },
  });

export const useChallenge = (id: string | null) =>
  useQuery({
    queryKey: challengeKeys.detail(id ?? ''),
    queryFn: () => challengesApi.getChallenge(id as string),
    enabled: id !== null,
    meta: {
      errorMessage: i18n.t(
        'challenges.errors.loadOne',
        'Could not load this challenge.'
      ),
    },
  });

/** Standings of the period holding `date`; null asks for the current period. */
export const useChallengeStandings = (
  id: string | null,
  date: string | null = null
) =>
  useQuery({
    queryKey: challengeKeys.standings(id ?? '', date),
    queryFn: () => challengesApi.getChallengeStandings(id as string, date),
    enabled: id !== null,
    meta: {
      errorMessage: i18n.t(
        'challenges.errors.standings',
        'Could not load the standings.'
      ),
    },
  });

/**
 * Standings of several periods at once (a member's recent periods). Each day
 * is any day of the period wanted.
 */
export const useChallengePeriodStandings = (
  id: string | null,
  days: readonly string[]
) =>
  useQueries({
    queries: days.map((day) => ({
      queryKey: challengeKeys.standings(id ?? '', day),
      queryFn: () => challengesApi.getChallengeStandings(id as string, day),
      enabled: id !== null,
    })),
  });

export const useChallengeRuleChanges = (id: string | null) =>
  useQuery({
    queryKey: challengeKeys.ruleChanges(id ?? ''),
    queryFn: () => challengesApi.getChallengeRuleChanges(id as string),
    enabled: id !== null,
    meta: {
      errorMessage: i18n.t(
        'challenges.errors.ruleChanges',
        'Could not load the rule changes.'
      ),
    },
  });

export const useCreateChallenge = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateChallengeBody) =>
      challengesApi.createChallenge(body),
    onSuccess: () => invalidateChallenges(queryClient),
    meta: {
      successMessage: i18n.t('challenges.create.created', 'Challenge created'),
    },
  });
};

export const useJoinChallenge = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: JoinChallengeBody) => challengesApi.joinChallenge(body),
    onSuccess: () => invalidateChallenges(queryClient),
  });
};

export const useUpdateChallengeRules = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rules }: { id: string; rules: ChallengeRulesInput }) =>
      challengesApi.updateChallengeRules(id, rules),
    onSuccess: () => invalidateChallenges(queryClient),
    meta: {
      successMessage: i18n.t(
        'challenges.rules.saved',
        'Rules saved. Everyone in the challenge can see the change.'
      ),
    },
  });
};

export const useCreateChallengeInvite = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => challengesApi.createChallengeInvite(id),
    onSuccess: (_data, id) =>
      queryClient.invalidateQueries({ queryKey: challengeKeys.detail(id) }),
  });
};

export const useRevokeChallengeInvite = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => challengesApi.revokeChallengeInvite(id),
    onSuccess: (_data, id) =>
      queryClient.invalidateQueries({ queryKey: challengeKeys.detail(id) }),
    meta: {
      successMessage: i18n.t(
        'challenges.invite.revoked',
        'Invite code turned off'
      ),
    },
  });
};

export const useLeaveChallenge = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => challengesApi.leaveChallenge(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: challengeKeys.detail(id) });
      return invalidateChallenges(queryClient);
    },
    meta: {
      successMessage: i18n.t('challenges.leave.done', 'You left the challenge'),
    },
  });
};

/** The person's distance and energy units, for challenge amounts. */
export const useChallengeUnits = (): MetricUnits => {
  const { distanceUnit, energyUnit, getEnergyUnitString } = usePreferences();
  return useMemo(
    () => ({
      distanceUnit,
      energyUnit,
      energyLabel: getEnergyUnitString(energyUnit),
    }),
    [distanceUnit, energyUnit, getEnergyUnitString]
  );
};
