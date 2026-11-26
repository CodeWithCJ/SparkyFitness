import type {
  CoachCheckInNowResponse,
  CoachNudgeState,
  CoachSettingsResponse,
  CoachUnreadMessages,
  CoachUnreadResponse,
  CoachView,
  UpdateBuiltinCoachBody,
  UpdateCoachProfileBody,
  UpdateCustomCoachBody,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

/** AI coaches (#2013), owner-only: `/api/v2/coaches`. */
const BASE = '/api/v2/coaches';
const SERVICE = 'Coaches API';

export const fetchCoachSettings = (): Promise<CoachSettingsResponse> =>
  apiFetch<CoachSettingsResponse>({
    endpoint: BASE,
    serviceName: SERVICE,
    operation: 'get coach settings',
  });

export const updateCoachProfile = (
  body: UpdateCoachProfileBody
): Promise<CoachSettingsResponse['profile']> =>
  apiFetch<CoachSettingsResponse['profile']>({
    endpoint: `${BASE}/profile`,
    serviceName: SERVICE,
    operation: 'update coach profile',
    method: 'PUT',
    body,
  });

export const updateBuiltinCoach = (
  key: string,
  body: UpdateBuiltinCoachBody
): Promise<CoachView> =>
  apiFetch<CoachView>({
    endpoint: `${BASE}/builtin/${encodeURIComponent(key)}`,
    serviceName: SERVICE,
    operation: 'update coach',
    method: 'PUT',
    body,
  });

export const updateCustomCoach = (
  id: string,
  body: UpdateCustomCoachBody
): Promise<CoachView> =>
  apiFetch<CoachView>({
    endpoint: `${BASE}/custom/${encodeURIComponent(id)}`,
    serviceName: SERVICE,
    operation: 'update custom coach',
    method: 'PATCH',
    body,
  });

export const fetchCoachUnread = (): Promise<CoachUnreadResponse> =>
  apiFetch<CoachUnreadResponse>({
    endpoint: `${BASE}/unread`,
    serviceName: SERVICE,
    operation: 'get unread coach messages',
  });

export const markCoachThreadRead = (
  coachId: string
): Promise<CoachUnreadResponse> =>
  apiFetch<CoachUnreadResponse>({
    endpoint: `${BASE}/read`,
    serviceName: SERVICE,
    operation: 'mark coach messages read',
    method: 'POST',
    body: { coach_id: coachId },
  });

/** Unread messages with their text, newest first, for notifications. */
export const fetchUnreadCoachMessages = (
  since?: string | null
): Promise<CoachUnreadMessages> =>
  apiFetch<CoachUnreadMessages>({
    endpoint: `${BASE}/messages/unread${since ? `?since=${encodeURIComponent(since)}` : ''}`,
    serviceName: SERVICE,
    operation: 'get unread coach message texts',
  });

export const fetchCoachNudgeStates = (
  coachId: string
): Promise<CoachNudgeState[]> =>
  apiFetch<CoachNudgeState[]>({
    endpoint: `${BASE}/${encodeURIComponent(coachId)}/nudges`,
    serviceName: SERVICE,
    operation: 'get coach message states',
  });

export const reactToCoachNudge = (
  nudgeId: string,
  reaction: 1 | -1 | null
): Promise<{ reaction: 1 | -1 | null; muted_rule: string | null }> =>
  apiFetch({
    endpoint: `${BASE}/nudges/${encodeURIComponent(nudgeId)}/react`,
    serviceName: SERVICE,
    operation: 'rate coach message',
    method: 'POST',
    body: { reaction },
  });

export const answerCoachNudge = (
  nudgeId: string,
  value: number | 'yes' | 'not_yet'
): Promise<{ answered: true; saved: 'mood_entry' | 'habit_log' | 'none' }> =>
  apiFetch({
    endpoint: `${BASE}/nudges/${encodeURIComponent(nudgeId)}/answer`,
    serviceName: SERVICE,
    operation: 'answer coach question',
    method: 'POST',
    body: { value },
  });

export const applyCoachSuggestion = (
  nudgeId: string
): Promise<{ applied: true; kind: string }> =>
  apiFetch({
    endpoint: `${BASE}/nudges/${encodeURIComponent(nudgeId)}/apply`,
    serviceName: SERVICE,
    operation: 'apply coach suggestion',
    method: 'POST',
    body: {},
  });

export const dismissCoachSuggestion = (
  nudgeId: string
): Promise<{ dismissed: true }> =>
  apiFetch({
    endpoint: `${BASE}/nudges/${encodeURIComponent(nudgeId)}/dismiss`,
    serviceName: SERVICE,
    operation: 'dismiss coach suggestion',
    method: 'POST',
    body: {},
  });

/** Runs a check-in now instead of at the next check-in time. */
export const checkInNow = (): Promise<CoachCheckInNowResponse> =>
  apiFetch<CoachCheckInNowResponse>({
    endpoint: `${BASE}/check-in-now`,
    serviceName: SERVICE,
    operation: 'check in now',
    method: 'POST',
    body: {},
  });
