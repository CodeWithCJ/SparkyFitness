import { MIN_BASELINE_NIGHTS } from '@workspace/shared';
import type { SkinTemperatureRow } from '../services/api/skinTemperatureApi';

/** Nights before the wake day that make up the usual temperature. */
export const SKIN_TEMPERATURE_BASELINE_DAYS = 14;

export interface NightSkinTemperature {
  /** The night's skin temperature in °C, when the source reports one. */
  celsius: number | null;
  /** How far the night was from the usual, in °C, when it can be told. */
  deviation: number | null;
}

interface Reading {
  celsius: number | null;
  deviation: number | null;
}

const lastReading = (row: SkinTemperatureRow): Reading | null => {
  for (let i = row.samples.length - 1; i >= 0; i--) {
    const sample = row.samples[i];
    const celsius = sample.celsius ?? sample.temperature_celsius ?? null;
    const deviation = sample.deviation_celsius ?? null;
    if (celsius != null || deviation != null) return { celsius, deviation };
  }
  return null;
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

const round = (value: number): number => Math.round(value * 10) / 10;

/**
 * Skin temperature for the night that ended on `wakeDay`.
 *
 * A source that reports its own deviation (Polar) wins. Otherwise the deviation is
 * the night against the median of the earlier nights from the same source, once
 * there are `MIN_BASELINE_NIGHTS` of them: sources measure at different places, so
 * their absolute values are not comparable.
 */
export const nightSkinTemperature = (
  rows: SkinTemperatureRow[],
  wakeDay: string
): NightSkinTemperature | null => {
  const tonight = rows
    .filter((row) => row.entry_date === wakeDay)
    .map((row) => ({ row, reading: lastReading(row) }))
    .filter(
      (item): item is { row: SkinTemperatureRow; reading: Reading } =>
        item.reading !== null
    );
  if (tonight.length === 0) return null;

  // Prefer a source that gives the most: a deviation, then a temperature.
  const best =
    tonight.find((item) => item.reading.deviation != null) ?? tonight[0];
  const { celsius } = best.reading;
  let deviation = best.reading.deviation;

  if (deviation == null && celsius != null) {
    const earlier = rows
      .filter(
        (row) =>
          row.source_provider === best.row.source_provider &&
          row.entry_date < wakeDay
      )
      .map((row) => lastReading(row)?.celsius)
      .filter((value): value is number => value != null);
    if (earlier.length >= MIN_BASELINE_NIGHTS) {
      deviation = celsius - median(earlier);
    }
  }

  return {
    celsius: celsius != null ? round(celsius) : null,
    deviation: deviation != null ? round(deviation) : null,
  };
};
