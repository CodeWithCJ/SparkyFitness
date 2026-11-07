import { BLOOD_GLUCOSE_MG_DL_PER_MMOL_L } from '@workspace/shared';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HealthMetricSamplesWriteBody } from '@workspace/shared';
import { postHealthMetricSamples } from '../api/healthSamplesApi';
import { ApiError } from '../api/errors';
import { addLog } from '../LogService';
import { withTimeout } from '../../utils/concurrency';
import { getActiveServerConfig, type ServerConfig } from '../storage';
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
/**
 * How far back a run reads. Without the history permission, Health Connect
 * shows readings from 30 days before the app's first permission grant, and
 * that grant is never in the future, so the last 30 days are always visible.
 * Reaching further could read a week that is silently cut short, and the
 * `merge` sent for it would delete stored readings it no longer shows.
 */
const MAX_DAYS = 30;
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
/**
 * Whether a week read without error but holding no readings is sent as an
 * empty `merge`, which clears what was stored for it (readings deleted on the
 * device). Only Health Connect: it reports a read it is not allowed as an
 * error, while HealthKit hides a denied read as an empty one, so clearing on
 * iOS would let a turned-off permission delete the stored readings.
 */
const CLEARS_EMPTY_WINDOWS = Platform.OS === 'android';

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

/** Normalizes HealthKit/Health Connect glucose while retaining each instant and source app. */
export function glucoseReadingsFromRecords(records: readonly unknown[]) {
  const readings: {
    t: string;
    mmol_l: number;
    source_bundle_id?: string;
  }[] = [];
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const rec = record as {
      time?: unknown;
      startTime?: unknown;
      level?: {
        inMilligramsPerDeciliter?: unknown;
        inMillimolesPerLiter?: unknown;
      };
      sourceBundleId?: unknown;
      metadata?: { dataOrigin?: unknown };
    };
    const ms = toMs(rec.time) ?? toMs(rec.startTime);
    const level = rec.level;
    const value =
      typeof level?.inMillimolesPerLiter === 'number'
        ? level.inMillimolesPerLiter
        : typeof level?.inMilligramsPerDeciliter === 'number'
          ? level.inMilligramsPerDeciliter / BLOOD_GLUCOSE_MG_DL_PER_MMOL_L
          : NaN;
    if (ms === null || !Number.isFinite(value) || value <= 0 || value > 100)
      continue;
    const source =
      typeof rec.sourceBundleId === 'string'
        ? rec.sourceBundleId
        : rec.metadata?.dataOrigin;
    readings.push({
      t: new Date(ms).toISOString(),
      mmol_l: value,
      ...(typeof source === 'string'
        ? { source_bundle_id: source.slice(0, 256) }
        : {}),
    });
  }
  // Native reads are newest first; retain exact times (no glucose averaging).
  return readings.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
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
 * Per account, the span the last fully successful run covered: every window
 * from `from` to `through` was read and uploaded. Both ends are kept so a run
 * over a short range (a `today` sync) cannot make a later, longer range skip
 * the days before it. Best effort: an unreadable value means a full run.
 */
interface HeartRateCoverage {
  from: number;
  through: number;
}

/**
 * 64-bit FNV-1a of a string as hex. Only tells accounts apart in a storage
 * key; it is not a security measure, and a high-entropy credential cannot be
 * recovered from it.
 */
