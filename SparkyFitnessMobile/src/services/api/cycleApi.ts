import { apiFetch } from './apiClient';
import type {
  SharedCycleSettings,
  SharedCycleDailyLog,
  SharedCycle,
  SharedCycleTestEntry,
  CycleOverview,
  FertilityDetails,
  CycleCorrelations,
  CycleInsightsOverview,
  DisplayPreferences,
} from '../../types/womensHealth';

export const getSettings = async (): Promise<SharedCycleSettings | null> => {
  return apiFetch<SharedCycleSettings | null>({
    endpoint: '/api/v2/cycle/settings',
    serviceName: 'Cycle API',
    operation: 'get settings',
  });
};

export const putSettings = async (
  body: Partial<SharedCycleSettings> & {
    mark_onboarded?: boolean;
    reset_onboarding?: boolean;
  }
): Promise<SharedCycleSettings> => {
  return apiFetch<SharedCycleSettings>({
    endpoint: '/api/v2/cycle/settings',
    serviceName: 'Cycle API',
    operation: 'put settings',
    method: 'PUT',
    body,
  });
};

export const getOverview = async (date?: string): Promise<CycleOverview> => {
  const queryParams = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiFetch<CycleOverview>({
    endpoint: `/api/v2/cycle/overview${queryParams}`,
    serviceName: 'Cycle API',
    operation: 'get overview',
  });
};

export const listLogs = async (
  startDate: string,
  endDate: string
): Promise<SharedCycleDailyLog[]> => {
  return apiFetch<SharedCycleDailyLog[]>({
    endpoint: `/api/v2/cycle/logs?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    serviceName: 'Cycle API',
    operation: 'list logs',
  });
};

export const getLog = async (date: string): Promise<SharedCycleDailyLog | null> => {
  return apiFetch<SharedCycleDailyLog | null>({
    endpoint: `/api/v2/cycle/logs/${encodeURIComponent(date)}`,
    serviceName: 'Cycle API',
    operation: 'get log',
  });
};

export const putLog = async (
  date: string,
  body: Partial<SharedCycleDailyLog>
): Promise<SharedCycleDailyLog> => {
  return apiFetch<SharedCycleDailyLog>({
    endpoint: `/api/v2/cycle/logs/${encodeURIComponent(date)}`,
    serviceName: 'Cycle API',
    operation: 'put log',
    method: 'PUT',
    body,
  });
};

export const deleteLog = async (date: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/v2/cycle/logs/${encodeURIComponent(date)}`,
    serviceName: 'Cycle API',
    operation: 'delete log',
    method: 'DELETE',
  });
};

export const listCycles = async (limit?: number): Promise<SharedCycle[]> => {
  const queryParams = limit ? `?limit=${limit}` : '';
  return apiFetch<SharedCycle[]>({
    endpoint: `/api/v2/cycle/cycles${queryParams}`,
    serviceName: 'Cycle API',
    operation: 'list cycles',
  });
};

export const dismissPrompt = async (key: string): Promise<SharedCycleSettings> => {
  return apiFetch<SharedCycleSettings>({
    endpoint: '/api/v2/cycle/prompts/dismiss',
    serviceName: 'Cycle API',
    operation: 'dismiss prompt',
    method: 'POST',
    body: { key },
  });
};

export const bulkPutLogs = async (
  body: { date: string; flow_level: string | null }[]
): Promise<CycleOverview> => {
  return apiFetch<CycleOverview>({
    endpoint: '/api/v2/cycle/logs',
    serviceName: 'Cycle API',
    operation: 'bulk logs',
    method: 'PUT',
    body,
  });
};

export const createManualCycle = async (
  body: Partial<SharedCycle>
): Promise<SharedCycle> => {
  return apiFetch<SharedCycle>({
    endpoint: '/api/v2/cycle/cycles',
    serviceName: 'Cycle API',
    operation: 'create cycle',
    method: 'POST',
    body,
  });
};

export const updateCycle = async (
  id: string,
  body: Partial<SharedCycle>
): Promise<SharedCycle> => {
  return apiFetch<SharedCycle>({
    endpoint: `/api/v2/cycle/cycles/${encodeURIComponent(id)}`,
    serviceName: 'Cycle API',
    operation: 'update cycle',
    method: 'PUT',
    body,
  });
};

export const deleteCycle = async (id: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/v2/cycle/cycles/${encodeURIComponent(id)}`,
    serviceName: 'Cycle API',
    operation: 'delete cycle',
    method: 'DELETE',
  });
};

export const getInsights = async (): Promise<CycleInsightsOverview> => {
  return apiFetch<CycleInsightsOverview>({
    endpoint: '/api/v2/cycle/insights',
    serviceName: 'Cycle API',
    operation: 'get insights',
  });
};

export const listTestEntries = async (
  startDate: string,
  endDate: string
): Promise<SharedCycleTestEntry[]> => {
  return apiFetch<SharedCycleTestEntry[]>({
    endpoint: `/api/v2/cycle/tests?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    serviceName: 'Cycle API',
    operation: 'list tests',
  });
};

