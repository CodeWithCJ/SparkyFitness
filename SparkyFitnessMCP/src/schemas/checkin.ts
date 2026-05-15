import { z } from "zod";
import {
  dateSchema,
  optionalDateSchema,
  weightUnitEnum,
  heightUnitEnum,
  measurementsUnitEnum,
  fastingStatusEnum,
} from "./common.js";

const logBiometricsSchema = z.object({
  action: z.literal("log_biometrics"),
  entry_date: dateSchema,
  weight: z.coerce.number().min(0).optional().describe("Weight value"),
  weight_unit: weightUnitEnum.optional().describe("Unit for weight (defaults to kg)"),
  steps: z.coerce.number().int().min(0).optional().describe("Daily step count"),
  height: z.coerce.number().min(0).optional().describe("Height value"),
  height_unit: heightUnitEnum.optional().describe("Unit for height"),
  neck: z.coerce.number().min(0).optional().describe("Neck measurement"),
  waist: z.coerce.number().min(0).optional().describe("Waist measurement"),
  hips: z.coerce.number().min(0).optional().describe("Hips measurement"),
  measurements_unit: measurementsUnitEnum.optional().describe("Unit for body measurements"),
  body_fat: z.coerce.number().min(0).optional().describe("Body fat percentage"),
}).strict();

const logCustomMetricSchema = z.object({
  action: z.literal("log_custom_metric"),
  category_name: z.string().min(1).max(200).describe("Name of the custom category (e.g., 'Blood Pressure')"),
  value: z.union([z.string(), z.coerce.number()]).describe("The value to record"),
  unit: z.string().max(50).optional().describe("Unit for the recorded value"),
  notes: z.string().max(2000).optional().describe("Optional notes for the entry"),
  entry_date: dateSchema,
}).strict();

const listCategoriesSchema = z.object({
  action: z.literal("list_categories"),
}).strict();

const createCategorySchema = z.object({
  action: z.literal("create_category"),
  category_name: z.string().min(1).max(200).describe("Name of the custom category"),
  unit: z.string().max(50).optional().describe("Unit for the new category"),
}).strict();

const logMoodSchema = z.object({
  action: z.literal("log_mood"),
  mood_value: z.coerce.number().int().min(1).max(10).describe("Mood score (1-10)"),
  notes: z.string().max(2000).optional().describe("Optional notes about the mood"),
  entry_date: dateSchema,
}).strict();

const logFastingSchema = z.object({
  action: z.literal("log_fasting"),
  start_time: z.string().describe("Start timestamp of the fasting window (ISO 8601)"),
  end_time: z.string().optional().describe("End timestamp of the fasting window (ISO 8601)"),
  fasting_status: fastingStatusEnum.optional().describe("Current status of the fast"),
  fasting_type: z.string().max(100).optional().describe("Type of fasting (e.g., 'Intermittent')"),
}).strict();

const logSleepSchema = z.object({
  action: z.literal("log_sleep"),
  entry_date: dateSchema,
  duration_seconds: z.coerce.number().min(0).optional().describe("Total sleep duration in seconds"),
  sleep_score: z.coerce.number().int().min(0).max(100).optional().describe("Sleep quality score (0-100)"),
  bedtime: z.string().optional().describe("Bedtime timestamp (ISO 8601)"),
  wake_time: z.string().optional().describe("Wake up timestamp (ISO 8601)"),
  source: z.string().max(100).optional().describe("Source of data (e.g., 'manual', 'Garmin', 'Fitbit')"),
}).strict();

const listCheckinDiarySchema = z.object({
  action: z.literal("list_checkin_diary"),
  entry_date: optionalDateSchema,
}).strict();

export const manageCheckinSchema = z.discriminatedUnion("action", [
  logBiometricsSchema,
  logCustomMetricSchema,
  listCategoriesSchema,
  createCategorySchema,
  logMoodSchema,
  logFastingSchema,
  logSleepSchema,
  listCheckinDiarySchema,
]);

export type ManageCheckinInput = z.infer<typeof manageCheckinSchema>;
