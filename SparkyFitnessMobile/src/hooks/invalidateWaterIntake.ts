import type { QueryClient } from '@tanstack/react-query';
import {
  caffeineActiveQueryKey,
  dailySummaryQueryKey,
  waterIntakeLogQueryKey,
} from './queryKeys';

/**
 * Refreshes everything a changed drink touches for one day. Shared by the
 * dashboard's water buttons and the NFC tag path, so neither can forget one.
 */
export function invalidateWaterIntakeQueries(
  queryClient: QueryClient,
  date: string
): void {
  queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(date) });
  // The itemized log backs hydration reminders and the watch's log view.
  queryClient.invalidateQueries({ queryKey: waterIntakeLogQueryKey(date) });
  // A linked container logs a drink that can move the day's caffeine curve.
  queryClient.invalidateQueries({ queryKey: caffeineActiveQueryKey(date) });
}
