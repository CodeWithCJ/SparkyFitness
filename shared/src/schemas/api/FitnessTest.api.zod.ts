import { z } from 'zod';
import {
  FITNESS_TEST_SURFACES,
  FITNESS_TEST_TYPES,
  MAX_INCLINE_PERCENT,
} from '../../utils/fitnessTest.ts';
import { isDayString } from '../../utils/timezone.ts';

const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isDayString, { message: 'Not a real calendar day.' });

export const fitnessTestTypeSchema = z.enum(FITNESS_TEST_TYPES);
export const fitnessTestSurfaceSchema = z.enum(FITNESS_TEST_SURFACES);

const paceBandSchema = z.object({
  minSecondsPerKm: z.number().int(),
  maxSecondsPerKm: z.number().int(),
});

/** The training paces a test gave: five zones around the threshold and the race-based ranges. */
export const fitnessTestPacesSchema = z.object({
  thresholdSecondsPerKm: z.number().int(),
  equivalent5kSeconds: z.number().int(),
  zones: z
    .array(
      z.object({
        id: z.enum(['easy', 'steady', 'threshold', 'interval', 'repetition']),
        minSecondsPerKm: z.number(),
        maxSecondsPerKm: z.number(),
      })
    )
    .min(1)
    .max(5),
  raceZones: z.object({
    easy: paceBandSchema.optional(),
    interval: paceBandSchema.optional(),
    tempo: paceBandSchema.optional(),
    marathon: paceBandSchema.optional(),
    stride: paceBandSchema.optional(),
  }),
});

/**
 * What the phone sends after a test: only the measurements. The server works
 * out the result and the paces itself, so every device agrees.
 */
export const createFitnessTestBodySchema = z
  .object({
    test_type: fitnessTestTypeSchema,
    /** The local day the test was run on. */
    test_date: dayString,
    /** 5K: 5000. 30-minute run: distance in 30 minutes. Cooper: distance in 12 minutes. */
    distance_meters: z.number().min(100).max(100000),
    /** 5K: the time taken. 30-minute run: 1800. Cooper: 720. */
    duration_seconds: z.number().int().min(1).max(14400),
    /** 30-minute run: distance covered after the first 10 minutes. */
    split_distance_meters: z.number().min(0).max(100000).nullable().optional(),
    /** The recorded activity the test was run as. */
    exercise_entry_id: z.string().uuid().nullable().optional(),
    /** Outdoors with GPS (the default), or indoors on a treadmill. */
    surface: fitnessTestSurfaceSchema.optional().default('outdoor'),
    /** Treadmill incline, percent; indoor tests only. */
    incline_percent: z
      .number()
      .min(0)
      .max(MAX_INCLINE_PERCENT)
      .nullable()
      .optional(),
    /** Correct the result for the incline (the default when one is given). */
    incline_adjusted: z.boolean().optional().default(true),
  })
  .refine((body) => body.surface === 'indoor' || body.incline_percent == null, {
    message: 'An incline only applies to an indoor test.',
    path: ['incline_percent'],
  });
export type CreateFitnessTestBody = z.input<typeof createFitnessTestBodySchema>;

export const fitnessTestResponseSchema = z.object({
  id: z.string(),
  test_type: fitnessTestTypeSchema,
  test_date: dayString,
  distance_meters: z.number(),
  duration_seconds: z.number().int(),
  split_distance_meters: z.number().nullable(),
  /** Seconds (5K), seconds per km of the last 20 minutes (30-minute run) or metres (Cooper). */
  result_value: z.number(),
  exercise_entry_id: z.string().nullable(),
  surface: fitnessTestSurfaceSchema,
  incline_percent: z.number().nullable(),
  /** Whether the result was corrected for the incline. */
  incline_adjusted: z.boolean(),
  paces: fitnessTestPacesSchema,
  created_at: z.string(),
});
export type FitnessTestResponse = z.infer<typeof fitnessTestResponseSchema>;

export const fitnessTestListResponseSchema = z.object({
  tests: z.array(fitnessTestResponseSchema),
});
export type FitnessTestListResponse = z.infer<
  typeof fitnessTestListResponseSchema
>;
