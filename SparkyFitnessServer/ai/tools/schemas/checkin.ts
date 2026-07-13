import { z } from 'zod';
import {
  dateSchema,
  optionalDateSchema,
  weightUnitEnum,
  heightUnitEnum,
  measurementsUnitEnum,
  fastingStatusEnum,
} from './common.js';

const logBiometricsSchema = z
  .object({
    action: z.literal('log_biometrics'),
    entry_date: dateSchema,
    weight: z.coerce.number().min(0).optional().describe('Weight value'),
    weight_unit: weightUnitEnum
      .optional()
      .describe('Unit for weight (defaults to kg)'),
    steps: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Daily step count'),
    height: z.coerce.number().min(0).optional().describe('Height value'),
    height_unit: heightUnitEnum.optional().describe('Unit for height'),
    neck: z.coerce.number().min(0).optional().describe('Neck measurement'),
    waist: z.coerce.number().min(0).optional().describe('Waist measurement'),
    hips: z.coerce.number().min(0).optional().describe('Hips measurement'),
    measurements_unit: measurementsUnitEnum
      .optional()
      .describe('Unit for body measurements'),
    body_fat: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Body fat percentage'),
  })
  .strict();

const logCustomMetricSchema = z
  .object({
    action: z.literal('log_custom_metric'),
    category_name: z
      .string()
      .min(1)
      .max(200)
      .describe("Name of the custom category (e.g., 'Blood Pressure')"),
    value: z
      .union([z.string(), z.coerce.number()])
      .describe('The value to record'),
    unit: z.string().max(50).optional().describe('Unit for the recorded value'),
    notes: z
      .string()
      .max(2000)
      .optional()
      .describe('Optional notes for the entry'),
    entry_date: dateSchema,
  })
  .strict();

const listCategoriesSchema = z
  .object({
    action: z.literal('list_categories'),
  })
  .strict();

const createCategorySchema = z
  .object({
    action: z.literal('create_category'),
    category_name: z
      .string()
      .min(1)
      .max(200)
      .describe('Name of the custom category'),
    unit: z
      .string()
      .max(50)
      .optional()
      .describe("Unit for the new category (e.g., 'kg', 'ml')"),
    data_type: z
      .enum(['numeric', 'boolean'])
      .optional()
      .describe(
        "Type of data: 'numeric' for measurements, 'boolean' for habits (defaults to 'numeric')"
      ),
  })
  .strict();

const logMoodSchema = z
  .object({
    action: z.literal('log_mood'),
    mood_value: z.coerce
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .default(5)
      .describe('Mood score (1-10); defaults to 5 if omitted'),
    notes: z
      .string()
      .max(2000)
      .optional()
      .describe('Optional notes about the mood'),
    mood_tags: z
      .array(z.string())
      .optional()
      .describe(
        'Optional list of mood tags/emotions (e.g. ["anxious", "tired", "sad"])'
      ),
    entry_date: dateSchema,
  })
  .strict();

const logFastingSchema = z
  .object({
    action: z.literal('log_fasting'),
    start_time: z
      .string()
      .describe('Start timestamp of the fasting window (ISO 8601)'),
    end_time: z
      .string()
      .optional()
      .describe('End timestamp of the fasting window (ISO 8601)'),
    fasting_status: fastingStatusEnum
      .optional()
      .describe('Current status of the fast'),
    fasting_type: z
      .string()
      .max(100)
      .optional()
      .describe("Type of fasting (e.g., 'Intermittent')"),
  })
  .strict();

const logSleepSchema = z
  .object({
    action: z.literal('log_sleep'),
    entry_date: dateSchema,
    duration_seconds: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Total sleep duration in seconds'),
    sleep_score: z.coerce
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .describe('Sleep quality score (0-100)'),
    bedtime: z.string().optional().describe('Bedtime timestamp (ISO 8601)'),
    wake_time: z.string().optional().describe('Wake up timestamp (ISO 8601)'),
    source: z
      .string()
      .max(100)
      .optional()
      .describe("Source of data (e.g., 'manual', 'Garmin', 'Fitbit')"),
  })
  .strict();

const listCheckinDiarySchema = z
  .object({
    action: z.literal('list_checkin_diary'),
    entry_date: optionalDateSchema,
  })
  .strict();

