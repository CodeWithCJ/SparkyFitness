import { useQuery } from '@tanstack/react-query';

import { fetchSkinTemperatureRows } from '../services/api/skinTemperatureApi';
import { addDays } from '../utils/dateUtils';
import { biometricTrendStart } from '../utils/sleepBiometricTrend';
import {
  nightSkinTemperature,
  SKIN_TEMPERATURE_BASELINE_DAYS,
  type NightSkinTemperature,
} from '../utils/skinTemperature';
import { skinTemperatureQueryKey } from './queryKeys';

/**
 * Skin temperature rows for the trend window ending on `wakeDay`, plus the baseline
 * nights before its first night, so the card's row and its trend chart share one
 * request.
 */
export function useSkinTemperatureRows(wakeDay: string | undefined) {
  const start = wakeDay
    ? addDays(biometricTrendStart(wakeDay), -SKIN_TEMPERATURE_BASELINE_DAYS)
    : '';

  return useQuery({
    queryKey: skinTemperatureQueryKey(start, wakeDay ?? ''),
    queryFn: () => fetchSkinTemperatureRows(start, wakeDay as string),
    enabled: !!wakeDay,
  });
}

/**
 * Skin temperature for the night that ended on `wakeDay`, with how far it was from
 * the usual. Null when no source has reported one; a failed load also reads as
 * null, since the row is a bonus on the Sleep Details screen, not its content.
 */
export function useSkinTemperature(
  wakeDay: string | undefined
): NightSkinTemperature | null {
  const { data } = useSkinTemperatureRows(wakeDay);
  return wakeDay && data ? nightSkinTemperature(data, wakeDay) : null;
}
