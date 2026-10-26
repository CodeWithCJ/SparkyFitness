import {
  HEART_RATE_ZONE_COLORS,
  type HeartRateDisplayBand,
} from '@workspace/shared';

/**
 * Charts color a heart rate line by the person's zones: five bands, or four
 * tiers when they chose that. The bands come from `heartRateDisplayBands`
 * over their own zones (`resolveHeartRateZones` on the server), never fixed bpm.
 */

type ColorBand = Pick<HeartRateDisplayBand, 'lowerBpm' | 'color'>;

/** Where the second band onward begin: the bpm values where a line changes color. */
export const zoneEdges = (bands: readonly ColorBand[]): number[] =>
  bands.slice(1).map((band) => band.lowerBpm);

export interface GradientStop {
  offset: number;
  color: string;
}

/**
 * Stops for a vertical line gradient that colors each height by its band. The
 * gradient spans the line's own highest and lowest reading, so offsets are
 * measured from that range. A flat line has no height to span; it gets one
 * solid color (a single stop pair at the same color).
 */
export function zoneGradientStops(
  minBpm: number,
  maxBpm: number,
  bands: readonly ColorBand[]
): GradientStop[] {
  const edges = zoneEdges(bands);
  const color = (index: number) =>
    bands[index]?.color ?? HEART_RATE_ZONE_COLORS[0];
  // Band index for a reading; below the first band draws as the first band
  const indexOf = (bpm: number) => {
    let index = 0;
    edges.forEach((edge, i) => {
      if (bpm >= edge) index = i + 1;
    });
    return index;
  };
  if (!(maxBpm > minBpm)) {
    const solid = color(indexOf(maxBpm));
    return [
      { offset: 0, color: solid },
      { offset: 1, color: solid },
    ];
  }
  const span = maxBpm - minBpm;
  const stops: GradientStop[] = [{ offset: 0, color: color(indexOf(maxBpm)) }];
  // Walk down from the top: each edge inside the range is a hard edge
  edges
    .map((edge, i) => ({ edge, index: i + 1 }))
    .reverse()
    .forEach(({ edge, index }) => {
      if (edge <= minBpm || edge > maxBpm) return;
      const offset = (maxBpm - edge) / span;
      stops.push({ offset, color: color(index) });
      stops.push({ offset, color: color(index - 1) });
    });
  stops.push({ offset: 1, color: color(indexOf(minBpm)) });
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
