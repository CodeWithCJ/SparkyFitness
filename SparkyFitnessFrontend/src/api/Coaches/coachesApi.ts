import { apiCall } from '@/api/api';
import type {
  CoachCheckInNowResponse,
  CoachNudgeState,
  CoachPreviewResponse,
  CreateCustomCoachBody,
  PreviewCoachDraftBody,
  UpdateCustomCoachBody,
  CoachSettingsResponse,
  CoachUnreadResponse,
  CoachView,
  UpdateBuiltinCoachBody,
  UpdateCoachProfileBody,
} from '@workspace/shared';

const BASE = '/v2/coaches';

export const getCoachSettings = (): Promise<CoachSettingsResponse> =>
  apiCall(BASE, { method: 'GET' });

export const updateCoachProfile = (
  body: UpdateCoachProfileBody
): Promise<CoachSettingsResponse['profile']> =>
  apiCall(`${BASE}/profile`, { method: 'PUT', body: JSON.stringify(body) });

export const updateBuiltinCoach = (
  key: string,
  body: UpdateBuiltinCoachBody
): Promise<CoachView> =>
  apiCall(`${BASE}/builtin/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const previewBuiltinCoach = (
  key: string
): Promise<CoachPreviewResponse> =>
  apiCall(`${BASE}/builtin/${encodeURIComponent(key)}/preview`, {
    method: 'POST',
    body: JSON.stringify({}),
  });

export const getCoachUnread = (): Promise<CoachUnreadResponse> =>
  apiCall(`${BASE}/unread`, { method: 'GET', suppressErrorToast: true });

export const markCoachThreadRead = (
  coachId: string
): Promise<CoachUnreadResponse> =>
  apiCall(`${BASE}/read`, {
    method: 'POST',
    body: JSON.stringify({ coach_id: coachId }),
    suppressErrorToast: true,
  });

export const createCustomCoach = (
  body: CreateCustomCoachBody
): Promise<CoachView> =>
  apiCall(`${BASE}/custom`, { method: 'POST', body: JSON.stringify(body) });

export const updateCustomCoach = (
  id: string,
  body: UpdateCustomCoachBody
): Promise<CoachView> =>
  apiCall(`${BASE}/custom/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteCustomCoach = (id: string): Promise<void> =>
  apiCall(`${BASE}/custom/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const previewCoachDraft = (
  body: PreviewCoachDraftBody
): Promise<CoachPreviewResponse> =>
  apiCall(`${BASE}/preview`, { method: 'POST', body: JSON.stringify(body) });

export const getCoachNudgeStates = (
  coachId: string
): Promise<CoachNudgeState[]> =>
  apiCall(`${BASE}/${encodeURIComponent(coachId)}/nudges`, {
    method: 'GET',
    suppressErrorToast: true,
  });

export const reactToCoachNudge = (
  nudgeId: string,
  reaction: 1 | -1 | null
): Promise<{ reaction: 1 | -1 | null; muted_rule: string | null }> =>
  apiCall(`${BASE}/nudges/${encodeURIComponent(nudgeId)}/react`, {
    method: 'POST',
    body: JSON.stringify({ reaction }),
  });

export const answerCoachNudge = (
  nudgeId: string,
  value: number | 'yes' | 'not_yet'
): Promise<{ answered: true; saved: 'mood_entry' | 'habit_log' | 'none' }> =>
  apiCall(`${BASE}/nudges/${encodeURIComponent(nudgeId)}/answer`, {
    method: 'POST',
    body: JSON.stringify({ value }),
  });

export const applyCoachSuggestion = (
  nudgeId: string
): Promise<{ applied: true; kind: string; summary: Record<string, unknown> }> =>
  apiCall(`${BASE}/nudges/${encodeURIComponent(nudgeId)}/apply`, {
    method: 'POST',
    body: JSON.stringify({}),
  });

export const dismissCoachSuggestion = (
  nudgeId: string
): Promise<{ dismissed: true }> =>
  apiCall(`${BASE}/nudges/${encodeURIComponent(nudgeId)}/dismiss`, {
    method: 'POST',
    body: JSON.stringify({}),
  });

export interface CoachKnowledge {
  profile: CoachSettingsResponse['profile'];
  allergens: string[];
  pause: { until: string; reason: string | null } | null;
  coaches: {
    id: string | null;
    builtin_key: string | null;
    name: string | null;
    tool_categories: string[];
    muted_rules: string[];
  }[];
}

export const getCoachKnowledge = (): Promise<CoachKnowledge> =>
  apiCall(`${BASE}/knowledge`, { method: 'GET' });

export const checkInNow = (): Promise<CoachCheckInNowResponse> =>
  apiCall(`${BASE}/check-in-now`, {
    method: 'POST',
    body: JSON.stringify({}),
  });

export const resetTodayCheckin = (): Promise<{ cleared: number }> =>
  apiCall(`${BASE}/reset-today`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