const fingerprint = (value: string): string => {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < value.length; i++) {
    hash ^= BigInt(value.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
};

/**
 * Who a run is for: the server config plus the credential it signs in with.
 * Signing in as someone else on the same server keeps the config id but not
 * the credential, so the two accounts never share an identity.
 */
export const heartRateAccountId = (config: ServerConfig): string => {
  const credential =
    config.authType === 'session' && config.sessionToken
      ? `session:${config.sessionToken}`
      : `key:${config.apiKey}`;
  return `${config.id}:${fingerprint(`${config.url}\n${credential}`)}`;
};

/**
 * Coverage is stored under the account, not the server config, so it is
 * never read for another account, whatever order an account change and its
 * cleanup happen in, and even if the app stops between them.
 */
const coverageKey = (accountId: string): string =>
  `${CURSOR_KEY_PREFIX}:${accountId}`;

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
  config: ServerConfig,
  key: string,
  coverage: HeartRateCoverage,
  cursorPrefix = CURSOR_KEY_PREFIX
): Promise<void> => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(coverage));
    // One record per server config: drop those of the config's earlier
    // accounts (another sign-in, a renewed session) so they do not pile up.
    const configPrefix = `${cursorPrefix}:${config.id}`;
    const stale = (await AsyncStorage.getAllKeys()).filter(
      (k) =>
        k !== key && (k === configPrefix || k.startsWith(`${configPrefix}:`))
    );
    if (stale.length > 0) await AsyncStorage.multiRemove(stale);
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
 * never throws, so it cannot fail the sync it runs beside. A window read
 * without error but holding no readings is sent as an empty `merge`, clearing
 * what was stored for it, where the platform makes that safe
 * (`clearEmptyWindows`, Android only); otherwise it is skipped.
 * A window whose read failed or timed out is skipped too: its records may be
 * partial, and a `merge` would delete the stored readings missing from them.
 *
 * After a first full run, later runs start shortly before the end of the last
 * run that uploaded every window (see `heartRateSyncPlan`), so a sync on each
 * app open does not re-read and re-send the whole range.
 *
 * The run belongs to `account`, the active config when the sync started. Every
 * upload is sent with that config's own credentials, never whichever is active
 * at the time, and the run stops before its next read or upload once a
 * different account is active. So no reading ever goes to another account,
 * however an account change lines up with the run.
 */
