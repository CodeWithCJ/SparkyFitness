import { HEART_RATE_ZONE_COLORS, heartRateZoneFor } from '@workspace/shared';

/**
 * The shared zone color for a heart rate against the person's zone floors
 * (`watchHeartRateZoneFloors`, from their resolved zones). Below zone 1 takes
 * zone 1's color, so a low reading is never uncolored. Never works out a max
 * heart rate itself.
 */
export function heartRateZoneColor(
  bpm: number,
  floors: readonly number[]
): string {
  const zone = Math.max(1, heartRateZoneFor(bpm, floors));
  return HEART_RATE_ZONE_COLORS[
    Math.min(zone, HEART_RATE_ZONE_COLORS.length) - 1
  ];
}