const getFastingStatusSchema = z
  .object({
    action: z.literal('get_fasting_status'),
  })
  .strict();

const getBiometricsHistorySchema = z
  .object({
    action: z.literal('get_biometrics_history'),
    start_date: dateSchema
      .optional()
      .describe('Start date for the history range'),
    end_date: dateSchema.optional().describe('End date for the history range'),
  })
  .strict();

export const manageCheckinSchema = z.discriminatedUnion('action', [
  logBiometricsSchema,
  logCustomMetricSchema,
  listCategoriesSchema,
  createCategorySchema,
  logMoodSchema,
  logFastingSchema,
  logSleepSchema,
  listCheckinDiarySchema,
  getFastingStatusSchema,
  getBiometricsHistorySchema,
]);

export type ManageCheckinInput = z.infer<typeof manageCheckinSchema>;

// Flat input shape published to the LLM as `inputSchema`. See comment on
// manageFoodInput in ./food.js for the rationale. Runtime validation still
// uses manageCheckinSchema in the tool handler via safeParse.
export const manageCheckinInput = z.object({
  action: z
    .enum([
      'log_biometrics',
      'log_custom_metric',
      'list_categories',
      'create_category',
      'log_mood',
      'log_fasting',
      'log_sleep',
      'list_checkin_diary',
      'get_fasting_status',
      'get_biometrics_history',
    ])
    .optional()
    .describe('Action to perform; see tool description for per-action fields.'),
  entry_date: dateSchema.optional().describe('Date for the entry (YYYY-MM-DD)'),
  // biometrics
  weight: z.coerce.number().min(0).optional().describe('Weight value'),
  weight_unit: weightUnitEnum
    .optional()
    .describe('Unit for weight (defaults to kg)'),
  steps: z.coerce.number().int().min(0).optional().describe('Daily step count'),
  height: z.coerce.number().min(0).optional().describe('Height value'),
  height_unit: heightUnitEnum.optional().describe('Unit for height'),
  neck: z.coerce.number().min(0).optional().describe('Neck measurement'),
  waist: z.coerce.number().min(0).optional().describe('Waist measurement'),
  hips: z.coerce.number().min(0).optional().describe('Hips measurement'),
  measurements_unit: measurementsUnitEnum
    .optional()
    .describe('Unit for body measurements'),
  body_fat: z.coerce.number().min(0).optional().describe('Body fat percentage'),
  // custom metrics / categories
  category_name: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Name of the custom category'),
  value: z
    .union([z.string(), z.coerce.number()])
    .optional()
    .describe('Value to record (numeric or string)'),
  unit: z.string().max(50).optional().describe('Unit for the recorded value'),
  notes: z.string().max(2000).optional().describe('Optional notes'),
  data_type: z
    .enum(['numeric', 'boolean'])
    .optional()
    .describe('Type of data for create_category'),
  // mood
  mood_value: z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe('Mood score (1-10)'),
  mood_tags: z
    .array(z.string())
    .optional()
    .describe(
      'Optional mood tags for log_mood (e.g. ["anxious", "tired", "sad"])'
    ),
  // fasting
  start_time: z
    .string()
    .optional()
    .describe('Start timestamp (ISO 8601) — for log_fasting'),
  end_time: z
    .string()
    .optional()
    .describe('End timestamp (ISO 8601) — for log_fasting'),
  fasting_status: fastingStatusEnum
    .optional()
    .describe('Fasting session status'),
  fasting_type: z
    .string()
    .max(100)
    .optional()
    .describe("Type of fasting (e.g., 'Intermittent')"),
  // sleep
  duration_seconds: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('Total sleep duration in seconds'),
  sleep_score: z.coerce
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe('Sleep quality score (0-100)'),
  bedtime: z.string().optional().describe('Bedtime timestamp (ISO 8601)'),
  wake_time: z.string().optional().describe('Wake-up timestamp (ISO 8601)'),
  source: z
    .string()
    .max(100)
    .optional()
    .describe("Source of data (e.g., 'manual', 'Garmin')"),
  // history range
  start_date: dateSchema
    .optional()
    .describe('Start date for the history range'),
  end_date: dateSchema.optional().describe('End date for the history range'),
});
