import {
  FALLBACK_MAX_HR,
  HEART_RATE_ZONE_COLORS,
  HR_ZONE_COUNT,
  percentMaxFloors,
} from '@workspace/shared';

/**
 * The charts name four tiers over the person's five zones: zones 1 and 2 are
 * Light, then Moderate, Vigorous and Peak are zones 3, 4 and 5. Everything
 * here starts from the person's own floors (`resolveHeartRateZones`), never a
 * fixed bpm.
 */
/** The three bpm values where Moderate, Vigorous and Peak begin. */
export type TierThresholds = readonly [number, number, number];

/** Zone floors to use when the person's own have not loaded. */
export const fallbackZoneFloors = (): number[] =>
  percentMaxFloors(FALLBACK_MAX_HR);

export function tierThresholds(floors: readonly number[]): TierThresholds {
  const f = floors.length === HR_ZONE_COUNT ? floors : fallbackZoneFloors();
  return [f[2] ?? 0, f[3] ?? 0, f[4] ?? 0];
}

/** 0 Light, 1 Moderate, 2 Vigorous, 3 Peak. */
export function tierForBpm(bpm: number, thresholds: TierThresholds): number {
  let tier = 0;
  thresholds.forEach((floor, i) => {
    if (bpm >= floor) tier = i + 1;
  });
  return tier;
}

/** Seconds in each of the five zones folded into the four tiers. */
export function foldZonesIntoTiers(
  secondsByZone: readonly number[]
): [number, number, number, number] {
  const at = (zone: number) => secondsByZone[zone - 1] ?? 0;
  return [at(1) + at(2), at(3), at(4), at(5)];
}

export interface GradientStop {
  offset: number;
  color: string;
}

/**
 * Stops for a vertical line gradient that colors each height by its tier. The
 * gradient spans the line's own highest and lowest reading, so offsets are
 * measured from that range. A flat line has no height to span; it gets one
 * solid color (a single stop pair at the same color).
 */
export function tierGradientStops(
  minBpm: number,
  maxBpm: number,
  thresholds: TierThresholds
): GradientStop[] {
  const color = (tier: number) =>
    HEART_RATE_ZONE_COLORS[tier] ?? HEART_RATE_ZONE_COLORS[0];
  if (!(maxBpm > minBpm)) {
    const solid = color(tierForBpm(maxBpm, thresholds));
    return [
      { offset: 0, color: solid },
      { offset: 1, color: solid },
    ];
  }
  const span = maxBpm - minBpm;
  const stops: GradientStop[] = [
    { offset: 0, color: color(tierForBpm(maxBpm, thresholds)) },
  ];
  // Walk down from the top: each threshold inside the range is a hard edge
  [...thresholds]
    .map((floor, i) => ({ floor, tier: i + 1 }))
    .reverse()
    .forEach(({ floor, tier }) => {
      if (floor <= minBpm || floor > maxBpm) return;
      const offset = (maxBpm - floor) / span;
      stops.push({ offset, color: color(tier) });
      stops.push({ offset, color: color(tier - 1) });
    });
  stops.push({ offset: 1, color: color(tierForBpm(minBpm, thresholds)) });
  return stops;
}

/**
 * The `stroke` for a line colored by `stops`. A gradient does not paint a path
 * with no height (a flat series), so a single-color result is used directly.
 */
export function zoneStroke(
  stops: readonly GradientStop[],
  gradientId: string
): string {
  const first = stops[0];
  if (!first) return 'none';
  return stops.every((stop) => stop.color === first.color)
    ? first.color
    : `url(#${gradientId})`;
}
