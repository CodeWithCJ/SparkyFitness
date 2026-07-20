import { useQuery } from '@tanstack/react-query';
import { getLog, listLogs } from '../services/api/cycleApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { cycleLogQueryKey, cycleLogsRangeQueryKey } from './queryKeys';
import type { SharedCycleDailyLog } from '@workspace/shared';

interface UseCycleLogOptions {
  date: string;
  enabled?: boolean;
}

export function useCycleLog({ date, enabled = true }: UseCycleLogOptions) {
  const query = useQuery<SharedCycleDailyLog | null>({
    queryKey: cycleLogQueryKey(date),
    queryFn: () => getLog(date),
    enabled,
  });

  useRefetchOnFocus(query.refetch, enabled);

  return {
    log: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

interface UseCycleLogsRangeOptions {
  startDate: string;
  endDate: string;
  enabled?: boolean;
}

export function useCycleLogsRange({ startDate, endDate, enabled = true }: UseCycleLogsRangeOptions) {
  const query = useQuery<SharedCycleDailyLog[]>({
    queryKey: cycleLogsRangeQueryKey(startDate, endDate),
    queryFn: () => listLogs(startDate, endDate),
    enabled,
  });

  useRefetchOnFocus(query.refetch, enabled);

  return {
    logs: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
