import { apiCall } from '@/api/api';
import type {
  SharedPregnancy,
  SharedKickSession,
  SharedContraction,
  GestationalAge,
  BabyWeek,
  ContractionStats,
} from '@workspace/shared';

import type { ChecklistItem } from '@/pages/Cycle/pregnancy/pregnancyTypes';

export type { ChecklistItem };

export interface PregnancyVitals {
  latestWeight: number | null;
  prePregnancyWeight: number | null;
  height: number | null;
  prePregnancyBmi: number | null;
  weightDelta: number | null;
  weightGainStatus: 'within_range' | 'below_range' | 'above_range' | null;
  gainRange: { lowKg: number; highKg: number; category: string } | null;
  bpValue: string | null;
  prenatalMedication: {
    id: string;
    name: string;
    entryId: string | null;
    loggedToday: boolean;
  } | null;
  supplementMedication: {
    id: string;
    name: string;
    entryId: string | null;
    loggedToday: boolean;
  } | null;
}

export interface PregnancyOverview {
  pregnancy: SharedPregnancy | null;
  date?: string;
  gestation?: GestationalAge;
  baby?: BabyWeek | null;
  checklist?: ChecklistItem[];
  checklistProgress?: { done: number; total: number };
  nextAppointment?: Record<string, unknown> | null;
  recentKickSessions?: SharedKickSession[];
  vitals?: PregnancyVitals | null;
}

export const getCurrent = (): Promise<SharedPregnancy | null> =>
  apiCall('/v2/pregnancy/current', { method: 'GET' });

export const getOverview = (date?: string): Promise<PregnancyOverview> =>
  apiCall('/v2/pregnancy/overview', { method: 'GET', params: { date } });

export const createPregnancy = (
  body: Partial<SharedPregnancy>
): Promise<SharedPregnancy> =>
  apiCall('/v2/pregnancy', { method: 'POST', body });

export const updatePregnancy = (
  id: string,
  body: Partial<SharedPregnancy>
): Promise<SharedPregnancy> =>
  apiCall(`/v2/pregnancy/${id}`, { method: 'PUT', body });

export const deletePregnancy = (id: string): Promise<void> =>
  apiCall(`/v2/pregnancy/${id}`, { method: 'DELETE' });

// Kicks
export const startKickSession = (
  pregnancyId: string
): Promise<SharedKickSession> =>
  apiCall('/v2/pregnancy/kicks/start', {
    method: 'POST',
    body: { pregnancy_id: pregnancyId },
  });

export const updateKickSession = (
  id: string,
  body: { kick_count?: number; kick_times?: string[]; ended?: boolean }
): Promise<SharedKickSession> =>
  apiCall(`/v2/pregnancy/kicks/${id}`, { method: 'PUT', body });

export const listKickSessions = (): Promise<SharedKickSession[]> =>
  apiCall('/v2/pregnancy/kicks', { method: 'GET' });

// Contractions
export const createContraction = (
  pregnancyId: string,
  startedAt?: string
): Promise<SharedContraction> =>
  apiCall('/v2/pregnancy/contractions', {
    method: 'POST',
    body: { pregnancy_id: pregnancyId, started_at: startedAt },
  });

export const updateContraction = (
  id: string,
  body: { ended_at?: string | null; intensity?: number | null }
): Promise<SharedContraction> =>
  apiCall(`/v2/pregnancy/contractions/${id}`, { method: 'PUT', body });

export interface ContractionAnalysis {
  contractions: SharedContraction[];
  stats: ContractionStats;
}

export const getContractions = (): Promise<ContractionAnalysis> =>
  apiCall('/v2/pregnancy/contractions', { method: 'GET' });

// Checklist
export const getChecklist = (pregnancyId: string): Promise<unknown[]> =>
  apiCall('/v2/pregnancy/checklist', {
    method: 'GET',
    params: { pregnancy_id: pregnancyId },
  });

export const upsertChecklistItem = (body: {
  id?: string;
  pregnancy_id?: string;
  template_key?: string | null;
  custom_title?: string | null;
  week?: number;
  completed?: boolean;
  dismissed?: boolean;
}): Promise<unknown> =>
  apiCall('/v2/pregnancy/checklist', { method: 'PUT', body });

// Photos
export interface BumpPhoto {
  id: string;
  pregnancy_id: string;
  week: number;
  entry_date: string;
  file_path: string;
  notes: string | null;
}

export const listPhotos = (pregnancyId: string): Promise<BumpPhoto[]> =>
  apiCall('/v2/pregnancy/photos', {
    method: 'GET',
    params: { pregnancy_id: pregnancyId },
  });

export const uploadPhoto = (
  pregnancyId: string,
  week: number,
  file: File,
  notes?: string
): Promise<BumpPhoto> => {
  const form = new FormData();
  form.append('photo', file);
  form.append('pregnancy_id', pregnancyId);
  form.append('week', String(week));
  if (notes) form.append('notes', notes);
  return apiCall('/v2/pregnancy/photos', {
    method: 'POST',
    body: form,
    isFormData: true,
  });
};

export const deletePhoto = (id: string): Promise<void> =>
  apiCall(`/v2/pregnancy/photos/${id}`, { method: 'DELETE' });

// Appointments
export const listAppointments = (upcoming?: boolean): Promise<unknown[]> =>
  apiCall('/v2/pregnancy/appointments', {
    method: 'GET',
    params: { upcoming: upcoming ? 'true' : undefined },
  });

export const createAppointment = (
  body: Record<string, unknown>
): Promise<unknown> =>
  apiCall('/v2/pregnancy/appointments', { method: 'POST', body });

export const deleteAppointment = (id: string): Promise<void> =>
  apiCall(`/v2/pregnancy/appointments/${id}`, { method: 'DELETE' });
