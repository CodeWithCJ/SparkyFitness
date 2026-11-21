/**
 * ZeppBridge data processor. Maps the records ZeppBridge returns (sleep
 * sessions, workouts, daily metrics, metric samples) onto the repositories the
 * Oura, Intervals.icu and Garmin processors use, so nothing here owns its own
 * tables. Re-syncing a range is safe: every write updates in place.
 */
import { log } from '../../config/logging.js';
import exerciseRepository from '../../models/exercise.js';
import exerciseEntryRepository from '../../models/exerciseEntry.js';
import * as genericHealthRepo from '../../models/genericHealthRepository.js';
import sleepRepository from '../../models/sleepRepository.js';
import measurementService from '../../services/measurementService.js';
import { upsertSamplesByDay } from '../../services/healthMetricSampleWriter.js';
import {
  instantHourMinute,
  instantHourMinuteWithOffset,
  instantToDay,
  instantToDayWithOffset,
  isDayString,
  localDateTimeToUtc,
  mapRawSportValue,
  utcOffsetMinutesFromIsoString,
} from '@workspace/shared';
import {
  applySummaryLaps,
  needsWorkoutDetail,
  type ZeppBridgeDetailCandidate,
} from './zeppBridgeWorkoutDetail.js';
import type {
  ZeppBridgeDailyMetric,
  ZeppBridgeMetricSample,
  ZeppBridgeRecordSet,
  ZeppBridgeSleepSession,
  ZeppBridgeWorkout,
} from './zeppBridgeTypes.js';

/** `sleep_entries.source` and `exercise_entries.source`. */
export const ZEPPBRIDGE_SOURCE = 'ZeppBridge';
/** `source_provider` of daily_health_metrics and health_metric_samples rows. */
export const ZEPPBRIDGE_PROVIDER = 'zeppbridge';

export interface ZeppBridgeProcessResult {
  sleepImported: number;
  workoutsImported: number;
  workoutsFailed: number;
  sleepFailed: number;
  metricDays: number;
  /** Workouts still missing their route or heart rate series. */
  detailCandidates: ZeppBridgeDetailCandidate[];
}

const round = (value: number | null | undefined, decimals = 0) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 10 ** decimals) / 10 ** decimals
    : null;

const finite = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Day and clock time of an instant. ZeppBridge writes every time as UTC
 * (`+00:00`), which says nothing about where the record was made, so a zero or
 * missing offset means the person's own zone. Only a real non-zero offset is
 * taken as the zone the record was made in.
 */
