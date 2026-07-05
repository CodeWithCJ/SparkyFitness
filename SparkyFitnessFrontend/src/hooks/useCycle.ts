import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as cycleService from '@/api/Cycle/cycleService';
import type {
  SharedCycleSettings,
  SharedCycleDailyLog,
  SharedCycle,
  SharedCycleTestEntry,
} from '@workspace/shared';

export const cycleKeys = {
  settings: () => ['cycle-settings'] as const,
  overview: (date?: string) => ['cycle-overview', date ?? 'today'] as const,
  logs: (start: string, end: string) => ['cycle-logs', start, end] as const,
  log: (date: string) => ['cycle-log', date] as const,
  cycles: () => ['cycle-cycles'] as const,
  insights: () => ['cycle-insights'] as const,
  fertility: (date?: string) => ['cycle-fertility', date ?? 'today'] as const,
  tests: (start: string, end: string) => ['cycle-tests', start, end] as const,
  displayPreferences: (viewGroup: string, platform?: string) =>
    ['cycle-display-preferences', viewGroup, platform ?? 'web'] as const,
};

export const useCycleSettings = () =>
  useQuery({
    queryKey: cycleKeys.settings(),
    queryFn: () => cycleService.getSettings(),
    meta: { errorMessage: 'Failed to load cycle settings.' },
  });

export const useCycleOverview = (date?: string) =>
  useQuery({
    queryKey: cycleKeys.overview(date),
    queryFn: () => cycleService.getOverview(date),
    meta: { errorMessage: 'Failed to load cycle overview.' },
  });

export const useCycleHistory = (limit?: number) =>
  useQuery({
    queryKey: cycleKeys.cycles(),
    queryFn: () => cycleService.listCycles(limit),
    meta: { errorMessage: 'Failed to load cycle history.' },
  });

export const useCycleLogs = (start: string, end: string) =>
  useQuery({
    queryKey: cycleKeys.logs(start, end),
    queryFn: () => cycleService.listLogs(start, end),
    meta: { errorMessage: 'Failed to load cycle logs.' },
  });

export const useUpsertCycleSettingsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Partial<SharedCycleSettings> & {
        mark_onboarded?: boolean;
        reset_onboarding?: boolean;
      }
    ) => cycleService.putSettings(body),
    onSuccess: (data) => {
      queryClient.setQueryData(cycleKeys.settings(), data);
      queryClient.invalidateQueries({ queryKey: cycleKeys.settings() });
      queryClient.invalidateQueries({ queryKey: ['cycle-overview'] });
      queryClient.invalidateQueries({ queryKey: ['cycle-fertility'] });
    },
    meta: {
      errorMessage: 'Could not save cycle settings.',
      successMessage: 'Settings saved.',
    },
  });
};

export const useUpsertDailyLogMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      date,
      body,
    }: {
      date: string;
      body: Partial<SharedCycleDailyLog>;
    }) => cycleService.putLog(date, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cycle-overview'] });
      queryClient.invalidateQueries({ queryKey: ['cycle-logs'] });
      queryClient.invalidateQueries({
        queryKey: cycleKeys.log(variables.date),
      });
      queryClient.invalidateQueries({ queryKey: cycleKeys.cycles() });
      queryClient.invalidateQueries({ queryKey: ['cycle-fertility'] });
    },
    meta: { errorMessage: 'Could not save your log.' },
  });
};

export const useDismissPromptMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => cycleService.dismissPrompt(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cycleKeys.settings() });
      queryClient.invalidateQueries({ queryKey: ['cycle-overview'] });
    },
    meta: { errorMessage: 'Could not update.' },
  });
};

export const useCycleInsights = () =>
  useQuery({
    queryKey: cycleKeys.insights(),
    queryFn: () => cycleService.getInsights(),
    meta: { errorMessage: 'Failed to load cycle insights.' },
  });

export const useBulkUpsertDailyLogMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Array<{ date: string; flow_level: string | null }>) =>
      cycleService.bulkPutLogs(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cycle-overview'] });
      queryClient.invalidateQueries({ queryKey: ['cycle-logs'] });
      queryClient.invalidateQueries({ queryKey: ['cycle-log'] });
      queryClient.invalidateQueries({ queryKey: cycleKeys.cycles() });
      queryClient.invalidateQueries({ queryKey: cycleKeys.insights() });
      queryClient.invalidateQueries({ queryKey: ['cycle-fertility'] });
    },
    meta: { errorMessage: 'Could not paint period dates.' },
  });
};

