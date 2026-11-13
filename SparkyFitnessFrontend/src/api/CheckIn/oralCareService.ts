import { api } from '@/api/api';
import type {
  CreateOralCareSessionBody,
  OralCareDaySummaryResponse,
  OralCareHistoryResponse,
  OralCareSessionResponse,
  OralCareSettings,
  UpdateOralCareSessionBody,
} from '@workspace/shared';

export const fetchOralCareDaySummary = async (
  date: string
): Promise<OralCareDaySummaryResponse> =>
  api.get('/v2/oral-care/day-summary', { params: { date } });

export const fetchOralCareHistory = async (
  startDate: string,
  endDate: string
): Promise<OralCareHistoryResponse> =>
  api.get('/v2/oral-care/history', { params: { startDate, endDate } });

export const createOralCareSession = async (
  data: CreateOralCareSessionBody
): Promise<OralCareSessionResponse> =>
  api.post('/v2/oral-care/entries', { body: data });

export const updateOralCareSession = async (
  id: string,
  data: UpdateOralCareSessionBody
): Promise<OralCareSessionResponse> =>
  api.put(`/v2/oral-care/entries/${id}`, { body: data });

export const deleteOralCareSession = async (
  id: string
): Promise<{ success: boolean }> => api.delete(`/v2/oral-care/entries/${id}`);

export const saveOralCareSettings = async (
  settings: OralCareSettings
): Promise<OralCareSettings> =>
  api.put('/v2/oral-care/settings', { body: settings });
