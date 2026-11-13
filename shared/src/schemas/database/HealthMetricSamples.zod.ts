import { z } from 'zod';

export const healthMetricSamplesIdSchema = z.string();

// Keep this enum in sync with chk_health_metric_samples_metric. New metrics
// require both a migration and a per-metric sample schema below.
export const healthMetricSchema = z.enum([
  'heart_rate',
  'hrv',
  'respiration',
  'spo2',
  'stress',
  'body_battery',
  'skin_temperature',
  'blood_glucose',
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

/** Canonical glucose unit is mmol/L; source identifies the app/device writer. */
export const bloodGlucoseSampleSchema = baseSampleSchema.extend({
  mmol_l: z.number().positive().max(100),
  source_bundle_id: z.string().max(256).optional(),
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
/**
 * Where a skin temperature was taken. Apple's sleeping wrist temperature and an
 * overnight Body Temperature mean both arrive from `healthkit`, so a baseline
 * built per source has to keep them apart. Older samples have none.
 */
export const SKIN_TEMPERATURE_SITES = ['wrist', 'body'] as const;
export type SkinTemperatureSite = (typeof SKIN_TEMPERATURE_SITES)[number];
export const isSkinTemperatureSite = (
  value: unknown
): value is SkinTemperatureSite =>
  typeof value === 'string' &&
  (SKIN_TEMPERATURE_SITES as readonly string[]).includes(value);

export const skinTemperatureSampleSchema = baseSampleSchema.extend({
  site: z.enum(SKIN_TEMPERATURE_SITES).optional(),
  celsius: z.number().optional(),
  temperature_celsius: z.number().optional(),
  deviation_celsius: z.number().optional(),
});

export type HeartRateSample = z.infer<typeof heartRateSampleSchema>;
export type HrvSample = z.infer<typeof hrvSampleSchema>;
export type RespirationSample = z.infer<typeof respirationSampleSchema>;
export type Spo2Sample = z.infer<typeof spo2SampleSchema>;
export type StressSample = z.infer<typeof stressSampleSchema>;
export type BodyBatterySample = z.infer<typeof bodyBatterySampleSchema>;
export type SkinTemperatureSample = z.infer<typeof skinTemperatureSampleSchema>;

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
export const healthMetricSamplesSchema = z.discriminatedUnion('metric', [
  z.object({
    ...rowBase,
    metric: z.literal('blood_glucose'),
    samples: z.array(bloodGlucoseSampleSchema),
  }),
  z.object({
    ...rowBase,
    metric: z.literal('heart_rate'),
    samples: z.array(heartRateSampleSchema),
  }),
  z.object({
    ...rowBase,
    metric: z.literal('hrv'),
    samples: z.array(hrvSampleSchema),
  }),
  z.object({
    ...rowBase,
    metric: z.literal('respiration'),
    samples: z.array(respirationSampleSchema),
  }),
  z.object({
    ...rowBase,
    metric: z.literal('spo2'),
    samples: z.array(spo2SampleSchema),
  }),
  z.object({
    ...rowBase,
    metric: z.literal('stress'),
    samples: z.array(stressSampleSchema),
  }),
  z.object({
    ...rowBase,
    metric: z.literal('body_battery'),
    samples: z.array(bodyBatterySampleSchema),
  }),
  z.object({
    ...rowBase,
    metric: z.literal('skin_temperature'),
    samples: z.array(skinTemperatureSampleSchema),
  }),
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

export const healthMetricSamplesInitializerSchema = z.discriminatedUnion(
  'metric',
  [
    z.object({
      ...rowBaseInitializer,
      metric: z.literal('blood_glucose'),
      samples: z.array(bloodGlucoseSampleSchema),
    }),
    z.object({
      ...rowBaseInitializer,
      metric: z.literal('heart_rate'),
      samples: z.array(heartRateSampleSchema),
    }),
    z.object({
      ...rowBaseInitializer,
      metric: z.literal('hrv'),
      samples: z.array(hrvSampleSchema),
    }),
    z.object({
      ...rowBaseInitializer,
      metric: z.literal('respiration'),
      samples: z.array(respirationSampleSchema),
    }),
    z.object({
      ...rowBaseInitializer,
      metric: z.literal('spo2'),
      samples: z.array(spo2SampleSchema),
    }),
    z.object({
      ...rowBaseInitializer,
      metric: z.literal('stress'),
      samples: z.array(stressSampleSchema),
    }),
    z.object({
      ...rowBaseInitializer,
      metric: z.literal('body_battery'),
      samples: z.array(bodyBatterySampleSchema),
    }),
    z.object({
      ...rowBaseInitializer,
      metric: z.literal('skin_temperature'),
      samples: z.array(skinTemperatureSampleSchema),
    }),
  ]
);
export type HealthMetricSamplesInitializer = z.infer<
  typeof healthMetricSamplesInitializerSchema
>;

// No Mutator schema: z.discriminatedUnion does not support .partial(), and
// nothing in this codebase partially mutates a bucket — the server always
// upserts a whole day's `samples` array at once (see upsertHealthMetricSamples
// in models/genericHealthRepository.ts). Add one only if a real partial-update
// use case appears; do not force an incorrect type to fill this gap.
