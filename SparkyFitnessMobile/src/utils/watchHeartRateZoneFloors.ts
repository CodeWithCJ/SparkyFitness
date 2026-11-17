import type { HeartRateZonesResponse } from '@workspace/shared';

/**
 * The five zone floors (lowest bpm of zones 1 to 5, ascending) the watch
 * colours the live heart rate with. They come straight from the person's
 * resolved zones, so the watch never works out a max heart rate of its own.
 * Null until zones are known.
 */
export function watchHeartRateZoneFloors(
  zones: HeartRateZonesResponse | undefined
): number[] | null {
  const floors = zones?.resolved.zones.map((zone) => zone.lower_bpm);
  if (!floors?.length || floors.some((floor) => !Number.isFinite(floor))) {
    return null;
  }
  return floors;
}
