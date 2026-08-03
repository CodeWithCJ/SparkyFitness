import { apiFetch } from './apiClient';
import type { SharedPregnancy, PregnancyOverview } from '../../types/womensHealth';

export const getCurrent = async (): Promise<SharedPregnancy | null> => {
  return apiFetch<SharedPregnancy | null>({
    endpoint: '/api/v2/pregnancy/current',
    serviceName: 'Pregnancy API',
    operation: 'get current pregnancy',
  });
};

export const getOverview = async (date?: string): Promise<PregnancyOverview> => {
  const queryParams = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiFetch<PregnancyOverview>({
    endpoint: `/api/v2/pregnancy/overview${queryParams}`,
    serviceName: 'Pregnancy API',
    operation: 'get overview',
  });
};

export const createPregnancy = async (
  body: Partial<SharedPregnancy>
): Promise<SharedPregnancy> => {
  return apiFetch<SharedPregnancy>({
    endpoint: '/api/v2/pregnancy',
    serviceName: 'Pregnancy API',
    operation: 'create pregnancy',
    method: 'POST',
    body,
  });
};

export const updatePregnancy = async (
  id: string,
  body: Partial<SharedPregnancy>
): Promise<SharedPregnancy> => {
  return apiFetch<SharedPregnancy>({
    endpoint: `/api/v2/pregnancy/${encodeURIComponent(id)}`,
    serviceName: 'Pregnancy API',
    operation: 'update pregnancy',
    method: 'PUT',
    body,
  });
};

export const deletePregnancy = async (id: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/v2/pregnancy/${encodeURIComponent(id)}`,
    serviceName: 'Pregnancy API',
    operation: 'delete pregnancy',
    method: 'DELETE',
  });
};

// --- Checklist ---

export const getChecklist = async (pregnancyId: string): Promise<unknown[]> => {
  return apiFetch<unknown[]>({
    endpoint: `/api/v2/pregnancy/checklist?pregnancy_id=${encodeURIComponent(pregnancyId)}`,
    serviceName: 'Pregnancy API',
    operation: 'get checklist',
  });
};

export const upsertChecklistItem = async (body: {
  id?: string;
  pregnancy_id?: string;
  template_key?: string | null;
  custom_title?: string | null;
  week?: number;
  completed?: boolean;
  dismissed?: boolean;
}): Promise<unknown> => {
  return apiFetch<unknown>({
    endpoint: '/api/v2/pregnancy/checklist',
    serviceName: 'Pregnancy API',
    operation: 'upsert checklist item',
    method: 'PUT',
    body,
  });
};
