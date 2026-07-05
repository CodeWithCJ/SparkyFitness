import { apiCall } from '@/api/api';
import type {
  SharedCycleSettings,
  SharedCycleDailyLog,
  SharedCycle,
  SharedCycleTestEntry,
  CyclePrediction,
  CycleStats,
  CyclePhase,
  CorrelationResult,
  ConditionFlag,
} from '@workspace/shared';

export interface CycleOverview {
  settings: SharedCycleSettings | null;
  date: string;
  phase: CyclePhase;
  cycleDay: number | null;
  currentCycleStart: string | null;
  prediction: CyclePrediction;
  stats: CycleStats;
  log: SharedCycleDailyLog | null;
  late: { isLate: boolean; daysLate: number };
  insightKey: string;
}

export const getSettings = (): Promise<SharedCycleSettings | null> =>
  apiCall('/v2/cycle/settings', { method: 'GET' });

export const putSettings = (
  body: Partial<SharedCycleSettings> & {
    mark_onboarded?: boolean;
    reset_onboarding?: boolean;
  }
): Promise<SharedCycleSettings> =>
  apiCall('/v2/cycle/settings', { method: 'PUT', body });

export const getOverview = (date?: string): Promise<CycleOverview> =>
  apiCall('/v2/cycle/overview', { method: 'GET', params: { date } });

export const listLogs = (
  startDate: string,
  endDate: string
): Promise<SharedCycleDailyLog[]> =>
  apiCall('/v2/cycle/logs', { method: 'GET', params: { startDate, endDate } });

export const getLog = (date: string): Promise<SharedCycleDailyLog | null> =>
  apiCall(`/v2/cycle/logs/${date}`, { method: 'GET' });

export const putLog = (
  date: string,
  body: Partial<SharedCycleDailyLog>
): Promise<SharedCycleDailyLog> =>
  apiCall(`/v2/cycle/logs/${date}`, { method: 'PUT', body });

export const deleteLog = (date: string): Promise<void> =>
  apiCall(`/v2/cycle/logs/${date}`, { method: 'DELETE' });

export const listCycles = (limit?: number): Promise<SharedCycle[]> =>
  apiCall('/v2/cycle/cycles', { method: 'GET', params: { limit } });

export const dismissPrompt = (key: string): Promise<SharedCycleSettings> =>
  apiCall('/v2/cycle/prompts/dismiss', { method: 'POST', body: { key } });

export const bulkPutLogs = (
  body: Array<{ date: string; flow_level: string | null }>
): Promise<CycleOverview> => apiCall('/v2/cycle/logs', { method: 'PUT', body });

export const createManualCycle = (
  body: Partial<SharedCycle>
): Promise<SharedCycle> =>
  apiCall('/v2/cycle/cycles', { method: 'POST', body });

export const updateCycle = (
  id: string,
  body: Partial<SharedCycle>
): Promise<SharedCycle> =>
  apiCall(`/v2/cycle/cycles/${id}`, { method: 'PUT', body });

export const deleteCycle = (id: string): Promise<void> =>
  apiCall(`/v2/cycle/cycles/${id}`, { method: 'DELETE' });

export const getInsights = (): Promise<unknown> =>
  apiCall('/v2/cycle/insights', { method: 'GET' });

export interface FertilityDetails {
  ovulationEstimate: {
    date: string;
    basis: 'bbt' | 'opk' | 'calendar';
    confidence: 'high' | 'medium' | 'low';
  } | null;
  conceptionProbability: {
    probability: number;
    band: 'low' | 'medium' | 'high' | 'peak';
  };
  fertileWindowSeries: Array<{
    date: string;
    offset: number;
    probability: number;
    band: 'low' | 'medium' | 'high' | 'peak';
    isToday: boolean;
  }>;
  dpo: number | null;
  bbtShiftStatus: {
    coverline: number | null;
    confirmedOvulationDate: string | null;
    isConfirmed: boolean;
  };
  bbtStatus: {
    categoryExists: boolean;
    latestDate: string | null;
    staleDays: number | null;
    isStale: boolean;
  };
}

export const listTestEntries = (
  startDate: string,
  endDate: string
): Promise<SharedCycleTestEntry[]> =>
  apiCall('/v2/cycle/tests', { method: 'GET', params: { startDate, endDate } });

export const createTestEntry = (
  body: Omit<SharedCycleTestEntry, 'id' | 'user_id' | 'tested_at'> & {
    tested_at?: string;
  }
): Promise<SharedCycleTestEntry> =>
  apiCall('/v2/cycle/tests', { method: 'POST', body });

export const deleteTestEntry = (id: string): Promise<void> =>
  apiCall(`/v2/cycle/tests/${id}`, { method: 'DELETE' });

export const getFertility = (date?: string): Promise<FertilityDetails> =>
  apiCall('/v2/cycle/fertility', { method: 'GET', params: { date } });

export interface CycleCorrelations {
  correlations: CorrelationResult[];
  conditionFlags: ConditionFlag[];
  stats: CycleStats;
}

export const getCorrelations = (): Promise<CycleCorrelations> =>
  apiCall('/v2/cycle/correlations', { method: 'GET' });

export const getExport = (): Promise<Record<string, unknown>> =>
  apiCall('/v2/cycle/export', { method: 'GET' });

export interface DisplayPreferences {
  enabled_items: string[];
  custom_items: Array<{
    value: string;
    displayName: string;
    capacityMl?: number;
  }>;
}

export const getDisplayPreferences = (
  viewGroup: string,
  platform = 'web'
): Promise<DisplayPreferences> =>
  apiCall(`/v2/cycle/display-preferences/${viewGroup}`, {
    method: 'GET',
    params: { platform },
  });

export const putDisplayPreferences = (
  viewGroup: string,
  body: DisplayPreferences,
  platform = 'web'
): Promise<DisplayPreferences> =>
  apiCall(`/v2/cycle/display-preferences/${viewGroup}`, {
    method: 'PUT',
    body,
    params: { platform },
  });