function localParts(iso: string, timezone: string) {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return null;
  const parsed = utcOffsetMinutesFromIsoString(iso);
  const offset = parsed === 0 ? null : parsed;
  const day =
    offset === null
      ? instantToDay(time, timezone)
      : instantToDayWithOffset(time, offset);
  const { hour, minute } =
    offset === null
      ? instantHourMinute(time, timezone)
      : instantHourMinuteWithOffset(time, offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { day, clock: `${pad(hour)}:${pad(minute)}`, offset, time };
}

// ---------------------------------------------------------------------------
// Sleep
// ---------------------------------------------------------------------------

const STAGE_TYPES: Record<string, string> = {
  deep: 'deep',
  light: 'light',
  rem: 'rem',
  awake: 'awake',
  wake: 'awake',
};

function sleepStages(session: ZeppBridgeSleepSession) {
  return (session.stages ?? []).flatMap((stage) => {
    const type = STAGE_TYPES[(stage.stage ?? '').trim().toLowerCase()];
    const start = new Date(stage.start_time);
    const end = new Date(stage.end_time);
    if (!type || Number.isNaN(+start) || Number.isNaN(+end) || end <= start) {
      return [];
    }
    return [
      {
        stage_type: type,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        duration_in_seconds: Math.round((+end - +start) / 1000),
      },
    ];
  });
}

const minutesToSeconds = (minutes: number | null | undefined) =>
  typeof minutes === 'number' && Number.isFinite(minutes) && minutes >= 0
    ? Math.round(minutes * 60)
    : null;

async function processSleepSession(
  userId: string,
  createdByUserId: string,
  session: ZeppBridgeSleepSession,
  timezone: string
): Promise<boolean> {
  const wake = localParts(session.end_time, timezone);
  const bed = new Date(session.start_time);
  if (!wake || Number.isNaN(bed.getTime()) || wake.time <= bed) return false;

  const deep = minutesToSeconds(session.deep_minutes);
  const light = minutesToSeconds(session.light_minutes);
  const rem = minutesToSeconds(session.rem_minutes);
  const awake = minutesToSeconds(session.awake_minutes);
  const inBed = Math.round((+wake.time - +bed) / 1000);
  const stagedAsleep =
    deep !== null || light !== null || rem !== null
      ? (deep ?? 0) + (light ?? 0) + (rem ?? 0)
      : null;

  const entry = await sleepRepository.upsertSleepEntry(
    userId,
    createdByUserId,
    {
      entry_date: wake.day,
      bedtime: bed.toISOString(),
      wake_time: wake.time.toISOString(),
      record_utc_offset_minutes: wake.offset,
      duration_in_seconds: inBed,
      time_asleep_in_seconds:
        stagedAsleep ??
        minutesToSeconds(session.duration_minutes) ??
        (awake !== null ? Math.max(inBed - awake, 0) : null),
      sleep_score: round(session.score),
      source: ZEPPBRIDGE_SOURCE,
      deep_sleep_seconds: deep,
      light_sleep_seconds: light,
      rem_sleep_seconds: rem,
      awake_sleep_seconds: awake,
      awake_count: round(session.wake_count),
    }
  );
  // Replaced as one set inside a transaction: stages a re-sync no longer reports
  // for this window are removed, not left next to the new ones. With no stages
  // (a summary-only night) nothing is written and earlier stages are kept.
  await sleepRepository.mergeSleepStageEvents(
    userId,
    entry.id,
    sleepStages(session),
    createdByUserId
  );
  return true;
}

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

const SPORT_NAMES: Record<string, string> = {
  running: 'Running',
  cycling: 'Cycling',
  walking: 'Walking',
  hiking: 'Hiking',
  swimming: 'Swimming',
  rowing: 'Rowing',
  strength: 'Strength Training',
};

/**
 * Library name for a ZeppBridge workout type (`outdoor_running`, ...): the plain
 * activity name for the sports SparkyFitness knows, otherwise the type itself in
 * title case. ZeppBridge gives no title of its own, and the source is recorded
 * on the entry, so the name carries no provider prefix.
 */
function exerciseNameFor(type: string): string {
  const known = SPORT_NAMES[mapRawSportValue(type)];
  if (known) return known;
  const words = type
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase());
  return words.join(' ') || 'Workout';
}

/** Library category for a ZeppBridge workout type (`outdoor_running`, ...). */
function categoryFor(type: string): 'Cardio' | 'Strength' | 'Other' {
  const sport = mapRawSportValue(type);
  if (sport === 'strength') return 'Strength';
  return sport === 'other' ? 'Other' : 'Cardio';
}

/** `value` when it lies in the column's range, otherwise null (left out). */
const within = (value: number | null, min: number, max: number) =>
  value !== null && value >= min && value <= max ? value : null;

function workoutTelemetry(workout: ZeppBridgeWorkout, elapsedSeconds: number) {
  const maxHr = round(workout.max_hr);
  const effort = round(workout.rpe);
  return {
    // Training effect is a 0-5 score (numeric(3,1)); VO2 max numeric(4,1).
    aerobic_training_effect: within(round(workout.training_effect, 1), 0, 5),
    anaerobic_training_effect: within(
      round(workout.anaerobic_training_effect, 1),
      0,
      5
    ),
    vo2_max_estimate: within(round(workout.vo2max, 1), 10, 100),
    // The column only accepts a whole 1-10 rating.
    workout_effort: within(effort, 1, 10),
    max_cadence: round(workout.max_cadence_spm),
    steps: within(round(workout.total_steps), 0, 2_000_000),
    // The column only accepts 100-250 bpm; anything else would reject the entry.
    max_heart_rate:
      maxHr !== null && maxHr >= 100 && maxHr <= 250 ? maxHr : null,
    avg_cadence: round(workout.avg_cadence_spm),
    stride_length_cm: round(workout.avg_stride_cm, 1),
    training_load: finite(workout.training_load),
    elevation_gain_meters: finite(workout.elevation_gain_m),
    elevation_loss_meters: finite(workout.elevation_loss_m),
    min_elevation_meters: finite(workout.min_altitude_m),
    max_elevation_meters: finite(workout.max_altitude_m),
    moving_time_seconds: round(workout.moving_seconds),
    elapsed_time_seconds: elapsedSeconds > 0 ? elapsedSeconds : null,
  };
}

