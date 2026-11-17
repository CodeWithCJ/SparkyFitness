import { useQuery } from '@tanstack/react-query';

import { fetchSleepEntries } from '../services/api/sleepApi';
import {
  biometricTrendStart,
  isSkinTemperatureBiometric,
  skinTemperatureTrend,
  sleepEntryBiometricTrend,
  type BiometricTrendPoint,
  type SleepBiometricKey,
} from '../utils/sleepBiometricTrend';
import { sleepRangeQueryKey } from './queryKeys';
import { useSkinTemperatureRows } from './useSkinTemperature';

/**
 * The trend of one overnight biometric over the nights up to `wakeDay`, for the
 * chart that opens when a row on the Sleep Details card is tapped. Nothing is
 * fetched until a row is open (`key` is null while none is).
 */
export function useSleepBiometricTrend(
  wakeDay: string | undefined,
  key: SleepBiometricKey | null
) {
  const isSkin = key != null && isSkinTemperatureBiometric(key);
  const start = wakeDay ? biometricTrendStart(wakeDay) : '';

  const sleepQuery = useQuery({
    queryKey: sleepRangeQueryKey(start, wakeDay ?? ''),
    queryFn: () => fetchSleepEntries(start, wakeDay as string),
    enabled: !!wakeDay && key != null && !isSkin,
  });
  // Shares its query with the card's skin temperature row, so it is already loaded.
  const skinQuery = useSkinTemperatureRows(wakeDay);

  let points: BiometricTrendPoint[] = [];
  if (wakeDay && key != null) {
    if (isSkinTemperatureBiometric(key)) {
      points = skinTemperatureTrend(skinQuery.data ?? [], wakeDay, key);
    } else {
      points = sleepEntryBiometricTrend(sleepQuery.data ?? [], wakeDay, key);
    }
  }
  const active = isSkin ? skinQuery : sleepQuery;

  return {
    points,
    isLoading: active.isLoading,
    isError: active.isError,
  };
}
