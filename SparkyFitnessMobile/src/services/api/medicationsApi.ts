import { apiFetch } from './apiClient';
import type {
  Medication,
  MedicationDetail,
  MedicationEntry,
  MedicationSchedule,
  CreateMedicationInput,
  UpdateMedicationInput,
  CreateMedicationEntryInput,
  UpdateMedicationEntryInput,
  CreateScheduleInput,
  UpdateScheduleInput,
  MedicationPen,
  InjectionEntry,
  LogInjectionInput,
  TitrationStep,
  UpdateTitrationStepInput,
  SerumCurveResponse,
  SiteSuggestionResponse,
  SupplementLabelExtraction,
  SupplementLookupResponse,
} from '@workspace/shared';
import { AI_TIMEOUT_MS } from '../../utils/concurrency';

const SERVICE_NAME = 'Medications API';

export const listMedications = async (opts?: {
  activeOnly?: boolean;
}): Promise<MedicationDetail[]> => {
  const params = new URLSearchParams();
  if (opts?.activeOnly) params.set('activeOnly', 'true');
  const qs = params.toString();
  const result = await apiFetch<MedicationDetail[] | null>({
    endpoint: `/api/v2/medications${qs ? `?${qs}` : ''}`,
    serviceName: SERVICE_NAME,
    operation: 'list medications',
  });
  return result ?? [];
};

/**
 * Finds a supplement by the barcode on its package.
 * GET /api/v2/medications/supplement-lookup?upc=
 */
export const lookupSupplementBarcode = (
  upc: string
): Promise<SupplementLookupResponse> =>
  apiFetch<SupplementLookupResponse>({
    endpoint: `/api/v2/medications/supplement-lookup?upc=${encodeURIComponent(upc)}`,
    serviceName: SERVICE_NAME,
    operation: 'look up supplement barcode',
  });

/**
 * Reads a photographed Supplement Facts panel with the server's vision AI.
 * POST /api/v2/medications/supplement-label/scan
 */
export const scanSupplementLabelImage = (
  base64Image: string
): Promise<SupplementLookupResponse> =>
  apiFetch<SupplementLookupResponse>({
    endpoint: '/api/v2/medications/supplement-label/scan',
    serviceName: SERVICE_NAME,
    operation: 'scan supplement label',
    method: 'POST',
    body: { image: base64Image, mime_type: 'image/jpeg' },
    timeoutMs: AI_TIMEOUT_MS,
  });

/**
 * Turns a panel the phone read on device into nutrients (no AI runs on the
 * server). POST /api/v2/medications/supplement-label/map
 */
export const mapSupplementLabel = (
  label: SupplementLabelExtraction
): Promise<SupplementLookupResponse> =>
  apiFetch<SupplementLookupResponse>({
    endpoint: '/api/v2/medications/supplement-label/map',
    serviceName: SERVICE_NAME,
    operation: 'map supplement label',
    method: 'POST',
    body: label,
  });

export const getMedication = (id: string): Promise<MedicationDetail> =>
  apiFetch<MedicationDetail>({
    endpoint: `/api/v2/medications/${id}`,
    serviceName: SERVICE_NAME,
    operation: 'get medication',
  });

export const createMedication = (
  body: CreateMedicationInput
): Promise<Medication> =>
  apiFetch<Medication>({
    endpoint: '/api/v2/medications',
    serviceName: SERVICE_NAME,
    operation: 'create medication',
    method: 'POST',
    body,
  });

export const updateMedication = (
  id: string,
  body: UpdateMedicationInput
): Promise<Medication> =>
  apiFetch<Medication>({
    endpoint: `/api/v2/medications/${id}`,
    serviceName: SERVICE_NAME,
    operation: 'update medication',
    method: 'PUT',
    body,
  });

export const deleteMedication = (id: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/v2/medications/${id}`,
    serviceName: SERVICE_NAME,
    operation: 'delete medication',
    method: 'DELETE',
  });

export const createSchedule = (
  medicationId: string,
  body: CreateScheduleInput
): Promise<MedicationSchedule> =>
  apiFetch<MedicationSchedule>({
    endpoint: `/api/v2/medications/${medicationId}/schedules`,
    serviceName: SERVICE_NAME,
    operation: 'create schedule',
    method: 'POST',
    body,
  });

export const updateSchedule = (
  id: string,
  body: UpdateScheduleInput
): Promise<MedicationSchedule> =>
  apiFetch<MedicationSchedule>({
    endpoint: `/api/v2/medications/schedules/${id}`,
    serviceName: SERVICE_NAME,
    operation: 'update schedule',
    method: 'PUT',
    body,
  });

export const deleteSchedule = (id: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/v2/medications/schedules/${id}`,
    serviceName: SERVICE_NAME,
    operation: 'delete schedule',
    method: 'DELETE',
  });

export const listEntries = async (opts?: {
  fromDate?: string;
  toDate?: string;
  medicationId?: string;
}): Promise<MedicationEntry[]> => {
  const params = new URLSearchParams();
  if (opts?.fromDate) params.set('fromDate', opts.fromDate);
  if (opts?.toDate) params.set('toDate', opts.toDate);
  if (opts?.medicationId) params.set('medicationId', opts.medicationId);
  const qs = params.toString();
  const result = await apiFetch<MedicationEntry[] | null>({
    endpoint: `/api/v2/medications/entries${qs ? `?${qs}` : ''}`,
    serviceName: SERVICE_NAME,
    operation: 'list entries',
  });
  return result ?? [];
};

