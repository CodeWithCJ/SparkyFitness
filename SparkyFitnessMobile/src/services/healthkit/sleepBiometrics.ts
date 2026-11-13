import { queryQuantitySamples } from '@kingstinct/react-native-healthkit';
import { addLog } from '../LogService';
import { loadHealthPreference } from './preferences';
import { toLocalDateString } from '../../utils/dateUtils';
import { withTimeout } from '../../utils/concurrency';
import { getErrorMessage } from '../../utils/errors';
import type { AggregatedSleepSession } from '../../types/healthRecords';

/**
 * Enrichment runs inside the SleepSession metric's own timeout; each optional
 * HRV/RHR read gets its own shorter limit, so a slow read cannot fail the sleep
 * sync or discard the other metric's result. Same bound Health Connect uses.
 */
const SLEEP_BIOMETRICS_TIMEOUT_MS = 15_000;

const HRV_IDENTIFIER = 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN';
const RHR_IDENTIFIER = 'HKQuantityTypeIdentifierRestingHeartRate';
const HRV_PREFERENCE = 'syncHeartRateVariabilityEnabled';
const RHR_PREFERENCE = 'syncRestingHeartRateEnabled';

interface SleepEnrichmentWindow {
  startMs: number;
  endMs: number;
  wakeDay: string;
  asleepMs: number;
}

interface QuantitySample {
  startDate?: string | Date;
  quantity?: number;
}

const sampleInstant = (sample: QuantitySample): number => {
  const start = sample.startDate;
  if (start instanceof Date) return start.getTime();
  if (typeof start === 'string') return Date.parse(start);
  return NaN;
};

const sleepEnrichmentWindow = (
  session: AggregatedSleepSession
): SleepEnrichmentWindow | null => {
  const startMs = Date.parse(session.bedtime);
  const endMs = Date.parse(session.wake_time);
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs ||
    !session.entry_date
  ) {
    return null;
  }
  // Prefer time asleep (deep + light + rem). An in-bed-only night has none, so
  // fall back to the full span — same fallback Health Connect uses when no
  // stage is recognised.
  const asleepSeconds =
    session.time_asleep_in_seconds > 0
      ? session.time_asleep_in_seconds
      : session.duration_in_seconds;
  return {
    startMs,
    endMs,
    wakeDay: session.entry_date,
    asleepMs: Math.max(0, asleepSeconds) * 1000,
  };
};

const isSyncEnabled = async (preferenceKey: string): Promise<boolean> => {
  try {
    return (await loadHealthPreference<boolean>(preferenceKey)) === true;
  } catch {
    return false;
  }
};

/**
 * One optional quantity read. Apple Health does not report whether a read was
 * granted, so the in-app sync toggle is the gate; a denied or failing query
 * comes back empty and must not fail the sleep sync. Any error, including the
 * time limit, yields [] — a truncated window would bias the mean or the latest
 * resting heart rate.
 */
const readOptionalQuantity = async (
  identifier: string,
  enabled: boolean,
  start: Date,
  end: Date,
  unit: string
): Promise<QuantitySample[]> => {
  if (!enabled) {
    addLog(
      `[HealthKitService] Skipping ${identifier} for sleep enrichment: sync disabled`,
      'DEBUG'
    );
    return [];
  }
  try {
    const queryOptions: {
      ascending: boolean;
      limit: number;
      filter: { date: { startDate: Date; endDate: Date } };
      unit?: string;
    } = {
      ascending: false,
      limit: 0,
      unit,
      filter: { date: { startDate: start, endDate: end } },
    };
    const samples = await withTimeout(
      queryQuantitySamples(
        identifier as Parameters<typeof queryQuantitySamples>[0],
        queryOptions
      ),
      SLEEP_BIOMETRICS_TIMEOUT_MS,
      `Sleep enrichment ${identifier} read`
    );
    return Array.isArray(samples) ? (samples as QuantitySample[]) : [];
  } catch (error) {
    addLog(
      `[HealthKitService] Skipping ${identifier} for sleep enrichment: ${getErrorMessage(error)}`,
      'DEBUG'
    );
    return [];
  }
};

const localDayBound = (
  day: string,
  dayDelta: number,
  endOfDay: boolean
): Date => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(
    year,
    month - 1,
    date + dayDelta,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
};

