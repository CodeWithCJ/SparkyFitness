import { api } from '@/api/api';
import { SleepEntry } from '@/types';

export const getSleepEntries = async (
  startDate: string,
  endDate: string
): Promise<SleepEntry[]> => {
  return api.get('/sleep/details', {
    params: { startDate, endDate },
  });
};

export const saveSleepEntry = async (
  data: Partial<SleepEntry>
): Promise<void> => {
  return api.post('/sleep/manual_entry', { body: data });
};

export const updateSleepEntry = async (
  id: string,
  data: Partial<SleepEntry>
): Promise<void> => {
  return api.put(`/sleep/${id}`, { body: data });
};

export const deleteSleepEntry = async (id: string): Promise<void> => {
  return api.delete(`/sleep/${id}`);
};