export const createTestEntry = async (
  body: Omit<SharedCycleTestEntry, 'id' | 'user_id' | 'tested_at'> & {
    tested_at?: string;
  }
): Promise<SharedCycleTestEntry> => {
  return apiFetch<SharedCycleTestEntry>({
    endpoint: '/api/v2/cycle/tests',
    serviceName: 'Cycle API',
    operation: 'create test entry',
    method: 'POST',
    body,
  });
};

export const deleteTestEntry = async (id: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/v2/cycle/tests/${encodeURIComponent(id)}`,
    serviceName: 'Cycle API',
    operation: 'delete test entry',
    method: 'DELETE',
  });
};

export const getFertility = async (date?: string): Promise<FertilityDetails> => {
  const queryParams = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiFetch<FertilityDetails>({
    endpoint: `/api/v2/cycle/fertility${queryParams}`,
    serviceName: 'Cycle API',
    operation: 'get fertility',
  });
};

export const getCorrelations = async (): Promise<CycleCorrelations> => {
  return apiFetch<CycleCorrelations>({
    endpoint: '/api/v2/cycle/correlations',
    serviceName: 'Cycle API',
    operation: 'get correlations',
  });
};

export const getExport = async (): Promise<Record<string, unknown>> => {
  return apiFetch<Record<string, unknown>>({
    endpoint: '/api/v2/cycle/export',
    serviceName: 'Cycle API',
    operation: 'export data',
  });
};

export const getDisplayPreferences = async (
  viewGroup: string,
  platform = 'mobile'
): Promise<DisplayPreferences> => {
  return apiFetch<DisplayPreferences>({
    endpoint: `/api/v2/cycle/display-preferences/${encodeURIComponent(viewGroup)}?platform=${encodeURIComponent(platform)}`,
    serviceName: 'Cycle API',
    operation: 'get display preferences',
  });
};

export const putDisplayPreferences = async (
  viewGroup: string,
  body: DisplayPreferences,
  platform = 'mobile'
): Promise<DisplayPreferences> => {
  return apiFetch<DisplayPreferences>({
    endpoint: `/api/v2/cycle/display-preferences/${encodeURIComponent(viewGroup)}?platform=${encodeURIComponent(platform)}`,
    serviceName: 'Cycle API',
    operation: 'put display preferences',
    method: 'PUT',
    body,
  });
};

export const upsertBbt = async (date: string, value: number | null): Promise<void> => {
  const categories = await apiFetch<{ id: string; name: string }[]>( {
    endpoint: '/api/measurements/custom-categories',
    serviceName: 'Measurements API',
    operation: 'list custom categories',
  });
  
  let bbtCategory = categories.find((c) => c.name === 'basal_body_temperature');
  if (!bbtCategory) {
    try {
      bbtCategory = await apiFetch<{ id: string; name: string }>({
        endpoint: '/api/measurements/custom-categories',
        serviceName: 'Measurements API',
        operation: 'create custom category',
        method: 'POST',
        body: { name: 'basal_body_temperature', display_name: 'Basal Body Temperature', unit: '°C' },
      });
    } catch (error) {
      // A concurrent call may have created the category first. Re-list and
      // reuse the existing one instead of leaving a duplicate behind.
      const refreshed = await apiFetch<{ id: string; name: string }[]>({
        endpoint: '/api/measurements/custom-categories',
        serviceName: 'Measurements API',
        operation: 'list custom categories',
      });
      const existing = refreshed.find((c) => c.name === 'basal_body_temperature');
      if (!existing) throw error;
      bbtCategory = existing;
    }
  }

  if (value === null) {
    const entries = await apiFetch<{ id: string; category_id: string; entry_date: string }[]>( {
      endpoint: `/api/measurements/custom-entries/${date}`,
      serviceName: 'Measurements API',
      operation: 'list custom entries',
    });
    const bbtEntry = entries.find((e) => e.category_id === bbtCategory.id);
    if (bbtEntry) {
      await apiFetch<void>({
        endpoint: `/api/measurements/custom-entries/${bbtEntry.id}`,
        serviceName: 'Measurements API',
        operation: 'delete custom entry',
        method: 'DELETE',
      });
    }
  } else {
    await apiFetch<void>({
      endpoint: '/api/measurements/custom-entries',
      serviceName: 'Measurements API',
      operation: 'upsert custom entry',
      method: 'POST',
      body: {
        category_id: bbtCategory.id,
        value: String(value),
        entry_date: date,
        source: 'manual',
      },
    });
  }
};
