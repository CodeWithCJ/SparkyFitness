import type { SkinTemperatureRow } from '../services/api/skinTemperatureApi';
import type { SleepEntry } from '../types/sleep';
import { addDays } from './dateUtils';
import { selectMainSleep } from './sleepSessions';
import { nightSkinTemperature } from './skinTemperature';

/** Nights shown in a biometric's trend chart, ending on the night being viewed. */
export const BIOMETRIC_TREND_NIGHTS = 30;

/** Biometrics read straight off the sleep entry. */
export const SLEEP_ENTRY_BIOMETRICS = {
  averageSpo2: 'average_spo2_value',
  lowestSpo2: 'lowest_spo2_value',
  highestSpo2: 'highest_spo2_value',
  restingHeartRate: 'resting_heart_rate',
  overnightHrv: 'avg_overnight_hrv',
} as const satisfies Record<string, keyof SleepEntry>;

export type SleepEntryBiometricKey = keyof typeof SLEEP_ENTRY_BIOMETRICS;
export type SkinTemperatureBiometricKey =
  'skinTemperature' | 'skinTemperatureDeviation';
export type SleepBiometricKey =
  SleepEntryBiometricKey | SkinTemperatureBiometricKey;

export const isSkinTemperatureBiometric = (
  key: SleepBiometricKey
): key is SkinTemperatureBiometricKey =>
  key === 'skinTemperature' || key === 'skinTemperatureDeviation';

// A type alias, not an interface, so it satisfies the chart's record constraint.
export type BiometricTrendPoint = {
  day: string;
  value: number;
};

/** First day of the trend window that ends on `endDay`. */
export const biometricTrendStart = (endDay: string): string =>
  addDays(endDay, -(BIOMETRIC_TREND_NIGHTS - 1));

const trendDays = (endDay: string): string[] =>
  Array.from({ length: BIOMETRIC_TREND_NIGHTS }, (_, i) =>
    addDays(endDay, -(BIOMETRIC_TREND_NIGHTS - 1 - i))
  );

/**
 * One point per night that reported the biometric, from each day's main sleep, so
 * the chart and the Sleep Details card agree on which session was the night.
 */
export const sleepEntryBiometricTrend = (
  entries: SleepEntry[],
  endDay: string,
  key: SleepEntryBiometricKey
): BiometricTrendPoint[] => {
  const field = SLEEP_ENTRY_BIOMETRICS[key];
  const byDay = new Map<string, SleepEntry[]>();
  for (const entry of entries) {
    const list = byDay.get(entry.entry_date);
    if (list) list.push(entry);
    else byDay.set(entry.entry_date, [entry]);
  }

  return trendDays(endDay).flatMap((day) => {
    const value = selectMainSleep(byDay.get(day) ?? [])?.[field];
    return value != null ? [{ day, value }] : [];
  });
};

/**
 * One point per night with a skin temperature (or a deviation that can be told),
 * all from the source of the night being viewed, so one line never mixes a
 * watch's wrist reading with a ring's.
 */
export const skinTemperatureTrend = (
  rows: SkinTemperatureRow[],
  endDay: string,
  key: SkinTemperatureBiometricKey
): BiometricTrendPoint[] => {
  const source = nightSkinTemperature(rows, endDay)?.source;
  if (source == null) return [];
  return trendDays(endDay).flatMap((day) => {
    const night = nightSkinTemperature(rows, day, source);
    const value = key === 'skinTemperature' ? night?.celsius : night?.deviation;
    return value != null ? [{ day, value }] : [];
  });
};
