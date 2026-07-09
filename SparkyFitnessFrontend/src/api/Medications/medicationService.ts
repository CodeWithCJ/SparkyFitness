import { apiCall } from '@/api/api';
import type {
  Medication,
  MedicationDetail,
  MedicationSchedule,
  MedicationPen,
  InjectionEntry,
  TitrationStep,
  SerumCurveResponse,
  SiteSuggestionResponse,
  ListMedicationsOptions,
  LogInjectionInput,
  UpdateInjectionInput,
  UpdateTitrationStepInput,
  MedicationEntry,
  CreateMedicationEntryInput,
  UpdateMedicationEntryInput,
  ListMedicationEntriesOptions,
} from '@/types/medications';

// --- Medications -----------------------------------------------------------

export const listMedications = (
  opts?: ListMedicationsOptions
): Promise<Medication[]> =>
  apiCall('/v2/medications', { method: 'GET', params: opts });

export const getMedication = (id: string): Promise<MedicationDetail> =>
  apiCall(`/v2/medications/${id}`, { method: 'GET' });

export const createMedication = (
  body: Partial<Medication> & { name: string }
): Promise<Medication> => apiCall('/v2/medications', { method: 'POST', body });

export const updateMedication = (
  id: string,
  body: Partial<Medication>
): Promise<Medication> =>
  apiCall(`/v2/medications/${id}`, { method: 'PUT', body });

export const deleteMedication = (id: string): Promise<void> =>
  apiCall(`/v2/medications/${id}`, { method: 'DELETE' });

// --- Medication Entries (Adherence) ---------------------------------------

export const listMedicationEntries = (
  opts?: ListMedicationEntriesOptions
): Promise<MedicationEntry[]> =>
  apiCall('/v2/medications/entries', { method: 'GET', params: opts });

export const createMedicationEntry = (
  body: CreateMedicationEntryInput
): Promise<MedicationEntry> =>
  apiCall('/v2/medications/entries', { method: 'POST', body });

export const updateMedicationEntry = (
  id: string,
  body: UpdateMedicationEntryInput
): Promise<MedicationEntry> =>
  apiCall(`/v2/medications/entries/${id}`, { method: 'PUT', body });

export const deleteMedicationEntry = (id: string): Promise<void> =>
  apiCall(`/v2/medications/entries/${id}`, { method: 'DELETE' });

// --- Schedules -------------------------------------------------------------

export const addSchedule = (
  medicationId: string,
  body: Partial<MedicationSchedule> & { schedule_type_id: string }
): Promise<MedicationSchedule> =>
  apiCall(`/v2/medications/${medicationId}/schedules`, {
    method: 'POST',
    body,
  });

export const deleteSchedule = (id: string): Promise<void> =>
  apiCall(`/v2/medications/schedules/${id}`, { method: 'DELETE' });

// --- Pens / vials ----------------------------------------------------------

export const listPens = (medicationId: string): Promise<MedicationPen[]> =>
  apiCall(`/v2/medications/${medicationId}/pens`, { method: 'GET' });

export const createPen = (
  medicationId: string,
  body: Partial<MedicationPen>
): Promise<MedicationPen> =>
  apiCall(`/v2/medications/${medicationId}/pens`, { method: 'POST', body });

export const updatePen = (
  id: string,
  body: Partial<MedicationPen>
): Promise<MedicationPen> =>
  apiCall(`/v2/medications/pens/${id}`, { method: 'PUT', body });

export const deletePen = (id: string): Promise<void> =>
  apiCall(`/v2/medications/pens/${id}`, { method: 'DELETE' });

// --- Injections ------------------------------------------------------------

export const listInjections = (
  medicationId: string
): Promise<InjectionEntry[]> =>
  apiCall(`/v2/medications/${medicationId}/injections`, { method: 'GET' });

export const logInjection = (
  body: LogInjectionInput
): Promise<InjectionEntry & { pen: MedicationPen | null }> =>
  apiCall('/v2/medications/injections', { method: 'POST', body });

export const updateInjection = (
  id: string,
  body: UpdateInjectionInput
): Promise<InjectionEntry> =>
  apiCall(`/v2/medications/injections/${id}`, { method: 'PUT', body });

export const deleteInjection = (id: string): Promise<void> =>
  apiCall(`/v2/medications/injections/${id}`, { method: 'DELETE' });

// --- Titration -------------------------------------------------------------

export const listTitration = (medicationId: string): Promise<TitrationStep[]> =>
  apiCall(`/v2/medications/${medicationId}/titration`, { method: 'GET' });

export const addTitrationStep = (
  medicationId: string,
  body: Partial<TitrationStep> & { dose_mg: number }
): Promise<TitrationStep> =>
  apiCall(`/v2/medications/${medicationId}/titration`, {
    method: 'POST',
    body,
  });

export const updateTitrationStep = (
  id: string,
  body: UpdateTitrationStepInput
): Promise<TitrationStep> =>
  apiCall(`/v2/medications/titration/${id}`, { method: 'PUT', body });

export const deleteTitrationStep = (id: string): Promise<void> =>
  apiCall(`/v2/medications/titration/${id}`, { method: 'DELETE' });

// --- GLP-1 derived ---------------------------------------------------------

export const getSerumCurve = (
  medicationId: string,
  query?: { fromDay?: number; toDay?: number; stepDays?: number }
): Promise<SerumCurveResponse> =>
  apiCall(`/v2/medications/${medicationId}/glp1/serum-curve`, {
    method: 'GET',
    params: query,
  });

export const getSiteSuggestion = (
  medicationId: string
): Promise<SiteSuggestionResponse> =>
  apiCall(`/v2/medications/${medicationId}/glp1/site-suggestion`, {
    method: 'GET',
  });
