import { MIN_BASELINE_NIGHTS } from '@workspace/shared';
import type { SkinTemperatureRow } from '../services/api/skinTemperatureApi';
import { addDays } from './dateUtils';

/** Nights before the wake day that make up the usual temperature. */
export const SKIN_TEMPERATURE_BASELINE_DAYS = 14;

/**
 * Where a night's reading came from: the source and, when it says so, the place
 * it was taken. Apple's wrist temperature and an overnight Body Temperature mean
 * are both `healthkit`, and they are not comparable.
 */
export type SkinTemperatureSource = string;

export interface NightSkinTemperature {
  /** The night's skin temperature in °C, when the source reports one. */
  celsius: number | null;
  /** How far the night was from the usual, in °C, when it can be told. */
  deviation: number | null;
  /** The source the values came from, to keep a trend on the same one. */
  source: SkinTemperatureSource;
}

interface Reading {
  celsius: number | null;
  deviation: number | null;
  source: SkinTemperatureSource;
}

const sourceKey = (provider: string, site: string | undefined) =>
  site ? `${provider}:${site}` : provider;

/** The latest reading of each source (provider and site) in a day's row. */
const readingsOf = (row: SkinTemperatureRow): Reading[] => {
  const latest = new Map<SkinTemperatureSource, Reading>();
  for (const sample of row.samples) {
    const celsius = sample.celsius ?? sample.temperature_celsius ?? null;
    const deviation = sample.deviation_celsius ?? null;
    if (celsius == null && deviation == null) continue;
    const source = sourceKey(row.source_provider, sample.site);
    // Samples are in time order, so a later one replaces an earlier one.
    latest.set(source, { celsius, deviation, source });
  }
  return [...latest.values()];
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

/**
 * Skin temperature for the night that ended on `wakeDay`, unrounded: callers
 * convert the unit first and round for display after.
 *
 * A source that reports its own deviation (Polar) wins. Otherwise the deviation is
 * the night against the median of the earlier nights from the same source and
 * site, once there are `MIN_BASELINE_NIGHTS` of them in the
 * `SKIN_TEMPERATURE_BASELINE_DAYS` before it: sources and sites measure in
 * different places, so their absolute values are not comparable. Pass `source` to
 * read only that one (a trend stays on the source of the night it belongs to).
 */
export const nightSkinTemperature = (
  rows: SkinTemperatureRow[],
  wakeDay: string,
  source?: SkinTemperatureSource
): NightSkinTemperature | null => {
  const tonight = rows
    .filter((row) => row.entry_date === wakeDay)
    .flatMap(readingsOf)
    .filter((reading) => source == null || reading.source === source);
  if (tonight.length === 0) return null;

  // Prefer a source that gives the most: a deviation, then a temperature.
  const best =
    tonight.find((reading) => reading.deviation != null) ?? tonight[0];
  const { celsius } = best;
  let deviation = best.deviation;

  if (deviation == null && celsius != null) {
    const baselineStart = addDays(wakeDay, -SKIN_TEMPERATURE_BASELINE_DAYS);
    const earlier = rows
      .filter(
        (row) => row.entry_date >= baselineStart && row.entry_date < wakeDay
      )
      .flatMap(readingsOf)
      .filter((reading) => reading.source === best.source)
      .map((reading) => reading.celsius)
      .filter((value): value is number => value != null);
    if (earlier.length >= MIN_BASELINE_NIGHTS) {
      deviation = celsius - median(earlier);
    }
  }

  return { celsius, deviation, source: best.source };
};
