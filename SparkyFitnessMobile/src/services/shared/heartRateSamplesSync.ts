import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HealthMetricSamplesWriteBody } from '@workspace/shared';
import { postHealthMetricSamples } from '../api/healthSamplesApi';
import { ApiError } from '../api/errors';
import { addLog } from '../LogService';
import { withTimeout } from '../../utils/concurrency';
import { getActiveServerConfigId } from '../storage';
import type { TelemetryRunContext } from './telemetryBudget';
import type { ReadResult } from '../../types/healthRecords';

/**
 * Source the all-day readings are stored under. The server refuses the names
 * it uses for its own integrations and for workouts ('HealthKit', 'Health
 * Connect', 'manual', ...), so a passive write can never replace those rows.
 */
export const PASSIVE_HEART_RATE_SOURCE = 'SparkyFitness Mobile';

/** One reading per minute is plenty for a day chart and keeps a week small. */
const BUCKET_MS = 60_000;
/** Read, downsample and upload a week at a time so memory stays bounded. */
const CHUNK_DAYS = 7;
/** The server accepts at most 31 days in one window; the app never reaches that far back here. */
const MAX_DAYS = 31;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_BPM = 20;
const MAX_BPM = 260;
/**
 * How far behind the last fully uploaded instant each run starts again. Health
 * apps can add readings late (a watch that syncs to the phone hours after it
 * measured), and a `merge` over the overlap replaces it, so nothing doubles.
 */
const RESEND_OVERLAP_MS = 2 * DAY_MS;
const CURSOR_KEY_PREFIX = '@SparkyFitness/heartRateSamplesThrough';
/**
 * Deadline for each window's read and for its upload (one week of minute
 * readings is a small body). Same as one metric read, so a stalled query or
 * response cannot hold the phase open.
 */
const STEP_TIMEOUT_MS = 60_000;

export interface HeartRateReading {
  /** ISO instant */
  t: string;
  bpm: number;
}

interface RawHeartRateRecord {
  startTime?: unknown;
  time?: unknown;
  samples?: unknown;
}

const toMs = (value: unknown): number | null => {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/**
 * Flattens raw `HeartRate` records of both platforms into readings. HealthKit
 * gives one reading per record (its sample time is the record's start);
 * Health Connect gives records holding many `{ time, beatsPerMinute }` samples.
 * Anything without a believable time or rate is dropped.
 */
export function heartRateReadingsFromRecords(
  records: readonly unknown[]
): HeartRateReading[] {
  const readings: HeartRateReading[] = [];
  for (const record of records) {
    const rec = record as RawHeartRateRecord;
    if (!Array.isArray(rec?.samples)) continue;
    const recordTime = toMs(rec.startTime) ?? toMs(rec.time);
    for (const sample of rec.samples as {
      time?: unknown;
      beatsPerMinute?: unknown;
    }[]) {
      const bpm = sample?.beatsPerMinute;
      if (typeof bpm !== 'number' || bpm < MIN_BPM || bpm > MAX_BPM) continue;
      const ms = toMs(sample.time) ?? recordTime;
      if (ms === null) continue;
      readings.push({ t: new Date(ms).toISOString(), bpm });
    }
  }
  return readings;
}

/**
 * Mean of each minute's readings, in time order, stamped at the minute's start.
 * With `notBefore`, a minute that starts earlier (the first, partial minute of
 * a window that is not minute-aligned) is stamped at `notBefore` instead.
 */
export function downsampleHeartRate(
  readings: readonly HeartRateReading[],
  notBefore?: Date
): HeartRateReading[] {
  const floorMs = notBefore?.getTime() ?? -Infinity;
  const buckets = new Map<number, { sum: number; count: number }>();
  for (const { t, bpm } of readings) {
    const bucket = Math.floor(new Date(t).getTime() / BUCKET_MS);
    const acc = buckets.get(bucket) ?? { sum: 0, count: 0 };
    acc.sum += bpm;
    acc.count += 1;
    buckets.set(bucket, acc);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bucket, acc]) => ({
      t: new Date(Math.max(bucket * BUCKET_MS, floorMs)).toISOString(),
      bpm: Math.round((acc.sum / acc.count) * 10) / 10,
    }));
}

