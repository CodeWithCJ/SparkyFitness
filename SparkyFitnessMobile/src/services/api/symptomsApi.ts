import { apiFetch } from './apiClient';

export interface SymptomEntry {
  id?: string;
  user_id?: string;
  symptom_id?: string | null;
  symptom_name_snapshot: string;
  severity: number;
  source?: string;
  entry_date: string;
  logged_at?: string;
  notes?: string | null;
}

export const listSymptomEntries = async (
  fromDate: string,
  toDate: string
): Promise<SymptomEntry[]> => {
  return apiFetch<SymptomEntry[]>({
    endpoint: `/api/v2/symptoms/entries?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`,
    serviceName: 'Symptoms API',
    operation: 'list symptom entries',
  });
};

export const createSymptomEntry = async (
  body: Partial<SymptomEntry>
): Promise<SymptomEntry> => {
  return apiFetch<SymptomEntry>({
    endpoint: '/api/v2/symptoms/entries',
    serviceName: 'Symptoms API',
    operation: 'create symptom entry',
    method: 'POST',
    body,
  });
};

export const deleteSymptomEntry = async (id: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/v2/symptoms/entries/${encodeURIComponent(id)}`,
    serviceName: 'Symptoms API',
    operation: 'delete symptom entry',
    method: 'DELETE',
  });
};
