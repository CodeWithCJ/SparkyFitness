import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useCustomCategories,
  useCustomMeasurementsByDate,
} from './useCustomMeasurements';
import { fetchGlucoseSamples } from '../services/api/healthSamplesApi';
import { glucoseSamplesQueryKeyRoot } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { addDays } from '../utils/dateUtils';
import type { MeasurementReading } from '@workspace/shared';

export function useMeasurementTimeline(categoryId: string, day: string) {
  const categories = useCustomCategories();
  const raw = categoryId === 'blood_glucose';
  const custom = useCustomMeasurementsByDate(day, {
    enabled: !raw && !!categoryId,
  });
  const glucose = useQuery({
    queryKey: [...glucoseSamplesQueryKeyRoot, day],
    queryFn: () => fetchGlucoseSamples(addDays(day, -1), addDays(day, 1)),
    enabled: raw,
  });
  const data = useMemo<MeasurementReading[]>(() => {
    if (raw)
      return (glucose.data ?? []).flatMap((row) =>
        row.metric === 'blood_glucose'
          ? row.samples.map((sample) => ({
              timestamp: sample.t,
              value: sample.mmol_l,
              source: sample.source_bundle_id
                ? `${row.source_provider} · ${sample.source_bundle_id}`
                : row.source_provider,
            }))
          : []
      );
    // The day endpoint preserves source and timestamp, unlike the legacy range endpoint.
    return (custom.data ?? [])
      .filter(
        (entry) =>
          entry.category_id === categoryId &&
          String(entry.value).trim() !== '' &&
          entry.entry_timestamp
      )
      .map((entry) => ({
        timestamp: entry.entry_timestamp!,
        value: Number(entry.value),
        source: entry.source || 'manual',
      }));
  }, [raw, glucose.data, custom.data, categoryId]);
  useRefetchOnFocus(glucose.refetch, raw);
  useRefetchOnFocus(custom.refetch, !raw && !!categoryId);
  useRefetchOnFocus(categories.refetch);
  return {
    categories,
    readings: {
      data,
      isLoading: raw ? glucose.isLoading : custom.isLoading,
      isError: raw ? glucose.isError : custom.isError,
    },
  };
}
