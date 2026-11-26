import { apiFetch } from './apiClient';
import { ApiError } from './errors';
import type {
  ChallengeDetail,
  ChallengeStandingsResponse,
  ChallengeSummary,
  JoinChallengeBody,
} from '@workspace/shared';

const SERVICE = 'Challenges API';
const BASE = '/api/v2/challenges';

/**
 * Whether the server has Challenges turned on. A server from before the
 * feature answers 404, which reads as off, so the app hides it there.
 */
export const fetchChallengesStatus = async (): Promise<{
  enabled: boolean;
}> => {
  try {
    const status = await apiFetch<{ enabled: boolean }>({
      endpoint: `${BASE}/status`,
      serviceName: SERVICE,
      operation: 'fetch status',
    });
    return { enabled: status?.enabled === true };
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) {
      return { enabled: false };
    }
    throw error;
  }
};

/** The challenges the user is a member of. */
export const fetchChallenges = (): Promise<ChallengeSummary[]> =>
  apiFetch<ChallengeSummary[]>({
    endpoint: BASE,
    serviceName: SERVICE,
    operation: 'fetch challenges',
  });

export const fetchChallenge = (id: string): Promise<ChallengeDetail> =>
  apiFetch<ChallengeDetail>({
    endpoint: `${BASE}/${encodeURIComponent(id)}`,
    serviceName: SERVICE,
    operation: 'fetch challenge',
  });

/** Standings of the period containing `date`; the server's today without one. */
export const fetchChallengeStandings = (
  id: string,
  date?: string
): Promise<ChallengeStandingsResponse> =>
  apiFetch<ChallengeStandingsResponse>({
    endpoint: `${BASE}/${encodeURIComponent(id)}/standings${
      date ? `?${new URLSearchParams({ date })}` : ''
    }`,
    serviceName: SERVICE,
    operation: 'fetch standings',
  });

export const joinChallenge = (
  body: JoinChallengeBody
): Promise<ChallengeDetail> =>
  apiFetch<ChallengeDetail>({
    endpoint: `${BASE}/join`,
    method: 'POST',
    body,
    serviceName: SERVICE,
    operation: 'join challenge',
  });

export const leaveChallenge = (id: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `${BASE}/${encodeURIComponent(id)}/leave`,
    method: 'POST',
    serviceName: SERVICE,
    operation: 'leave challenge',
  });
