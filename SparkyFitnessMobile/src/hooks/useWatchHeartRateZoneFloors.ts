import { useQuery } from '@tanstack/react-query';
import { fetchHeartRateZones } from '../services/api/heartRateZonesApi';
import { heartRateZonesQueryKey } from './queryKeys';
import { watchHeartRateZoneFloors } from '../utils/watchHeartRateZoneFloors';

/**
 * The zone floors the watch colours heart rate with. Shares the zones query
 * with `useHeartRateZones`, without a second refetch-on-focus.
 */
export function useWatchHeartRateZoneFloors(enabled = true): number[] | null {
  return (
    useQuery({
      queryKey: heartRateZonesQueryKey,
      queryFn: fetchHeartRateZones,
      enabled,
      select: watchHeartRateZoneFloors,
    }).data ?? null
  );
}