/** Back-to-back windows of at most `CHUNK_DAYS`, oldest first, limited to `MAX_DAYS` before `end`. */
export function heartRateWindows(
  start: Date,
  end: Date
): { start: Date; end: Date }[] {
  const from = Math.max(start.getTime(), end.getTime() - MAX_DAYS * DAY_MS);
  const windows: { start: Date; end: Date }[] = [];
  for (let s = from; s < end.getTime(); s += CHUNK_DAYS * DAY_MS) {
    windows.push({
      start: new Date(s),
      end: new Date(Math.min(s + CHUNK_DAYS * DAY_MS, end.getTime())),
    });
  }
  return windows;
}

/**
 * Per server, the span the last fully successful run covered: every window
 * from `from` to `through` was read and uploaded. Both ends are kept so a run
 * over a short range (a `today` sync) cannot make a later, longer range skip
 * the days before it. Kept per server so switching accounts never skips
 * another account's range. Best effort: an unreadable value means a full run.
 */
interface HeartRateCoverage {
  from: number;
  through: number;
}

const cursorKey = async (): Promise<string> =>
  `${CURSOR_KEY_PREFIX}:${(await getActiveServerConfigId().catch(() => null)) ?? 'none'}`;

/**
 * Bumped on every account change. A run remembers the value it started with
 * and stops before its next read or upload once it differs, so weeks left in a
 * run never go to, or are recorded for, the account switched to.
 */
let accountGeneration = 0;
/** The upload in flight, so an account change can cancel it. */
let activeUpload: AbortController | null = null;

/**
 * Called when the signed-in account changes (`useAuth`'s identity-change
 * handler). Stops a running phase and forgets every stored coverage: a session
 * replaced on the same server config keeps that config's id, so a coverage
 * kept for it would otherwise let the next account skip its own older days.
 */
export async function resetAllDayHeartRateForAccountChange(): Promise<void> {
  accountGeneration += 1;
  activeUpload?.abort();
  activeUpload = null;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const stored = keys.filter((key) =>
      key.startsWith(`${CURSOR_KEY_PREFIX}:`)
    );
    if (stored.length > 0) await AsyncStorage.multiRemove(stored);
  } catch (e) {
    addLog(
      `All-day heart rate coverage was not cleared on the account change: ${e instanceof Error ? e.message : String(e)}`,
      'WARNING'
    );
  }
}

const readCoverage = async (key: string): Promise<HeartRateCoverage | null> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'from' in parsed &&
      'through' in parsed &&
      Number.isFinite(parsed.from) &&
      Number.isFinite(parsed.through)
    ) {
      return { from: Number(parsed.from), through: Number(parsed.through) };
    }
    return null;
  } catch {
    return null;
  }
};

const writeCoverage = async (
  key: string,
  coverage: HeartRateCoverage
): Promise<void> => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(coverage));
  } catch {
    // Best effort: the next run just reads further back.
  }
};

/**
 * Where a run should start, and the span it will have covered if every window
 * succeeds. The range is the caller's, limited to `MAX_DAYS` before `end`. A
 * stored coverage shortens it only when it already reaches back to the range
 * start; the run then starts `RESEND_OVERLAP_MS` before where that coverage
 * ended, and the new coverage keeps its old start. A coverage that ends in
 * the future (clock change) is ignored.
 */
export function heartRateSyncPlan(
  rangeStart: Date,
  end: Date,
  coverage: HeartRateCoverage | null
): { start: Date; coverage: HeartRateCoverage } {
  const from = Math.max(
    rangeStart.getTime(),
    end.getTime() - MAX_DAYS * DAY_MS
  );
  if (
    coverage === null ||
    coverage.through > end.getTime() ||
    coverage.from > from
  ) {
    return {
      start: new Date(from),
      coverage: { from, through: end.getTime() },
    };
  }
  return {
    start: new Date(Math.max(from, coverage.through - RESEND_OVERLAP_MS)),
    coverage: { from: coverage.from, through: end.getTime() },
  };
}