/** The entry a workout was stored on, or null when it could not be stored. */
async function processWorkout(
  userId: string,
  createdByUserId: string,
  workout: ZeppBridgeWorkout,
  timezone: string
): Promise<{ entryId: string | null } | null> {
  const start = localParts(workout.start_time, timezone);
  if (!start) return null;
  const end = workout.end_time ? new Date(workout.end_time) : null;
  const elapsedSeconds =
    end && !Number.isNaN(end.getTime())
      ? Math.max(Math.round((+end - +start.time) / 1000), 0)
      : 0;
  const type =
    workout.effective_type ||
    workout.normalized_type ||
    workout.workout_type ||
    'workout';
  const name = exerciseNameFor(type);

  let exercise = await exerciseRepository.findExerciseByNameAndUserId(
    name,
    userId
  );
  if (!exercise) {
    exercise = await exerciseRepository.createExercise({
      user_id: userId,
      name,
      category: categoryFor(type),
      source: ZEPPBRIDGE_SOURCE,
      is_custom: true,
      shared_with_public: false,
    });
  }
  const durationSeconds = finite(workout.moving_seconds) ?? elapsedSeconds;
  const distanceMeters = finite(workout.distance_meters);
  // Measurements ZeppBridge has no value for are left out, not sent as null: an
  // update overlays what it is given on the stored row, so a null would blank a
  // value an earlier sync or the heart rate series stored (and calories_burned
  // is NOT NULL, so a null fails the update outright). A create defaults them.
  const measured = Object.fromEntries(
    Object.entries({
      calories_burned: finite(workout.calories),
      distance:
        distanceMeters === null
          ? null
          : parseFloat((distanceMeters / 1000).toFixed(2)),
      avg_heart_rate: round(workout.avg_hr),
      ...workoutTelemetry(workout, elapsedSeconds),
    }).filter(([, value]) => value !== null && value !== undefined)
  );
  const entry = await exerciseEntryRepository.createExerciseEntry(
    userId,
    {
      exercise_id: exercise.id,
      entry_date: start.day,
      entry_time: start.clock,
      duration_minutes: Math.round(durationSeconds / 60),
      ...measured,
      // shared activitySport parses "Type: X." back out of the notes.
      notes: `Synced from ZeppBridge. Type: ${type}.`,
      source_id: String(workout.workout_id),
      // No sets, like the other cardio imports.
      sets: [],
    },
    createdByUserId,
    ZEPPBRIDGE_SOURCE,
    null,
    {
      activityDetail: {
        provider_name: ZEPPBRIDGE_SOURCE,
        detail_type: 'full_activity_data',
        detail_data: workout,
        created_by_user_id: createdByUserId,
        updated_by_user_id: createdByUserId,
      },
    }
  );
  const entryId: string | null = entry?.id ?? null;
  // A workout with no route never gets laps from the detail pass, so its
  // summary laps are stored here. They replace by lap index, so a re-sync is
  // safe, and a failure here does not fail the workout.
  if (entryId && (workout.route_point_count ?? 0) < 2) {
    try {
      await applySummaryLaps(userId, createdByUserId, entryId, workout);
    } catch (error) {
      log(
        'warn',
        `[zeppBridgeDataProcessor] Could not store the laps of workout ${String(workout.workout_id)}: ${errorMessage(error)}`
      );
    }
  }
  return { entryId };
}

// ---------------------------------------------------------------------------
// Daily metrics and samples
// ---------------------------------------------------------------------------

/** ZeppBridge metric -> check-in type (kg, %, count). */
const CHECK_IN_METRICS: Record<string, { type: string; unit: string }> = {
  weight: { type: 'weight', unit: 'kg' },
  body_fat_rate: { type: 'body_fat_percentage', unit: '%' },
  steps: { type: 'steps', unit: 'count' },
  muscle_mass: { type: 'muscle_mass_kg', unit: 'kg' },
  bone_mass: { type: 'bone_mass_kg', unit: 'kg' },
  body_water_rate: { type: 'body_water_percentage', unit: '%' },
};

interface DailyFields {
  total_distance_meters?: number | null;
  active_calories?: number | null;
  bmr_calories?: number | null;
  resting_heart_rate?: number | null;
  vo2_max?: number | null;
  lactate_threshold_bpm?: number | null;
  avg_stress_level?: number | null;
}

/** Writes one metric's value into the day's `daily_health_metrics` fields. */
function applyDailyField(
  fields: DailyFields,
  metric: ZeppBridgeDailyMetric
): void {
  const { value } = metric;
  switch (metric.metric) {
    case 'distance':
      // Meters unless ZeppBridge says otherwise.
      fields.total_distance_meters = round(
        metric.unit?.toLowerCase() === 'km' ? value * 1000 : value
      );
      break;
    case 'active_calories':
      fields.active_calories = round(value);
      break;
    case 'bmr':
      fields.bmr_calories = round(value);
      break;
    case 'resting_hr':
      fields.resting_heart_rate = round(value);
      break;
    case 'vo2max':
      fields.vo2_max = round(value, 1);
      break;
    case 'lactate_threshold_hr':
      fields.lactate_threshold_bpm = round(value);
      break;
    case 'stress':
      fields.avg_stress_level = round(value);
      break;
    default:
      break;
  }
}

