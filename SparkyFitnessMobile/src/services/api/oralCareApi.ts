import { apiFetch } from './apiClient';
import type {
  CreateOralCareSessionBody,
  OralCareDaySummaryResponse,
  OralCareHistoryResponse,
  OralCareSessionResponse,
  OralCareSettings,
  UpdateOralCareSessionBody,
} from '@workspace/shared';

const SERVICE = 'Oral Care API';

export const fetchOralCareDaySummary = (
  date: string
): Promise<OralCareDaySummaryResponse> =>
  apiFetch<OralCareDaySummaryResponse>({
    endpoint: `/api/v2/oral-care/day-summary?${new URLSearchParams({ date })}`,
    serviceName: SERVICE,
    operation: 'fetch day summary',
  });

export const fetchOralCareHistory = (
  startDate: string,
  endDate: string
): Promise<OralCareHistoryResponse> =>
  apiFetch<OralCareHistoryResponse>({
    endpoint: `/api/v2/oral-care/history?${new URLSearchParams({ startDate, endDate })}`,
    serviceName: SERVICE,
    operation: 'fetch history',
  });

/** Sessions of a range; used by Apple Health writeback. */
export const fetchOralCareSessions = (
  startDate: string,
  endDate: string
): Promise<OralCareSessionResponse[]> =>
  apiFetch<OralCareSessionResponse[]>({
    endpoint: `/api/v2/oral-care/entries?${new URLSearchParams({ startDate, endDate })}`,
    serviceName: SERVICE,
    operation: 'fetch sessions',
  });

export const createOralCareSession = (
  data: CreateOralCareSessionBody
): Promise<OralCareSessionResponse> =>
  apiFetch<OralCareSessionResponse>({
    endpoint: '/api/v2/oral-care/entries',
    method: 'POST',
    body: data,
    serviceName: SERVICE,
    operation: 'create session',
  });

export const updateOralCareSession = (
  id: string,
  data: UpdateOralCareSessionBody
): Promise<OralCareSessionResponse> =>
  apiFetch<OralCareSessionResponse>({
    endpoint: `/api/v2/oral-care/entries/${id}`,
    method: 'PUT',
    body: data,
    serviceName: SERVICE,
    operation: 'update session',
  });

export const deleteOralCareSession = (
  id: string
): Promise<{ success: boolean }> =>
  apiFetch<{ success: boolean }>({
    endpoint: `/api/v2/oral-care/entries/${id}`,
    method: 'DELETE',
    serviceName: SERVICE,
    operation: 'delete session',
  });

export const saveOralCareSettings = (
  settings: OralCareSettings
): Promise<OralCareSettings> =>
  apiFetch<OralCareSettings>({
    endpoint: '/api/v2/oral-care/settings',
    method: 'PUT',
    body: settings,
    serviceName: SERVICE,
    operation: 'save goal',
  });
