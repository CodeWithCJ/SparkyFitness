import { addLog } from '../LogService';
import {
  HKSleepRecord,
  InternalSleepStage,
  SleepRawEvent,
  SleepSessionAccumulator,
  SleepStageType,
  AggregatedSleepSession,
  type TransformedRecord,
} from '../../types/healthRecords';
import { SleepStageEvent } from '../../types/mobileHealthData';
import { toLocalDateString } from '../../utils/dateUtils';

// Re-export for backward compatibility
export { toLocalDateString };

// Overlap-resolution priority. When multiple HealthKit sources cover the same
// wall-clock minute (e.g. an Apple Watch's fine-grained stages under an AutoSleep
// "in bed"/generic-"asleep" envelope), the highest-ranked stage wins that minute.
// The load-bearing ordering is core(3) > awake(2) > asleep_generic(1): a Watch's
// 'awake' must override AutoSleep's generic 'asleep' for the same span.
const SLEEP_STAGE_RANK: Record<InternalSleepStage, number> = {
  deep: 5,
  rem: 4,
  core: 3,
  awake: 2,
  asleep_generic: 1,
  in_bed: 0,
  unknown: -1,
};

// Internal stage -> stored output stage. 'core' and 'asleep_generic' both collapse
// to 'light'; they are only kept distinct internally for the ranking above.
const SLEEP_STAGE_OUTPUT: Record<InternalSleepStage, SleepStageType> = {
  deep: 'deep',
  rem: 'rem',
  core: 'light',
  awake: 'awake',
  asleep_generic: 'light',
  in_bed: 'in_bed',
  unknown: 'unknown',
};

const mapHealthKitSleepStage = (hkStage: string | number): InternalSleepStage => {
  switch (hkStage) {
    case 'HKCategoryValueSleepAnalysisAsleepREM': return 'rem';
    case 'HKCategoryValueSleepAnalysisAsleepDeep': return 'deep';
    case 'HKCategoryValueSleepAnalysisAsleepCore': return 'core';
    case 'HKCategoryValueSleepAnalysisAwake': return 'awake';
    case 'HKCategoryValueSleepAnalysisInBed': return 'in_bed';
    case 'HKCategoryValueSleepAnalysisAsleep': return 'asleep_generic'; // Generic (unspecified) asleep
    // Handle numeric enum values often returned by RN HealthKit
    // (CategoryValueSleepAnalysis: inBed=0, asleepUnspecified=1, awake=2, core=3, deep=4, REM=5)
    case 0: return 'in_bed';         // InBed
    case 1: return 'asleep_generic'; // Asleep (Generic / unspecified)
    case 2: return 'awake';          // Awake
    case 3: return 'core';           // AsleepCore
    case 4: return 'deep';           // AsleepDeep
    case 5: return 'rem';            // AsleepREM
    default:
      addLog(`[HealthKitService] Unknown sleep stage value: ${hkStage}`, 'WARNING');
      return 'unknown';
  }
};

/** A resolved, non-overlapping slice of the sleep timeline. */
interface MergedSleepSegment {
  startMs: number;
  endMs: number;
  stage_type: SleepStageType;
}

/**
 * Sweep-line flatten of possibly-overlapping raw samples into one non-overlapping
 * timeline. For each sub-interval between consecutive boundaries, the highest-ranked
 * covering sample wins; uncovered sub-intervals (gaps) are dropped; adjacent slices
 * with the same OUTPUT stage type are coalesced to avoid sliver spam at cross-source
 * boundaries. N samples/night is small, so O(N^2) boundary scanning is fine.
 */
const flattenSleepEvents = (events: SleepRawEvent[]): MergedSleepSegment[] => {
  if (events.length === 0) return [];

  const boundarySet = new Set<number>();
  for (const ev of events) {
    boundarySet.add(ev.startMs);
    boundarySet.add(ev.endMs);
  }
  const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

  const segments: MergedSleepSegment[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const a = boundaries[i];
    const b = boundaries[i + 1];
    if (b <= a) continue;

    let best: SleepRawEvent | null = null;
    for (const ev of events) {
      if (ev.startMs <= a && ev.endMs >= b && (!best || ev.rank > best.rank)) {
        best = ev;
      }
    }
    if (!best) continue; // gap: no sample covers this sub-interval

    const stageType = SLEEP_STAGE_OUTPUT[best.internalStage];
    const last = segments[segments.length - 1];
    if (last && last.stage_type === stageType && last.endMs === a) {
      last.endMs = b; // coalesce contiguous same-type slice
    } else {
      segments.push({ startMs: a, endMs: b, stage_type: stageType });
    }
  }

  return segments;
};