async function syncAllDaySamples(
  reader: HeartRateSamplesReader,
  account: ServerConfig,
  start: Date,
  end: Date,
  telemetry: TelemetryRunContext,
  logTag: string,
  stepTimeoutMs: number = STEP_TIMEOUT_MS,
  clearEmptyWindows: boolean = CLEARS_EMPTY_WINDOWS,
  metric: 'heart_rate' | 'blood_glucose' = 'heart_rate'
): Promise<HeartRateSamplesResult> {
  const readingName = metric === 'heart_rate' ? 'heart rate' : 'glucose';
  let samplesUploaded = 0;
  let skippedEmptyGlucoseWindow = false;
  let error: string | undefined;
  const accountId = heartRateAccountId(account);
  const accountChanged = async (): Promise<boolean> => {
    try {
      const active = await getActiveServerConfig();
      return !active || heartRateAccountId(active) !== accountId;
    } catch {
      // Unsure whose data this would be: stop rather than guess.
      return true;
    }
  };
  const stopForAccountChange = () => {
    error = `Account changed; all-day ${readingName} upload stopped`;
    addLog(`${logTag} ${error}`, 'INFO');
  };
  const cursorPrefix =
    metric === 'heart_rate'
      ? CURSOR_KEY_PREFIX
      : `${CURSOR_KEY_PREFIX}:blood_glucose`;
  const key =
    metric === 'heart_rate'
      ? coverageKey(accountId)
      : `${cursorPrefix}:${accountId}`;
  const plan = heartRateSyncPlan(start, end, await readCoverage(key));
  for (const window of heartRateWindows(plan.start, end)) {
    if (await accountChanged()) {
      stopForAccountChange();
      break;
    }
    try {
      const read = await withTimeout(
        reader.readRaw(
          metric === 'heart_rate' ? 'HeartRate' : 'BloodGlucose',
          window.start,
          window.end,
          telemetry
        ),
        stepTimeoutMs,
        `All-day ${readingName} read`
      );
      if (read.error) {
        error = read.error;
        addLog(
          `${logTag} All-day ${readingName} read failed, window not uploaded: ${read.error}`,
          'WARNING'
        );
        continue;
      }
      // A record overlapping the window edge can carry samples outside it,
      // and the server rejects the whole write for one such sample.
      const startMs = window.start.getTime();
      const endMs = window.end.getTime();
      const inWindow = ({ t }: { t: string }) => {
        const ms = Date.parse(t);
        return ms >= startMs && ms <= endMs;
      };
      const common = {
        source: PASSIVE_HEART_RATE_SOURCE,
        device_name: Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect',
        mode: 'merge' as const,
        window: {
          start: window.start.toISOString(),
          end: window.end.toISOString(),
        },
      };
      const body: HealthMetricSamplesWriteBody =
        metric === 'blood_glucose'
          ? {
              ...common,
              metric,
              samples: glucoseReadingsFromRecords(read.records).filter(
                inWindow
              ),
            }
          : {
              ...common,
              metric,
              samples: downsampleHeartRate(
                heartRateReadingsFromRecords(read.records).filter(inWindow),
                window.start
              ),
            };
      const clearing = body.samples.length === 0;
      if (clearing && !clearEmptyWindows) {
        // HealthKit hides denied access as an empty read. Do not certify this
        // glucose window as imported: granting access later must retry history.
        if (metric === 'blood_glucose') skippedEmptyGlucoseWindow = true;
        continue;
      }
      // apiFetch's own timeout stops at the response headers; this bounds the
      // body read too, and aborts the request when it fires, so a stalled
      // response neither holds the phase open nor keeps its connection.
      // The read can take a while; the account may have changed meanwhile.
      if (await accountChanged()) {
        stopForAccountChange();
        break;
      }
      const upload = new AbortController();
      try {
        await withTimeout(
          postHealthMetricSamples(body, upload.signal, account),
          stepTimeoutMs,
          `All-day ${readingName} upload`
        );
      } catch (e) {
        upload.abort();
        // A server from before empty merges were allowed refuses the clear.
        // It cannot clear the week either way, so this is not a failure that
        // should hold back coverage and make every sync read the whole range.
        if (clearing && e instanceof ApiError && e.statusCode === 400) {
          addLog(
            `${logTag} Server cannot clear an emptied ${readingName} week; skipped`,
            'DEBUG'
          );
          continue;
        }
        throw e;
      }
      samplesUploaded += body.samples.length;
    } catch (e) {
      // An ApiError's message quotes the response body, which can echo the
      // readings, and the app log can be shared in a diagnostic report.
      error =
        e instanceof ApiError
          ? `HTTP ${e.statusCode}`
          : e instanceof Error
            ? e.message
            : String(e);
      addLog(
        `${logTag} All-day ${readingName} upload failed: ${error}`,
        'WARNING'
      );
    }
  }
  if (!error && !skippedEmptyGlucoseWindow)
    await writeCoverage(account, key, plan.coverage, cursorPrefix);
  return { samplesUploaded, error };
}

/** Retains the existing heart-rate sync contract and cursor. */
export function syncAllDayHeartRate(
  reader: HeartRateSamplesReader,
  account: ServerConfig,
  start: Date,
  end: Date,
  telemetry: TelemetryRunContext,
  logTag: string,
  stepTimeoutMs: number = STEP_TIMEOUT_MS,
  clearEmptyWindows: boolean = CLEARS_EMPTY_WINDOWS
): Promise<HeartRateSamplesResult> {
  return syncAllDaySamples(
    reader,
    account,
    start,
    end,
    telemetry,
    logTag,
    stepTimeoutMs,
    clearEmptyWindows
  );
}

/** Both platforms share bounded, account-scoped glucose retries and non-destructive empty reads. */
export function syncAllDayGlucose(
  reader: HeartRateSamplesReader,
  account: ServerConfig,
  start: Date,
  end: Date,
  telemetry: TelemetryRunContext,
  logTag: string
): Promise<HeartRateSamplesResult> {
  return syncAllDaySamples(
    reader,
    account,
    start,
    end,
    telemetry,
    logTag,
    STEP_TIMEOUT_MS,
    false,
    'blood_glucose'
  );
}
