import { z } from 'zod';
import { optionalDateSchema } from './common.js';

export const EXERCISE_STATS_ACTIONS = [
  'stats_summary',
  'query_activities',
  'personal_records',
  'matched_courses',
] as const;

const intervalSchema = z.enum([
  'day',
  'week',
  'month',
  'year',
  'ytd',
  'lifetime',
  'custom',
]);

const unitSystemSchema = z.enum(['metric', 'imperial']);

const distanceStandardSchema = z.enum([
  '1k',
  '1mi',
  '5k',
  '10k',
  '15k',
  'half_marathon',
  'marathon',
  'custom',
]);

const statsSummarySchema = z
  .object({
    action: z.literal('stats_summary'),
    interval: intervalSchema.optional(),
    start_date: optionalDateSchema,
    end_date: optionalDateSchema,
    category: z.string().trim().min(1).optional(),
    unit_system: unitSystemSchema.optional(),
  })
  .strict();

const queryActivitiesSchema = z
  .object({
    action: z.literal('query_activities'),
    category: z.string().trim().min(1).optional(),
    distance_standard: distanceStandardSchema.optional(),
    start_date: optionalDateSchema,
    end_date: optionalDateSchema,
    search_keyword: z.string().trim().min(1).optional(),
    unit_system: unitSystemSchema.optional(),
    page: z.coerce.number().int().min(1).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

const personalRecordsSchema = z
  .object({
    action: z.literal('personal_records'),
    unit_system: unitSystemSchema.optional(),
  })
  .strict();

const matchedCoursesSchema = z
  .object({
    action: z.literal('matched_courses'),
    unit_system: unitSystemSchema.optional(),
  })
  .strict();

export const exerciseStatsSchema = z.discriminatedUnion('action', [
  statsSummarySchema,
  queryActivitiesSchema,
  personalRecordsSchema,
  matchedCoursesSchema,
]);

export type ExerciseStatsInput = z.infer<typeof exerciseStatsSchema>;

export const exerciseStatsInput = z.object({
  action: z.enum(EXERCISE_STATS_ACTIONS).optional(),
  interval: intervalSchema.optional(),
  start_date: optionalDateSchema,
  end_date: optionalDateSchema,
  category: z.string().optional(),
  unit_system: unitSystemSchema.optional(),
  distance_standard: distanceStandardSchema.optional(),
  search_keyword: z.string().optional(),
  page: z.coerce.number().int().optional(),
  page_size: z.coerce.number().int().optional(),
});
