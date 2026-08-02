import { apiFetch } from './apiClient';
import type {
  SharedPregnancy,
  SharedContraction,
  PregnancyOverview,
  ContractionAnalysis,
} from '../../types/womensHealth';

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

// --- Contractions ---

export const createContraction = async (
  pregnancyId: string,
  startedAt?: string
): Promise<SharedContraction> => {
  return apiFetch<SharedContraction>({
    endpoint: '/api/v2/pregnancy/contractions',
    serviceName: 'Pregnancy API',
    operation: 'create contraction',
    method: 'POST',
    body: { pregnancy_id: pregnancyId, started_at: startedAt },
  });
};

export const updateContraction = async (
  id: string,
  body: { ended_at?: string | null; intensity?: number | null }
): Promise<SharedContraction> => {
  return apiFetch<SharedContraction>({
    endpoint: `/api/v2/pregnancy/contractions/${encodeURIComponent(id)}`,
    serviceName: 'Pregnancy API',
    operation: 'update contraction',
    method: 'PUT',
    body,
  });
};

export const getContractions = async (): Promise<ContractionAnalysis> => {
  return apiFetch<ContractionAnalysis>({
    endpoint: '/api/v2/pregnancy/contractions',
    serviceName: 'Pregnancy API',
    operation: 'get contractions',
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
