import { apiCall } from '@/api/api';
import type {
  ChallengeDetail,
  ChallengeInviteResponse,
  ChallengeRuleChange,
  ChallengeRulesInput,
  ChallengeStandingsResponse,
  ChallengeSummary,
  CreateChallengeBody,
  JoinChallengeBody,
} from '@workspace/shared';

/**
 * `/api/v2/challenges`. Every route but `/status` is owner-only and answers
 * 403 `CHALLENGES_DISABLED` while the admin switch is off, so callers ask
 * `/status` first and stay off while acting for someone else.
 */
export const getChallengesStatus = (): Promise<{ enabled: boolean }> =>
  apiCall('/v2/challenges/status', {
    method: 'GET',
    // Only decides whether the feature shows; a failure just hides it.
    suppressErrorToast: true,
  });

export const listChallenges = (): Promise<ChallengeSummary[]> =>
  apiCall('/v2/challenges', { method: 'GET' });

export const getChallenge = (id: string): Promise<ChallengeDetail> =>
  apiCall(`/v2/challenges/${encodeURIComponent(id)}`, { method: 'GET' });

export const createChallenge = (
  body: CreateChallengeBody
): Promise<ChallengeDetail> =>
  apiCall('/v2/challenges', {
    method: 'POST',
    body,
    // The create dialog says what went wrong next to the form.
    suppressErrorToast: true,
  });

export const joinChallenge = (
  body: JoinChallengeBody
): Promise<ChallengeDetail> =>
  apiCall('/v2/challenges/join', {
    method: 'POST',
    body,
    // The join dialog says what went wrong next to the code.
    suppressErrorToast: true,
  });

export const updateChallengeRules = (
  id: string,
  rules: ChallengeRulesInput
): Promise<ChallengeDetail> =>
  apiCall(`/v2/challenges/${encodeURIComponent(id)}/rules`, {
    method: 'PUT',
    body: { rules },
    // useUpdateChallengeRules says what went wrong, in the app's words.
    suppressErrorToast: true,
  });

export const getChallengeRuleChanges = (
  id: string
): Promise<ChallengeRuleChange[]> =>
  apiCall(`/v2/challenges/${encodeURIComponent(id)}/rule-changes`, {
    method: 'GET',
  });

// The invite and leave hooks say what went wrong, in the app's words.
export const createChallengeInvite = (
  id: string
): Promise<ChallengeInviteResponse> =>
  apiCall(`/v2/challenges/${encodeURIComponent(id)}/invite`, {
    method: 'POST',
    body: {},
    suppressErrorToast: true,
  });

export const revokeChallengeInvite = (id: string): Promise<void> =>
  apiCall(`/v2/challenges/${encodeURIComponent(id)}/invite`, {
    method: 'DELETE',
    suppressErrorToast: true,
  });

export const leaveChallenge = (id: string): Promise<void> =>
  apiCall(`/v2/challenges/${encodeURIComponent(id)}/leave`, {
    method: 'POST',
    suppressErrorToast: true,
  });

export const getChallengeStandings = (
  id: string,
  date?: string | null
): Promise<ChallengeStandingsResponse> =>
  apiCall(`/v2/challenges/${encodeURIComponent(id)}/standings`, {
    method: 'GET',
    params: date ? { date } : undefined,
  });