export interface HeartRateSamplesReader {
  readRaw(
    recordType: string,
    startDate: Date,
    endDate: Date,
    telemetry?: TelemetryRunContext
  ): Promise<ReadResult>;
}

export interface HeartRateSamplesResult {
  samplesUploaded: number;
  /** Set when any window failed to read or upload; the rest still went up. */
  error?: string;
}

/**
 * Reads the all-day heart rate of a window and stores it on the server, a week
 * at a time. Best effort: a failed read or upload is reported and logged but
 * never throws, so it cannot fail the sync it runs beside. A window with no
 * readings is skipped rather than sent, since the server needs at least one.
 * A window whose read failed or timed out is skipped too: its records may be
 * partial, and a `merge` would delete the stored readings missing from them.
 *
 * After a first full run, later runs start shortly before the end of the last
 * run that uploaded every window (see `heartRateSyncPlan`), so a sync on each
 * app open does not re-read and re-send the whole range.
 */
export async function syncAllDayHeartRate(
  reader: HeartRateSamplesReader,
  start: Date,
  end: Date,
  telemetry: TelemetryRunContext,
  logTag: string,
  stepTimeoutMs: number = STEP_TIMEOUT_MS
): Promise<HeartRateSamplesResult> {
  let samplesUploaded = 0;
  let error: string | undefined;
  const generation = accountGeneration;
  const accountChanged = () => generation !== accountGeneration;
  const stopForAccountChange = () => {
    error = 'Account changed; all-day heart rate upload stopped';
    addLog(`${logTag} ${error}`, 'INFO');
  };
  const key = await cursorKey();
  const plan = heartRateSyncPlan(start, end, await readCoverage(key));
  for (const window of heartRateWindows(plan.start, end)) {
    if (accountChanged()) {
      stopForAccountChange();
      break;
    }
    try {
      const read = await withTimeout(
        reader.readRaw('HeartRate', window.start, window.end, telemetry),
        stepTimeoutMs,
        'All-day heart rate read'
      );
      if (read.error) {
        error = read.error;
        addLog(
          `${logTag} All-day heart rate read failed, window not uploaded: ${read.error}`,
          'WARNING'
        );
        continue;
      }
      // A record overlapping the window edge can carry samples outside it,
      // and the server rejects the whole write for one such sample.
      const startMs = window.start.getTime();
      const endMs = window.end.getTime();
      const samples = downsampleHeartRate(
        heartRateReadingsFromRecords(read.records).filter(({ t }) => {
          const ms = new Date(t).getTime();
          return ms >= startMs && ms <= endMs;
        }),
        window.start
      );
      if (samples.length === 0) continue;
      const body: HealthMetricSamplesWriteBody = {
        metric: 'heart_rate',
        source: PASSIVE_HEART_RATE_SOURCE,
        device_name: Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect',
        mode: 'merge',
        window: {
          start: window.start.toISOString(),
          end: window.end.toISOString(),
        },
        samples: samples.map(({ t, bpm }) => ({ t, bpm })),
      };
      // apiFetch's own timeout stops at the response headers; this bounds the
      // body read too, and aborts the request when it fires, so a stalled
      // response neither holds the phase open nor keeps its connection.
      // The read can take a while; the account may have changed meanwhile.
      if (accountChanged()) {
        stopForAccountChange();
        break;
      }
      const upload = new AbortController();
      activeUpload = upload;
      try {
        await withTimeout(
          postHealthMetricSamples(body, upload.signal),
          stepTimeoutMs,
          'All-day heart rate upload'
        );
      } catch (e) {
        upload.abort();
        throw e;
      } finally {
        if (activeUpload === upload) activeUpload = null;
      }
      samplesUploaded += samples.length;
    } catch (e) {
      // An ApiError's message quotes the response body, which can echo the
      // readings, and the app log can be shared in a diagnostic report.
      error =
        e instanceof ApiError
          ? `HTTP ${e.statusCode}`
          : e instanceof Error
            ? e.message
            : String(e);
      addLog(`${logTag} All-day heart rate upload failed: ${error}`, 'WARNING');
    }
  }
  if (!error && !accountChanged()) await writeCoverage(key, plan.coverage);
  return { samplesUploaded, error };
}
