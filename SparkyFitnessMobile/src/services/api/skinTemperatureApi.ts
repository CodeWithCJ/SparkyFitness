import type { HealthMetricSamples } from '@workspace/shared';
import { apiFetch } from './apiClient';

export type SkinTemperatureRow = Extract<
  HealthMetricSamples,
  { metric: 'skin_temperature' }
>;

/**
 * Fetches the skin temperature samples (one row per day and source) filed between
 * two calendar days, inclusive. Polar and Apple Watch write these.
 */
export const fetchSkinTemperatureRows = async (
  startDate: string,
  endDate: string
): Promise<SkinTemperatureRow[]> => {
  const response = await apiFetch<{ data?: HealthMetricSamples[] }>({
    endpoint: `/api/generic-health/samples?metric=skin_temperature&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    serviceName: 'Skin Temperature API',
    operation: 'fetch skin temperature',
  });
  return (response.data ?? []).filter(
    (row): row is SkinTemperatureRow => row.metric === 'skin_temperature'
  );
};
