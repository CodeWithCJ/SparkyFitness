/**
 * Records returned by ZeppBridge's `GET /v1/records`
 * (https://github.com/lingcang728/ZeppBridge, docs/guides/self-hosted-pull.md).
 *
 * The schemas are deliberately lenient: every field is optional and unknown
 * fields are dropped, because ZeppBridge may add fields at any time within a
 * `records_version`. A record that does not parse is skipped, never fatal.
 */
import { z } from 'zod';

const number = z.number().nullish();
const text = z.string().nullish();

/** `records_version` is `zeppbridge.records.v<N>`; only a new N is breaking. */
export const SUPPORTED_RECORDS_MAJOR = 2;
const RECORDS_VERSION_PATTERN = /^zeppbridge\.records\.v(\d+)$/;

export function recordsVersionMajor(version: unknown): number | null {
  if (typeof version !== 'string') return null;
  const match = RECORDS_VERSION_PATTERN.exec(version);
  return match ? Number(match[1]) : null;
}

export const zeppBridgeInfoSchema = z.object({
  version: text,
  records_version: text,
});
export type ZeppBridgeInfo = z.infer<typeof zeppBridgeInfoSchema>;

const sleepStageSchema = z.object({
  stage: text,
  start_time: z.string(),
  end_time: z.string(),
});

export const sleepSessionSchema = z.object({
  record_type: z.literal('sleep_session'),
  source: text,
  sleep_id: z.union([z.string(), z.number()]).nullish(),
  start_time: z.string(),
  end_time: z.string(),
  score: number,
  duration_minutes: number,
  deep_minutes: number,
  light_minutes: number,
  rem_minutes: number,
  awake_minutes: number,
  wake_count: number,
  stages: z.array(sleepStageSchema).nullish(),
});
export type ZeppBridgeSleepSession = z.infer<typeof sleepSessionSchema>;

export const workoutSchema = z.object({
  record_type: z.literal('workout'),
  source: text,
  workout_id: z.union([z.string(), z.number()]),
  effective_type: text,
  normalized_type: text,
  workout_type: text,
  start_time: z.string(),
  end_time: text,
  distance_meters: number,
  calories: number,
  avg_hr: number,
  max_hr: number,
  min_hr: number,
  training_load: number,
  total_steps: number,
  moving_seconds: number,
  elevation_gain_m: number,
  elevation_loss_m: number,
  max_altitude_m: number,
  min_altitude_m: number,
  training_effect: number,
  anaerobic_training_effect: number,
  rpe: number,
  vo2max: number,
  avg_cadence_spm: number,
  max_cadence_spm: number,
  avg_stride_cm: number,
  /** How many route points and per-second samples ZeppBridge holds. */
  route_point_count: number,
  sample_count: number,
  // Parsed point by point (see the schemas below), so one bad point is
  // dropped instead of the whole workout. `laps` come with the summary;
  // `route` and `samples` only with `detail=full`.
  laps: z.array(z.unknown()).nullish(),
  route: z.array(z.unknown()).nullish(),
  samples: z.array(z.unknown()).nullish(),
});
export type ZeppBridgeWorkout = z.infer<typeof workoutSchema>;

export const lapSchema = z.object({
  index: z.number(),
  start_time: z.string(),
  end_time: z.string(),
  distance_m: number,
  duration_seconds: number,
  avg_hr: number,
  max_hr: number,
  avg_cadence_spm: number,
});
export type ZeppBridgeLap = z.infer<typeof lapSchema>;

export const routePointSchema = z.object({
  timestamp: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  altitude_m: number,
});
export type ZeppBridgeRoutePoint = z.infer<typeof routePointSchema>;

export const workoutSampleSchema = z.object({
  timestamp: z.string(),
  heart_rate: number,
  cadence: number,
  altitude_m: number,
  power_watts: number,
  distance_m: number,
});
export type ZeppBridgeWorkoutSample = z.infer<typeof workoutSampleSchema>;

export const dailyMetricSchema = z.object({
  record_type: z.literal('daily_metric'),
  source: text,
  date: z.string(),
  metric: z.string(),
  value: z.number(),
  unit: text,
});
export type ZeppBridgeDailyMetric = z.infer<typeof dailyMetricSchema>;

export const metricSampleSchema = z.object({
  record_type: z.literal('metric_sample'),
  source: text,
  metric: z.string(),
  timestamp: z.string(),
  value: z.number(),
  unit: text,
});
export type ZeppBridgeMetricSample = z.infer<typeof metricSampleSchema>;

/** One page of `GET /v1/records`; records stay raw until each is parsed. */
export const recordsPageSchema = z.object({
  records_version: z.string(),
  next_cursor: z.string().nullish(),
  records: z.array(z.unknown()),
});
export type ZeppBridgeRecordsPage = z.infer<typeof recordsPageSchema>;

/** The records of a range, split by kind and parsed; `invalid` counts the rest. */
export interface ZeppBridgeRecordSet {
  sleep: ZeppBridgeSleepSession[];
  workouts: ZeppBridgeWorkout[];
  dailyMetrics: ZeppBridgeDailyMetric[];
  metricSamples: ZeppBridgeMetricSample[];
  /** Kinds we do not import (life events) or records that did not parse. */
  skipped: number;
  /** Records of a kind we import that failed to parse. */
  invalid: number;
}

export function emptyRecordSet(): ZeppBridgeRecordSet {
  return {
    sleep: [],
    workouts: [],
    dailyMetrics: [],
    metricSamples: [],
    skipped: 0,
    invalid: 0,
  };
}

/** Sorts raw records into the set; a bad record is counted, never thrown. */
export function addRecords(
  set: ZeppBridgeRecordSet,
  records: readonly unknown[]
): void {
  for (const raw of records) {
    const kind =
      raw && typeof raw === 'object'
        ? (raw as { record_type?: unknown }).record_type
        : undefined;
    const parse = <T>(schema: z.ZodType<T>, into: T[]) => {
      const parsed = schema.safeParse(raw);
      if (parsed.success) into.push(parsed.data);
      else set.invalid += 1;
    };
    switch (kind) {
      case 'sleep_session':
        parse(sleepSessionSchema, set.sleep);
        break;
      case 'workout':
        parse(workoutSchema, set.workouts);
        break;
      case 'daily_metric':
        parse(dailyMetricSchema, set.dailyMetrics);
        break;
      case 'metric_sample':
        parse(metricSampleSchema, set.metricSamples);
        break;
      default:
        set.skipped += 1;
    }
  }
}