export const createEntry = (
  body: CreateMedicationEntryInput
): Promise<MedicationEntry> =>
  apiFetch<MedicationEntry>({
    endpoint: '/api/v2/medications/entries',
    serviceName: SERVICE_NAME,
    operation: 'create entry',
    method: 'POST',
    body,
  });

export const updateEntry = (
  id: string,
  body: UpdateMedicationEntryInput
): Promise<MedicationEntry> =>
  apiFetch<MedicationEntry>({
    endpoint: `/api/v2/medications/entries/${id}`,
    serviceName: SERVICE_NAME,
    operation: 'update entry',
    method: 'PUT',
    body,
  });

export const deleteEntry = (id: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/v2/medications/entries/${id}`,
    serviceName: SERVICE_NAME,
    operation: 'delete entry',
    method: 'DELETE',
  });

// --- GLP-1: pens / vials ---------------------------------------------------

export const listPens = async (
  medicationId: string
): Promise<MedicationPen[]> =>
  (await apiFetch<MedicationPen[] | null>({
    endpoint: `/api/v2/medications/${medicationId}/pens`,
    serviceName: SERVICE_NAME,
    operation: 'list pens',
  })) ?? [];

export const createPen = (
  medicationId: string,
  body: Partial<Omit<MedicationPen, 'id' | 'medication_id' | 'doses_used'>>
): Promise<MedicationPen> =>
  apiFetch<MedicationPen>({
    endpoint: `/api/v2/medications/${medicationId}/pens`,
    serviceName: SERVICE_NAME,
    operation: 'create pen',
    method: 'POST',
    body,
  });

export const updatePen = (
  id: string,
  body: Partial<Omit<MedicationPen, 'id' | 'medication_id'>>
): Promise<MedicationPen> =>
  apiFetch<MedicationPen>({
    endpoint: `/api/v2/medications/pens/${id}`,
    serviceName: SERVICE_NAME,
    operation: 'update pen',
    method: 'PUT',
    body,
  });

export const deletePen = (id: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/v2/medications/pens/${id}`,
    serviceName: SERVICE_NAME,
    operation: 'delete pen',
    method: 'DELETE',
  });

// --- GLP-1: injections -----------------------------------------------------

export const listInjections = async (
  medicationId: string
): Promise<InjectionEntry[]> =>
  (await apiFetch<InjectionEntry[] | null>({
    endpoint: `/api/v2/medications/${medicationId}/injections`,
    serviceName: SERVICE_NAME,
    operation: 'list injections',
  })) ?? [];

export const logInjection = (
  body: LogInjectionInput
): Promise<InjectionEntry & { pen: MedicationPen | null }> =>
  apiFetch<InjectionEntry & { pen: MedicationPen | null }>({
    endpoint: '/api/v2/medications/injections',
    serviceName: SERVICE_NAME,
    operation: 'log injection',
    method: 'POST',
    body,
  });

export const deleteInjection = (id: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/v2/medications/injections/${id}`,
    serviceName: SERVICE_NAME,
    operation: 'delete injection',
    method: 'DELETE',
  });

// --- GLP-1: titration ------------------------------------------------------

export const listTitration = async (
  medicationId: string
): Promise<TitrationStep[]> =>
  (await apiFetch<TitrationStep[] | null>({
    endpoint: `/api/v2/medications/${medicationId}/titration`,
    serviceName: SERVICE_NAME,
    operation: 'list titration',
  })) ?? [];

export const createTitrationStep = (
  medicationId: string,
  body: UpdateTitrationStepInput & { dose_mg: number }
): Promise<TitrationStep> =>
  apiFetch<TitrationStep>({
    endpoint: `/api/v2/medications/${medicationId}/titration`,
    serviceName: SERVICE_NAME,
    operation: 'create titration step',
    method: 'POST',
    body,
  });

export const updateTitrationStep = (
  id: string,
  body: UpdateTitrationStepInput
): Promise<TitrationStep> =>
  apiFetch<TitrationStep>({
    endpoint: `/api/v2/medications/titration/${id}`,
    serviceName: SERVICE_NAME,
    operation: 'update titration step',
    method: 'PUT',
    body,
  });

export const deleteTitrationStep = (id: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/v2/medications/titration/${id}`,
    serviceName: SERVICE_NAME,
    operation: 'delete titration step',
    method: 'DELETE',
  });

// --- GLP-1: modeled serum level and site rotation --------------------------

export const getSerumCurve = (
  medicationId: string
): Promise<SerumCurveResponse> =>
  apiFetch<SerumCurveResponse>({
    endpoint: `/api/v2/medications/${medicationId}/glp1/serum-curve`,
    serviceName: SERVICE_NAME,
    operation: 'get serum curve',
  });

export const getSiteSuggestion = (
  medicationId: string
): Promise<SiteSuggestionResponse> =>
  apiFetch<SiteSuggestionResponse>({
    endpoint: `/api/v2/medications/${medicationId}/glp1/site-suggestion`,
    serviceName: SERVICE_NAME,
    operation: 'get site suggestion',
  });