type SampleMetric = 'hrv' | 'spo2' | 'respiration' | 'stress' | 'heart_rate';

/** ZeppBridge metric -> health_metric_samples metric and its value field. */
/** Metrics that are one value a day, whether ZeppBridge sends them as a daily
 * metric or as a timestamped sample (weight and body composition arrive as
 * samples). The latest reading of the person's day is the day's value. */
const DAILY_FIELD_METRICS = new Set([
  'distance',
  'active_calories',
  'bmr',
  'resting_hr',
  'vo2max',
  'lactate_threshold_hr',
]);

const SAMPLE_METRICS: Record<string, { metric: SampleMetric; field: string }> =
  {
    hrv_rmssd: { metric: 'hrv', field: 'rmssd_ms' },
    hrv: { metric: 'hrv', field: 'rmssd_ms' },
    spo2: { metric: 'spo2', field: 'percentage' },
    respiratory_rate: { metric: 'respiration', field: 'brpm' },
    stress: { metric: 'stress', field: 'level' },
    heart_rate: { metric: 'heart_rate', field: 'bpm' },
  };

interface PendingSample {
  entry_date: string;
  timestamp: Date;
  device_name: string;
  [field: string]: string | number | Date;
}

async function processMetrics(
  userId: string,
  createdByUserId: string,
  dailyMetrics: ZeppBridgeDailyMetric[],
  metricSamples: ZeppBridgeMetricSample[],
  timezone: string
): Promise<number> {
  const days = new Set<string>();

  // A daily value is dated by ZeppBridge's own local day.
  const daily = dailyMetrics.filter((m) => {
    if (isDayString(m.date) && Number.isFinite(m.value)) return true;
    log(
      'warn',
      `[zeppBridgeDataProcessor] Skipping ${m.metric} with invalid date ${String(m.date)}`
    );
    return false;
  });

  // Daily values that arrive as timestamped samples, one per person's day:
  // the latest reading wins. A real daily metric for the same day overrides it.
  const latestSample = new Map<
    string,
    { ms: number; metric: ZeppBridgeDailyMetric }
  >();
  for (const s of metricSamples) {
    if (!CHECK_IN_METRICS[s.metric] && !DAILY_FIELD_METRICS.has(s.metric)) {
      continue;
    }
    const at = new Date(s.timestamp);
    if (Number.isNaN(at.getTime()) || !Number.isFinite(s.value)) continue;
    const date = instantToDay(at, timezone);
    const key = `${date}|${s.metric}`;
    const previous = latestSample.get(key);
    if (!previous || at.getTime() > previous.ms) {
      latestSample.set(key, {
        ms: at.getTime(),
        metric: {
          record_type: 'daily_metric',
          source: s.source,
          date,
          metric: s.metric,
          value: s.value,
          unit: s.unit,
        },
      });
    }
  }
  const dailyValues = [
    ...[...latestSample.values()].map((v) => v.metric),
    ...daily,
  ];

  // One check-in per day and type; a later entry replaces an earlier one.
  const checkInByKey = new Map<string, Record<string, unknown>>();
  for (const m of dailyValues) {
    const target = CHECK_IN_METRICS[m.metric];
    if (!target) continue;
    days.add(m.date);
    checkInByKey.set(`${target.type}|${m.date}`, {
      type: target.type,
      value: m.value,
      date: m.date,
      source: ZEPPBRIDGE_SOURCE,
      dataType: 'numeric',
      measurementType: target.unit,
    });
  }
  const checkIns = [...checkInByKey.values()];
  if (checkIns.length > 0) {
    await measurementService.processHealthData(
      checkIns,
      userId,
      createdByUserId
    );
  }

  const fieldsByDay = new Map<string, DailyFields>();
  for (const m of dailyValues) {
    const fields = fieldsByDay.get(m.date) ?? {};
    applyDailyField(fields, m);
    fieldsByDay.set(m.date, fields);
  }
  for (const [day, fields] of fieldsByDay) {
    if (Object.values(fields).every((v) => v === undefined || v === null)) {
      continue;
    }
    await genericHealthRepo.upsertDailyHealthMetrics(userId, createdByUserId, {
      user_id: userId,
      entry_date: day,
      source_provider: ZEPPBRIDGE_PROVIDER,
      ...fields,
    });
    days.add(day);
  }

  // Samples: a daily value anchored at local noon of its day (05:00 UTC would
  // fall on the neighbouring day in far-west and far-east zones), and real
  // timestamps bucketed by the person's day.
  //
  // Each write is merged inside its own tight window, not replaced for the
  // whole day, because a person's day can straddle two spans of a long sync and
  // a wider window would delete the readings the other span stored. So they are
  // grouped by metric, by the person's day and by kind: a daily value's noon
  // anchor never shares a window with the day's readings, which can lie hours
  // away from it. (Plain loops, not Math.min(...), which cannot take a day of
  // per-minute samples.)
  interface SampleGroup {
    metric: SampleMetric;
    samples: PendingSample[];
    startMs: number;
    endMs: number;
  }
  const groups = new Map<string, SampleGroup>();
  const add = (
    kind: 'daily' | 'series',
    metric: SampleMetric,
    sample: PendingSample
  ) => {
    const key = `${kind}|${metric}|${sample.entry_date}`;
    const ms = sample.timestamp.getTime();
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { metric, samples: [sample], startMs: ms, endMs: ms });
      return;
    }
    group.samples.push(sample);
    if (ms < group.startMs) group.startMs = ms;
    if (ms > group.endMs) group.endMs = ms;
  };
  for (const m of daily) {
    const target = SAMPLE_METRICS[m.metric];
    if (!target) continue;
    add('daily', target.metric, {
      entry_date: m.date,
      timestamp: localDateTimeToUtc(`${m.date}T12:00`, timezone),
      device_name: ZEPPBRIDGE_SOURCE,
      [target.field]: m.value,
    });
    days.add(m.date);
  }
  for (const s of metricSamples) {
    const target = SAMPLE_METRICS[s.metric];
    const at = new Date(s.timestamp);
    if (!target || Number.isNaN(at.getTime()) || !Number.isFinite(s.value)) {
      continue;
    }
    const day = instantToDay(at, timezone);
    add('series', target.metric, {
      entry_date: day,
      timestamp: at,
      device_name: ZEPPBRIDGE_SOURCE,
      [target.field]: s.value,
    });
    days.add(day);
  }
  for (const group of groups.values()) {
    await upsertSamplesByDay(
      userId,
      createdByUserId,
      group.metric,
      ZEPPBRIDGE_PROVIDER,
      group.samples,
      {
        mode: 'merge',
        window: { startMs: group.startMs, endMs: group.endMs },
        keepLinked: true,
      }
    );
  }
  return days.size;
}

