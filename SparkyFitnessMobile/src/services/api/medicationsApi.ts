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
} from '@workspace/shared';

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

export const getMedication = (id: string): Promise<MedicationDetail> =>
  apiFetch<MedicationDetail>({
    endpoint: `/api/v2/medications/${id}`,
    serviceName: SERVICE_NAME,
    operation: 'get medication',
  });

export const createMedication = (body: CreateMedicationInput): Promise<Medication> =>
  apiFetch<Medication>({
    endpoint: '/api/v2/medications',
    serviceName: SERVICE_NAME,
    operation: 'create medication',
    method: 'POST',
    body,
  });

export const updateMedication = (id: string, body: UpdateMedicationInput): Promise<Medication> =>
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
  body: CreateScheduleInput,
): Promise<MedicationSchedule> =>
  apiFetch<MedicationSchedule>({
    endpoint: `/api/v2/medications/${medicationId}/schedules`,
    serviceName: SERVICE_NAME,
    operation: 'create schedule',
    method: 'POST',
    body,
  });

export const updateSchedule = (id: string, body: UpdateScheduleInput): Promise<MedicationSchedule> =>
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

export const createEntry = (body: CreateMedicationEntryInput): Promise<MedicationEntry> =>
  apiFetch<MedicationEntry>({
    endpoint: '/api/v2/medications/entries',
    serviceName: SERVICE_NAME,
    operation: 'create entry',
    method: 'POST',
    body,
  });

export const updateEntry = (id: string, body: UpdateMedicationEntryInput): Promise<MedicationEntry> =>
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