/**
 * Attaches overnight HRV (SDNN mean inside the wake day's longest sleep, 1
 * decimal) and the wake day's latest resting heart rate to every sleep session
 * of that wake day. Failed, empty or switched-off reads leave the fields unset
 * and never fail the sync.
 *
 * Sessions are already aggregated. `entry_date` is the device-local wake day
 * `aggregateSleepSessions` stamped, and resting heart rate is dated the same
 * way so the two cannot drift by a timezone.
 */
export const enrichSleepSessions = async (
  sessions: AggregatedSleepSession[]
): Promise<AggregatedSleepSession[]> => {
  if (sessions.length === 0) return sessions;

  try {
    const windows = sessions.map(sleepEnrichmentWindow);
    const valid = windows.filter((w): w is SleepEnrichmentWindow => w !== null);
    if (valid.length === 0) return sessions;

    const primaryByDay = new Map<string, SleepEnrichmentWindow>();
    for (const w of valid) {
      const current = primaryByDay.get(w.wakeDay);
      if (!current || w.asleepMs > current.asleepMs) {
        primaryByDay.set(w.wakeDay, w);
      }
    }

    const [hrvEnabled, rhrEnabled] = await Promise.all([
      isSyncEnabled(HRV_PREFERENCE),
      isSyncEnabled(RHR_PREFERENCE),
    ]);
    if (!hrvEnabled && !rhrEnabled) return sessions;

    const minStartMs = Math.min(...valid.map((w) => w.startMs));
    const maxEndMs = Math.max(...valid.map((w) => w.endMs));
    const days = [...primaryByDay.keys()].sort();

    const [hrvSamples, rhrSamples] = await Promise.all([
      readOptionalQuantity(
        HRV_IDENTIFIER,
        hrvEnabled,
        new Date(minStartMs),
        new Date(maxEndMs),
        'ms'
      ),
      readOptionalQuantity(
        RHR_IDENTIFIER,
        rhrEnabled,
        localDayBound(days[0], -1, false),
        localDayBound(days[days.length - 1], 1, true),
        'count/min'
      ),
    ]);

    const hrvReadings = hrvSamples.flatMap((sample) => {
      const ms = sampleInstant(sample);
      const value = sample.quantity;
      return Number.isFinite(ms) &&
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value > 0
        ? [{ ms, value }]
        : [];
    });

    const latestRhrByDay = new Map<string, { ms: number; value: number }>();
    for (const sample of rhrSamples) {
      const ms = sampleInstant(sample);
      const value = sample.quantity;
      if (
        !Number.isFinite(ms) ||
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value <= 0
      ) {
        continue;
      }
      const day = toLocalDateString(new Date(ms));
      const current = latestRhrByDay.get(day);
      if (!current || ms > current.ms) latestRhrByDay.set(day, { ms, value });
    }

    const biometricsByDay = new Map<
      string,
      { avg_overnight_hrv?: number; resting_heart_rate?: number }
    >();
    for (const [day, primary] of primaryByDay) {
      const inWindow = hrvReadings.filter(
        (h) => h.ms >= primary.startMs && h.ms <= primary.endMs
      );
      const biometrics: {
        avg_overnight_hrv?: number;
        resting_heart_rate?: number;
      } = {};
      if (inWindow.length > 0) {
        const mean =
          inWindow.reduce((sum, h) => sum + h.value, 0) / inWindow.length;
        biometrics.avg_overnight_hrv = Math.round(mean * 10) / 10;
      }
      const rhr = latestRhrByDay.get(day);
      if (rhr) biometrics.resting_heart_rate = rhr.value;
      if (Object.keys(biometrics).length > 0) {
        biometricsByDay.set(day, biometrics);
      }
    }

    if (biometricsByDay.size === 0) return sessions;

    return sessions.map((session, i) => {
      const w = windows[i];
      const biometrics = w ? biometricsByDay.get(w.wakeDay) : undefined;
      return biometrics ? { ...session, ...biometrics } : session;
    });
  } catch (error) {
    addLog(
      `[HealthKitService] Sleep HRV/RHR enrichment skipped: ${getErrorMessage(error)}`,
      'DEBUG'
    );
    return sessions;
  }
};