// ---------------------------------------------------------------------------

/** Writes one span's records; a record that fails is counted and logged. */
export async function processZeppBridgeRecords(
  userId: string,
  createdByUserId: string,
  records: ZeppBridgeRecordSet,
  timezone: string
): Promise<ZeppBridgeProcessResult> {
  const result: ZeppBridgeProcessResult = {
    sleepImported: 0,
    workoutsImported: 0,
    workoutsFailed: 0,
    sleepFailed: 0,
    metricDays: 0,
    detailCandidates: [],
  };
  for (const session of records.sleep) {
    try {
      if (await processSleepSession(userId, createdByUserId, session, timezone))
        result.sleepImported += 1;
      else result.sleepFailed += 1;
    } catch (error) {
      result.sleepFailed += 1;
      log(
        'error',
        `[zeppBridgeDataProcessor] Error processing sleep ${String(session.sleep_id ?? session.start_time)}: ${errorMessage(error)}`
      );
    }
  }
  for (const workout of records.workouts) {
    try {
      const stored = await processWorkout(
        userId,
        createdByUserId,
        workout,
        timezone
      );
      if (!stored) {
        result.workoutsFailed += 1;
        continue;
      }
      result.workoutsImported += 1;
      if (
        stored.entryId &&
        (await needsWorkoutDetail(userId, stored.entryId, workout))
      ) {
        result.detailCandidates.push({
          entryId: stored.entryId,
          workoutId: String(workout.workout_id),
          // The person's day for the workout; the detail request pads it by a
          // day each way, since ZeppBridge files it under its own local day.
          day: localParts(workout.start_time, timezone)?.day ?? '',
        });
      }
    } catch (error) {
      result.workoutsFailed += 1;
      log(
        'error',
        `[zeppBridgeDataProcessor] Error processing workout ${String(workout.workout_id)}: ${errorMessage(error)}`
      );
    }
  }
  result.metricDays = await processMetrics(
    userId,
    createdByUserId,
    records.dailyMetrics,
    records.metricSamples,
    timezone
  );
  return result;
}

export default { processZeppBridgeRecords };
