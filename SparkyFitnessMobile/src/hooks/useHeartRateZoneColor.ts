import { heartRateZoneColor } from '../utils/heartRateZoneColor';
import { useWatchHeartRateZoneFloors } from './useWatchHeartRateZoneFloors';

/**
 * The zone color for a live reading, from the person's own resolved zones (the
 * query the watch's colors use). Null with no reading or before zones load, so
 * the caller falls back to its default heart-rate color. Zones are only
 * fetched while a reading is showing.
 */
export function useHeartRateZoneColor(bpm: number | null): string | null {
  const floors = useWatchHeartRateZoneFloors(bpm != null);
  return bpm != null && floors != null ? heartRateZoneColor(bpm, floors) : null;
}
