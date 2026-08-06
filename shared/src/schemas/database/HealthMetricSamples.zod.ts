import { z } from "zod";

export const healthMetricSamplesIdSchema = z.string();

// Kept in sync BY HAND with the chk_health_metric_samples_metric CHECK
// constraint added in
// db/migrations/20260730000000_create_generic_health_and_workout_tables.sql.
// Both must govern the same six values, deliberately, at two different layers:
//   - the DB CHECK constraint is the backstop, guarding against bad data from
//     ANY writer (a future migration, a script, a bug that bypasses this schema);
//   - this enum is the app-boundary guard, giving a typed union and a clean
//     validation error before a bad value ever reaches SQL.
// Adding a 7th metric means editing BOTH. There is no single source of truth
// generating one from the other — if you add automation for that, remove this
// comment and point it at the generator instead.
export const healthMetricSchema = z.enum([
  "heart_rate",
  "hrv",
  "respiration",
  "spo2",
  "stress",
  "body_battery",
]);
export type HealthMetric = z.infer<typeof healthMetricSchema>;

/**
 * Fields common to every sample regardless of metric.
 *   t  - ISO timestamp of the reading
 *   ex - exercise_entries.id, when the reading falls inside a logged workout
 *   sl - sleep_entries.id, when it falls inside a logged sleep session
 * `ex`/`sl` are plain IDs, not FKs: biometric readings intentionally survive
 * deletion of the activity they were recorded during. A sample can therefore
 * reference an activity that no longer exists — treat an unresolvable ex/sl as
 * simply unlinked, never assume the referenced row exists.
 */
const baseSampleSchema = z.object({
  // Validated as an ISO datetime: these come straight from provider payloads
  // into a JSONB column, so an unparseable timestamp would otherwise be stored
  // and only fail much later at read time.
  t: z.iso.datetime({ offset: true }),
  ex: z.string().optional(),
  sl: z.string().optional(),
});

export const heartRateSampleSchema = baseSampleSchema.extend({
  bpm: z.number(),
  context: z.string().optional(),
});
export const hrvSampleSchema = baseSampleSchema.extend({
  rmssd_ms: z.number().optional(),
  sdnn_ms: z.number().optional(),
  status: z.string().optional(),
});
export const respirationSampleSchema = baseSampleSchema.extend({
  brpm: z.number(),
  context: z.string().optional(),
});
export const spo2SampleSchema = baseSampleSchema.extend({
  percentage: z.number(),
});
export const stressSampleSchema = baseSampleSchema.extend({
  level: z.number(),
});
export const bodyBatterySampleSchema = baseSampleSchema.extend({
  level: z.number(),
});

export type HeartRateSample = z.infer<typeof heartRateSampleSchema>;
export type HrvSample = z.infer<typeof hrvSampleSchema>;
export type RespirationSample = z.infer<typeof respirationSampleSchema>;
export type Spo2Sample = z.infer<typeof spo2SampleSchema>;
export type StressSample = z.infer<typeof stressSampleSchema>;
export type BodyBatterySample = z.infer<typeof bodyBatterySampleSchema>;

const rowBase = {
  id: healthMetricSamplesIdSchema,
  user_id: z.string(),
  entry_date: z.string(), // calendar day 'YYYY-MM-DD' in the user's timezone, NOT a UTC instant
  source_provider: z.string(),
  device_name: z.string().nullable(),
  created_at: z.coerce.date().nullable(),
  updated_at: z.coerce.date().nullable(),
};

// Discriminated union on `metric` so `samples` is narrowed to the correct
// per-metric shape at the application boundary — the type safety a shared
// table would otherwise lose relative to four separate tables.
export const healthMetricSamplesSchema = z.discriminatedUnion("metric", [
  z.object({ ...rowBase, metric: z.literal("heart_rate"), samples: z.array(heartRateSampleSchema) }),
  z.object({ ...rowBase, metric: z.literal("hrv"), samples: z.array(hrvSampleSchema) }),
  z.object({ ...rowBase, metric: z.literal("respiration"), samples: z.array(respirationSampleSchema) }),
  z.object({ ...rowBase, metric: z.literal("spo2"), samples: z.array(spo2SampleSchema) }),
  z.object({ ...rowBase, metric: z.literal("stress"), samples: z.array(stressSampleSchema) }),
  z.object({ ...rowBase, metric: z.literal("body_battery"), samples: z.array(bodyBatterySampleSchema) }),
]);
export type HealthMetricSamples = z.infer<typeof healthMetricSamplesSchema>;

const rowBaseInitializer = {
  id: healthMetricSamplesIdSchema.optional(),
  user_id: z.string(),
  entry_date: z.string(),
  source_provider: z.string(),
  device_name: z.string().optional().nullable(),
  created_at: z.coerce.date().optional().nullable(),
  updated_at: z.coerce.date().optional().nullable(),
};

export const healthMetricSamplesInitializerSchema = z.discriminatedUnion("metric", [
  z.object({ ...rowBaseInitializer, metric: z.literal("heart_rate"), samples: z.array(heartRateSampleSchema) }),
  z.object({ ...rowBaseInitializer, metric: z.literal("hrv"), samples: z.array(hrvSampleSchema) }),
  z.object({ ...rowBaseInitializer, metric: z.literal("respiration"), samples: z.array(respirationSampleSchema) }),
  z.object({ ...rowBaseInitializer, metric: z.literal("spo2"), samples: z.array(spo2SampleSchema) }),
  z.object({ ...rowBaseInitializer, metric: z.literal("stress"), samples: z.array(stressSampleSchema) }),
  z.object({ ...rowBaseInitializer, metric: z.literal("body_battery"), samples: z.array(bodyBatterySampleSchema) }),
]);
export type HealthMetricSamplesInitializer = z.infer<typeof healthMetricSamplesInitializerSchema>;

// No Mutator schema: z.discriminatedUnion does not support .partial(), and
// nothing in this codebase partially mutates a bucket — the server always
// upserts a whole day's `samples` array at once (see upsertHealthMetricSamples
// in models/genericHealthRepository.ts). Add one only if a real partial-update
// use case appears; do not force an incorrect type to fill this gap.