export const useCreateManualCycleMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<SharedCycle>) =>
      cycleService.createManualCycle(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cycle-overview'] });
      queryClient.invalidateQueries({ queryKey: ['cycle-logs'] });
      queryClient.invalidateQueries({ queryKey: ['cycle-log'] });
      queryClient.invalidateQueries({ queryKey: cycleKeys.cycles() });
      queryClient.invalidateQueries({ queryKey: cycleKeys.insights() });
      queryClient.invalidateQueries({ queryKey: ['cycle-fertility'] });
    },
    meta: { errorMessage: 'Could not create manual cycle.' },
  });
};

export const useUpdateCycleMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<SharedCycle> }) =>
      cycleService.updateCycle(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cycle-overview'] });
      queryClient.invalidateQueries({ queryKey: ['cycle-logs'] });
      queryClient.invalidateQueries({ queryKey: ['cycle-log'] });
      queryClient.invalidateQueries({ queryKey: cycleKeys.cycles() });
      queryClient.invalidateQueries({ queryKey: cycleKeys.insights() });
      queryClient.invalidateQueries({ queryKey: ['cycle-fertility'] });
    },
    meta: { errorMessage: 'Could not update cycle.' },
  });
};

export const useDeleteCycleMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cycleService.deleteCycle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cycle-overview'] });
      queryClient.invalidateQueries({ queryKey: ['cycle-logs'] });
      queryClient.invalidateQueries({ queryKey: ['cycle-log'] });
      queryClient.invalidateQueries({ queryKey: cycleKeys.cycles() });
      queryClient.invalidateQueries({ queryKey: cycleKeys.insights() });
      queryClient.invalidateQueries({ queryKey: ['cycle-fertility'] });
    },
    meta: { errorMessage: 'Could not delete cycle.' },
  });
};

export const useFertilityQuery = (date?: string) =>
  useQuery({
    queryKey: cycleKeys.fertility(date),
    queryFn: () => cycleService.getFertility(date),
    meta: { errorMessage: 'Failed to load fertility details.' },
  });

export const useTestEntriesQuery = (start: string, end: string) =>
  useQuery({
    queryKey: cycleKeys.tests(start, end),
    queryFn: () => cycleService.listTestEntries(start, end),
    meta: { errorMessage: 'Failed to load test entries.' },
  });

export const useCreateTestEntry = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Omit<SharedCycleTestEntry, 'id' | 'user_id' | 'tested_at'> & {
        tested_at?: string;
      }
    ) => cycleService.createTestEntry(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cycle-overview'] });
      queryClient.invalidateQueries({ queryKey: ['cycle-fertility'] });
      queryClient.invalidateQueries({ queryKey: ['cycle-tests'] });
      queryClient.invalidateQueries({ queryKey: cycleKeys.cycles() });
      queryClient.invalidateQueries({ queryKey: cycleKeys.insights() });
    },
    meta: { errorMessage: 'Could not log test entry.' },
  });
};

export const useDeleteTestEntry = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cycleService.deleteTestEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cycle-overview'] });
      queryClient.invalidateQueries({ queryKey: ['cycle-fertility'] });
      queryClient.invalidateQueries({ queryKey: ['cycle-tests'] });
      queryClient.invalidateQueries({ queryKey: cycleKeys.cycles() });
      queryClient.invalidateQueries({ queryKey: cycleKeys.insights() });
    },
    meta: { errorMessage: 'Could not delete test entry.' },
  });
};

export const useCycleCorrelations = () =>
  useQuery({
    queryKey: ['cycle-correlations'],
    queryFn: () => cycleService.getCorrelations(),
    meta: { errorMessage: 'Failed to load correlations.' },
  });

export const useCycleExportMutation = () =>
  useMutation({
    mutationFn: () => cycleService.getExport(),
    meta: { errorMessage: 'Could not export your data.' },
  });

export const useDisplayPreferences = (viewGroup: string, platform = 'web') =>
  useQuery({
    queryKey: cycleKeys.displayPreferences(viewGroup, platform),
    queryFn: () => cycleService.getDisplayPreferences(viewGroup, platform),
    meta: { errorMessage: 'Failed to load display preferences.' },
  });

export const useUpsertDisplayPreferencesMutation = (
  viewGroup: string,
  platform = 'web'
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: cycleService.DisplayPreferences) =>
      cycleService.putDisplayPreferences(viewGroup, body, platform),
    onSuccess: (data) => {
      queryClient.setQueryData(
        cycleKeys.displayPreferences(viewGroup, platform),
        data
      );
      queryClient.invalidateQueries({
        queryKey: cycleKeys.displayPreferences(viewGroup, platform),
      });
      queryClient.invalidateQueries({ queryKey: ['cycle-overview'] });
    },
    meta: { errorMessage: 'Could not save display preferences.' },
  });
};

export type {
  FertilityDetails,
  DisplayPreferences,
} from '@/api/Cycle/cycleService';
