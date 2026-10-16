import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMeasurementsRange } from '../services/api/measurementsApi';
import { buildMeasurementsReport } from '../utils/measurementsReport';
import type { ReportWindow } from '../utils/trendRange';
import { measurementsRangeQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * The Measurements report: check-in readings (weight, body fat, tape measurements) and
 * steps for a window. Shares `measurementsRangeQueryKey` with the Health Trends weight and
 * steps charts, so a window both have open is one request.
 */
export function useMeasurementsReport({ window }: { window: ReportWindow }) {
  const { startDate, endDate, days } = window;

  const query = useQuery({
    queryKey: measurementsRangeQueryKey(startDate, endDate),
    queryFn: () => fetchMeasurementsRange(startDate, endDate),
  });
  useRefetchOnFocus(query.refetch);

  const report = useMemo(
    () =>
      query.data ? buildMeasurementsReport(query.data, startDate, days) : null,
    [query.data, startDate, days]
  );

  return { report, isLoading: query.isLoading, isError: query.isError };
}
