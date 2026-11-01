import { z } from 'zod';
import {
  bodyBatterySampleSchema,
  healthMetricSchema,
  heartRateSampleSchema,
  hrvSampleSchema,
  respirationSampleSchema,
  skinTemperatureSampleSchema,
  spo2SampleSchema,
  stressSampleSchema,
} from '../database/HealthMetricSamples.zod.ts';

/** Most samples one write may carry (one per second for about half a day). */
export const HEALTH_METRIC_SAMPLES_WRITE_MAX_SAMPLES = 50_000;
/** Longest window one write may cover. */
export const HEALTH_METRIC_SAMPLES_WRITE_MAX_WINDOW_DAYS = 31;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Source names the server writes samples under: the built-in integrations,
 * and `manual`, the default source of a workout imported through
 * `/health-data`, whose heart rate samples are stored under it. A passive
 * write with one of these would replace those rows, so they are refused.
 * Compared without case, spaces, dots, dashes and underscores.
 */
export const HEALTH_METRIC_SAMPLES_RESERVED_SOURCES = [
  'manual',
  'garmin',
  'polar',
  'intervals',
  'intervals.icu',
  'SparkyFitness Watch',
  'HealthKit',
  'apple_health',
  'Health Connect',
] as const;

const sourceKey = (source: string) =>
  source.toLowerCase().replace(/[\s._-]+/g, '');
const RESERVED_SOURCE_KEYS = new Set(
  HEALTH_METRIC_SAMPLES_RESERVED_SOURCES.map(sourceKey)
);

// Passive all-day readings belong to no workout or sleep session, so the
// `ex`/`sl` links the stored shape allows are not accepted from clients.
const NO_LINKS = { ex: true, sl: true } as const;

const samplesOf = <T extends z.ZodType>(sample: T) =>
  z.array(sample).min(1).max(HEALTH_METRIC_SAMPLES_WRITE_MAX_SAMPLES);

const writeWindowSchema = z
  .object({
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
  })
  .strict();

const writeBodyBase = {
  // Stored as health_metric_samples.source_provider. A write only touches
  // rows of this source, and the built-in integrations' names are refused,
  // so readings from other providers on the same day are never replaced.
  source: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((source) => !RESERVED_SOURCE_KEYS.has(sourceKey(source)), {
      message: 'source is reserved for a built-in integration',
    }),
  device_name: z.string().trim().min(1).max(128).optional(),
  // `merge` replaces only the stored samples inside `window` and keeps the
  // rest of the day; `replace` overwrites every day the samples touch.
  mode: z.enum(['merge', 'replace']).default('merge'),
  window: writeWindowSchema.optional(),
};

/**
 * Body of POST /api/generic-health/samples. Each sample uses the field names
 * of the stored metric (`bpm`, `percentage`, `level`, ...), so the server
 * stores it without conversion.
 */
export const healthMetricSamplesWriteBodySchema = z
  .discriminatedUnion('metric', [
    z
      .object({
        ...writeBodyBase,
        metric: z.literal('heart_rate'),
        samples: samplesOf(heartRateSampleSchema.omit(NO_LINKS).strict()),
      })
      .strict(),
    z
      .object({
        ...writeBodyBase,
        metric: z.literal('hrv'),
        samples: samplesOf(hrvSampleSchema.omit(NO_LINKS).strict()),
      })
      .strict(),
    z
      .object({
        ...writeBodyBase,
        metric: z.literal('respiration'),
        samples: samplesOf(respirationSampleSchema.omit(NO_LINKS).strict()),
      })
      .strict(),
    z
      .object({
        ...writeBodyBase,
        metric: z.literal('spo2'),
        samples: samplesOf(spo2SampleSchema.omit(NO_LINKS).strict()),
      })
      .strict(),
    z
      .object({
        ...writeBodyBase,
        metric: z.literal('stress'),
        samples: samplesOf(stressSampleSchema.omit(NO_LINKS).strict()),
      })
      .strict(),
    z
      .object({
        ...writeBodyBase,
        metric: z.literal('body_battery'),
        samples: samplesOf(bodyBatterySampleSchema.omit(NO_LINKS).strict()),
      })
      .strict(),
    z
      .object({
        ...writeBodyBase,
        metric: z.literal('skin_temperature'),
        samples: samplesOf(skinTemperatureSampleSchema.omit(NO_LINKS).strict()),
      })
      .strict(),
  ])
  .superRefine((body, ctx) => {
    if (!body.window) {
      // Without a window a merge only appends, so sending the same range
      // again would store every reading twice.
      if (body.mode === 'merge') {
        ctx.addIssue({
          code: 'custom',
          path: ['window'],
          message: 'window is required in merge mode',
        });
      }
      return;
    }
    const startMs = Date.parse(body.window.start);
    const endMs = Date.parse(body.window.end);
    if (startMs >= endMs) {
      ctx.addIssue({
        code: 'custom',
        path: ['window', 'end'],
        message: 'window.end must be after window.start',
      });
      return;
    }
    if (
      endMs - startMs >
      HEALTH_METRIC_SAMPLES_WRITE_MAX_WINDOW_DAYS * DAY_MS
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['window'],
        message: `window must not exceed ${HEALTH_METRIC_SAMPLES_WRITE_MAX_WINDOW_DAYS} days`,
      });
      return;
    }
    // A sample outside the window would be appended next to the stored one
    // instead of replacing it.
    for (let i = 0; i < body.samples.length; i++) {
      const ms = Date.parse(body.samples[i]?.t ?? '');
      if (ms < startMs || ms > endMs) {
        ctx.addIssue({
          code: 'custom',
          path: ['samples', i, 't'],
          message: 'sample lies outside window',
        });
        return;
      }
    }
  });
export type HealthMetricSamplesWriteBody = z.infer<
  typeof healthMetricSamplesWriteBodySchema
>;

export const healthMetricSamplesWriteResponseSchema = z.object({
  metric: healthMetricSchema,
  source: z.string(),
  mode: z.enum(['merge', 'replace']),
  days_written: z.number().int(),
  samples_written: z.number().int(),
});
export type HealthMetricSamplesWriteResponse = z.infer<
  typeof healthMetricSamplesWriteResponseSchema
>;
