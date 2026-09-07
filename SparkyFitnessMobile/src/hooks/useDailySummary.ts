import { useQuery } from '@tanstack/react-query';
import {
  buildDailySummary,
  loadDailySummaryRawData,
} from '../services/dailySummaryService';

import { useRefetchOnFocus } from './useRefetchOnFocus';
import { dailySummaryQueryKey } from './queryKeys';

export type { DailySummaryRawData } from '../services/dailySummaryService';

interface UseDailySummaryOptions {
  date: string;
  enabled?: boolean;
}

export function useDailySummary({
  date,
  enabled = true,
}: UseDailySummaryOptions) {
  const query = useQuery({
    queryKey: dailySummaryQueryKey(date),
    queryFn: () => loadDailySummaryRawData(date),
    select: (raw) => buildDailySummary(date, raw),
    enabled,
  });

  useRefetchOnFocus(query.refetch, enabled);

  return {
    summary: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
