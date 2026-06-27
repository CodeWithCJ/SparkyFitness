import { apiCall } from '@/api/api';
import type {
  SharedUserCustomSymptom,
  SharedSymptomEntry,
} from '@workspace/shared';

// --- Custom Symptoms --------------------------------------------------------

export const listCustomSymptoms = (): Promise<SharedUserCustomSymptom[]> =>
  apiCall('/v2/symptoms/custom', { method: 'GET' });

export const createCustomSymptom = (
  body: Partial<SharedUserCustomSymptom> & { name: string }
): Promise<SharedUserCustomSymptom> =>
  apiCall('/v2/symptoms/custom', { method: 'POST', body });

export const deleteCustomSymptom = (id: string): Promise<void> =>
  apiCall(`/v2/symptoms/custom/${id}`, { method: 'DELETE' });

// --- Custom Symptom Locations ----------------------------------------------

export interface CustomLocation {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export const listCustomLocations = (): Promise<CustomLocation[]> =>
  apiCall('/v2/symptoms/locations', { method: 'GET' });

export const createCustomLocation = (name: string): Promise<CustomLocation> =>
  apiCall('/v2/symptoms/locations', { method: 'POST', body: { name } });

export const deleteCustomLocation = (id: string): Promise<void> =>
  apiCall(`/v2/symptoms/locations/${id}`, { method: 'DELETE' });

// --- Symptom Entries --------------------------------------------------------

export const listSymptomEntries = (opts?: {
  fromDate?: string;
  toDate?: string;
  symptomName?: string;
}): Promise<SharedSymptomEntry[]> =>
  apiCall('/v2/symptoms/entries', { method: 'GET', params: opts });

export const createSymptomEntry = (
  body: Partial<SharedSymptomEntry> & { symptom_name_snapshot: string }
): Promise<SharedSymptomEntry> =>
  apiCall('/v2/symptoms/entries', { method: 'POST', body });

export const deleteSymptomEntry = (id: string): Promise<void> =>
  apiCall(`/v2/symptoms/entries/${id}`, { method: 'DELETE' });
