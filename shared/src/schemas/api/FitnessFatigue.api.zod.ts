import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const fitnessFatiguePointSchema = z.object({
  day,
  load: z.number(),
  fitness: z.number(),
  fatigue: z.number(),
  form: z.number(),
});

export const formStatusSchema = z.enum([
  'noData',
  'learning',
  'fresh',
  'neutral',
  'tired',
]);

export const fitnessFatigueSchema = z.object({
  points: z.array(fitnessFatiguePointSchema),
  today: fitnessFatiguePointSchema.nullable(),
  status: formStatusSchema,
});

export const readinessFactorSchema = z.enum([
  'form',
  'sleep',
  'restingHeartRate',
  'hrv',
]);

/** Today's resting heart rate or HRV against the person's own baseline. */
export const readinessVitalSchema = z.object({
  current: z.number(),
  baseline: z.number(),
  nights: z.number().int().min(0).optional(),
});

export const readinessSchema = z.object({
  score: z.number().min(0).max(100).nullable(),
  level: z.enum(['noData', 'low', 'moderate', 'high']),
  factors: z.partialRecord(readinessFactorSchema, z.number().min(0).max(100)),
  /** Raw numbers behind the watch factors; absent from older servers. */
  vitals: z
    .object({
      restingHeartRate: readinessVitalSchema.optional(),
      hrv: readinessVitalSchema.optional(),
    })
    .optional(),
  weakest: readinessFactorSchema.nullable(),
});

/** Response of GET /api/reports/fitness-fatigue. */
export const fitnessFatigueResponseSchema = z.object({
  fitnessFatigue: fitnessFatigueSchema,
  readiness: readinessSchema,
});
export type FitnessFatigueResponse = z.infer<
  typeof fitnessFatigueResponseSchema
>;

export const vo2MaxEstimateSchema = z.object({
  value: z.number(),
  runs: z.number().int().min(1),
  from: day,
  to: day,
  /** Per run day, oldest first; absent from older servers. */
  series: z.array(z.object({ day, value: z.number() })).optional(),
});

export const runningPowerSchema = z.object({
  averageWatts: z.number(),
  wattsPerKg: z.number(),
  runs: z.array(z.object({ day, watts: z.number() })),
});

/** Response of GET /api/reports/run-estimates. Both figures are estimates. */
export const runningEstimatesResponseSchema = z.object({
  vo2Max: vo2MaxEstimateSchema.nullable(),
  power: runningPowerSchema.nullable(),
});
export type RunningEstimatesResponse = z.infer<
  typeof runningEstimatesResponseSchema
>;