const finalizeSession = (session: SleepSessionAccumulator): AggregatedSleepSession => {
  const totalDuration = (session.wake_time.getTime() - session.bedtime.getTime()) / 1000;

  const segments = flattenSleepEvents(session.raw_events);
  let deep = 0;
  let light = 0;
  let rem = 0;
  let awake = 0;
  const stage_events: SleepStageEvent[] = segments.map((seg) => {
    const duration = (seg.endMs - seg.startMs) / 1000;
    if (seg.stage_type === 'deep') deep += duration;
    else if (seg.stage_type === 'light') light += duration;
    else if (seg.stage_type === 'rem') rem += duration;
    else if (seg.stage_type === 'awake') awake += duration;
    return {
      stage_type: seg.stage_type,
      start_time: new Date(seg.startMs).toISOString(),
      end_time: new Date(seg.endMs).toISOString(),
      duration_in_seconds: duration,
    };
  });
  // "Time asleep" = deep + light + rem, matching the server's authoritative recompute
  // (sumAsleepSeconds). Excludes awake, in_bed, and unknown so mobile and server never
  // carry two definitions of the same field. The server recomputes from stage_events
  // and discards this value, but keeping them in sync avoids a latent divergence.
  const timeAsleep = deep + light + rem;

  const result: AggregatedSleepSession = {
    type: 'SleepSession',
    source: 'HealthKit',
    timestamp: session.bedtime.toISOString(),
    entry_date: toLocalDateString(session.wake_time),
    bedtime: session.bedtime.toISOString(),
    wake_time: session.wake_time.toISOString(),
    duration_in_seconds: totalDuration,
    time_asleep_in_seconds: timeAsleep,
    deep_sleep_seconds: deep,
    light_sleep_seconds: light,
    rem_sleep_seconds: rem,
    awake_sleep_seconds: awake,
    stage_events,
  };
  if (session.record_timezone) {
    result.record_timezone = session.record_timezone;
  }
  return result;
};

export const aggregateSleepSessions = (records: HKSleepRecord[]): AggregatedSleepSession[] => {
  if (!Array.isArray(records)) return [];

  // Sort records by start time to process them chronologically
  const sortedRecords = [...records].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const aggregatedSessions: AggregatedSleepSession[] = [];
  let currentSession: SleepSessionAccumulator | null = null;

  // Define a threshold for what constitutes a new sleep session (e.g., 4 hours awake)
  const SESSION_GAP_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

  for (const record of sortedRecords) {
    const recordStartTime = new Date(record.startTime);
    const recordEndTime = new Date(record.endTime);

    const stageType = mapHealthKitSleepStage(record.value);
    const recordTz = record.metadata?.HKTimeZone;

    // If no current session or a significant gap, start a new session
    if (!currentSession || (recordStartTime.getTime() - currentSession.wake_time.getTime() > SESSION_GAP_THRESHOLD_MS)) {
      if (currentSession) {
        // Finalize the previous session before starting a new one
        aggregatedSessions.push(finalizeSession(currentSession));
      }
      currentSession = {
        bedtime: recordStartTime,
        wake_time: recordEndTime,
        raw_events: [],
        record_timezone: recordTz,
      };
    } else {
      // Extend current session's wake_time if this record extends it
      if (recordEndTime > currentSession.wake_time) {
        currentSession.wake_time = recordEndTime;
        // Track timezone from the sample that defines wake time
        if (recordTz) {
          currentSession.record_timezone = recordTz;
        }
      }
      // Extend current session's bedtime if this record starts earlier
      if (recordStartTime < currentSession.bedtime) {
        currentSession.bedtime = recordStartTime;
      }
    }

    // Collect the raw sample; overlap resolution across sources happens later in
    // finalizeSession so overlapping wall-clock time is never double-counted.
    currentSession.raw_events.push({
      startMs: recordStartTime.getTime(),
      endMs: recordEndTime.getTime(),
      internalStage: stageType,
      rank: SLEEP_STAGE_RANK[stageType],
    });
  }

  // Push the last session if it exists
  if (currentSession) {
    aggregatedSessions.push(finalizeSession(currentSession));
  }

  return aggregatedSessions;
};

// One HealthKit statistics-collection day bucket (the subset of QueryStatisticsResponse
// the min-max-avg mapper consumes).
export interface DayStatisticsBucket {
  startDate?: Date;
  endDate?: Date;
  minimumQuantity?: { unit: string; quantity: number };
  maximumQuantity?: { unit: string; quantity: number };
  averageQuantity?: { unit: string; quantity: number };
}

/**
 * Maps day-statistics buckets to the exact records aggregateByDay's 'min-max-avg'
 * strategy emits, so metrics converted to native day statistics keep the server payload
 * shape identical. `unit` is the metric's configured OUTPUT unit — not the HealthKit
 * query unit; `toValue` converts a queried value into that unit (e.g. mg/dL → mmol/L)
 * before the 2-decimal rounding.
 */
export const mapDayStatisticsToMinMaxAvg = (
  buckets: readonly DayStatisticsBucket[],
  baseType: string,
  unit: string,
  source: string,
  recordTimezone: string,
  toValue?: (value: number) => number,
): TransformedRecord[] => {
  const records: TransformedRecord[] = [];
  for (const bucket of buckets) {
    if (bucket.startDate == null) continue;
    const date = toLocalDateString(new Date(bucket.startDate));
    const stats = [
      { suffix: 'min', quantity: bucket.minimumQuantity },
      { suffix: 'max', quantity: bucket.maximumQuantity },
      { suffix: 'avg', quantity: bucket.averageQuantity },
    ] as const;
    for (const { suffix, quantity } of stats) {
      if (quantity == null) continue;
      const value = toValue ? toValue(quantity.quantity) : quantity.quantity;
      records.push({
        value: parseFloat(value.toFixed(2)),
        type: `${baseType}_${suffix}`,
        date,
        unit,
        source,
        record_timezone: recordTimezone,
      });
    }
  }
  return records;
};

// Day-level aggregation is platform-neutral and lives in the shared module.
export { aggregateByDay } from '../shared/dataAggregation';
