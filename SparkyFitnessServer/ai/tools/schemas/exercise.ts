import { z } from 'zod';
import {
  dateSchema,
  setTypeEnum,
  paginationSchema,
  uuidSchema,
} from './common.js';

const exerciseSetSchema = z
  .object({
    reps: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of repetitions'),
    weight: z.coerce.number().min(0).optional().describe('Weight in kg'),
    duration: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Duration in seconds'),
    rest_time: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Rest time in seconds'),
    set_type: setTypeEnum.default('Working Set'),
    rpe: z.coerce
      .number()
      .min(0)
      .max(10)
      .optional()
      .describe('Rate of Perceived Exertion (0-10 scale, one decimal allowed)'),
    notes: z.string().max(1000).optional().describe('Note for this set'),
  })
  .strict();

const searchExercisesSchema = z
  .object({
    action: z.literal('search_exercises'),
    searchTerm: z
      .string()
      .min(1)
      .max(200)
      .describe('Name or part of exercise name'),
    muscleGroup: z
      .string()
      .optional()
      .describe("Muscle group filter (e.g., 'Chest', 'Biceps')"),
    equipment: z
      .string()
      .optional()
      .describe("Equipment filter (e.g., 'Dumbbell', 'None')"),
    ...paginationSchema.shape,
  })
  .strict();

const createExerciseSchema = z
  .object({
    action: z.literal('create_exercise'),
    name: z.string().min(1).max(200).describe('Full name for the exercise'),
    category: z
      .string()
      .optional()
      .describe("Category (e.g., 'Strength', 'Cardio')"),
    calories_per_hour: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Estimated calories burned per hour'),
    description: z
      .string()
      .max(1000)
      .optional()
      .describe('Description of the exercise'),
  })
  .strict();

const logExerciseSchema = z
  .object({
    action: z.literal('log_exercise'),
    exercise_id: uuidSchema.optional().describe('UUID of the exercise'),
    exercise_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Name of the exercise (alternative to ID)'),
    entry_date: dateSchema,
    duration_minutes: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Duration in minutes'),
    calories_burned: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Calories burned'),
    notes: z.string().max(2000).optional().describe('Additional notes'),
    distance: z.coerce
      .number()
      .min(0)
      .optional()
      .describe(
        "Distance covered, in the user's distance unit (e.g. km) — for cardio"
      ),
    avg_heart_rate: z.coerce
      .number()
      .int()
      .min(0)
      .max(300)
      .optional()
      .describe('Average heart rate in bpm — for cardio'),
    steps: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Step count for the activity'),
    sets: z
      .union([z.array(exerciseSetSchema), z.string()])
      .optional()
      .describe('Set details as array or JSON string'),
  })
  .strict();

const listExerciseDiarySchema = z
  .object({
    action: z.literal('list_exercise_diary'),
    entry_date: dateSchema,
  })
  .strict();

const getWorkoutPresetsSchema = z
  .object({
    action: z.literal('get_workout_presets'),
  })
  .strict();

const logWorkoutPresetSchema = z
  .object({
    action: z.literal('log_workout_preset'),
    preset_id: uuidSchema.optional().describe('UUID of the workout preset'),
    preset_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Name of the preset (alternative to ID)'),
    entry_date: dateSchema,
  })
  .strict();

const updateExerciseEntrySchema = z
  .object({
    action: z.literal('update_exercise_entry'),
    entry_id: uuidSchema.describe('UUID of the exercise entry to update'),
    entry_date: dateSchema
      .optional()
      .describe('New date for the entry (YYYY-MM-DD)'),
    duration_minutes: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Duration in minutes'),
    calories_burned: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Calories burned'),
    notes: z.string().max(2000).optional().describe('Additional notes'),
    distance: z.coerce
      .number()
      .min(0)
      .optional()
      .describe(
        "Distance covered, in the user's distance unit (e.g. km) — for cardio"
      ),
    avg_heart_rate: z.coerce
      .number()
      .int()
      .min(0)
      .max(300)
      .optional()
      .describe('Average heart rate in bpm — for cardio'),
    steps: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Step count for the activity'),
    sets: z
      .union([z.array(exerciseSetSchema), z.string()])
      .optional()
      .describe(
        'Replacement set details as array or JSON string; replaces all existing sets when provided'
      ),
  })
  .strict();

const deleteExerciseEntrySchema = z
  .object({
    action: z.literal('delete_exercise_entry'),
    entry_id: uuidSchema.describe('UUID of the exercise entry to delete'),
  })
  .strict();

const getExerciseDetailsSchema = z
  .object({
    action: z.literal('get_exercise_details'),
    exercise_id: uuidSchema.optional().describe('UUID of the exercise'),
    exercise_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Name of the exercise (alternative to ID)'),
  })
  .strict();

const createWorkoutPresetSchema = z
  .object({
    action: z.literal('create_workout_preset'),
    name: z.string().min(1).max(200).describe('Name of the workout preset'),
    exercise_ids: z
      .array(uuidSchema)
      .describe('List of exercise UUIDs to include in the preset'),
  })
  .strict();

const getExerciseProgressSchema = z
  .object({
    action: z.literal('get_exercise_progress'),
    exercise_id: uuidSchema.optional().describe('UUID of the exercise'),
    exercise_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Name of the exercise (alternative to ID)'),
    start_date: dateSchema
      .optional()
      .describe('Start date for progress tracking'),
    end_date: dateSchema.optional().describe('End date for progress tracking'),
    ...paginationSchema.shape,
  })
  .strict();

export const manageExerciseSchema = z.discriminatedUnion('action', [
  searchExercisesSchema,
  createExerciseSchema,
  logExerciseSchema,
  listExerciseDiarySchema,
  getWorkoutPresetsSchema,
  logWorkoutPresetSchema,
  updateExerciseEntrySchema,
  deleteExerciseEntrySchema,
  getExerciseDetailsSchema,
  createWorkoutPresetSchema,
  getExerciseProgressSchema,
]);

export type ManageExerciseInput = z.infer<typeof manageExerciseSchema>;

// Flat input shape published to the LLM as `inputSchema`. See comment on
// manageFoodInput in ./food.js for the rationale. Runtime validation still
// uses manageExerciseSchema in the tool handler via safeParse.
export const manageExerciseInput = z.object({
  action: z
    .enum([
      'search_exercises',
      'create_exercise',
      'log_exercise',
      'list_exercise_diary',
      'get_workout_presets',
      'log_workout_preset',
      'update_exercise_entry',
      'delete_exercise_entry',
      'get_exercise_details',
      'create_workout_preset',
      'get_exercise_progress',
    ])
    .describe('Action to perform; see tool description for per-action fields.'),
  // identity
  exercise_id: uuidSchema.optional().describe('Exercise UUID'),
  exercise_name: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Exercise name (alternative to exercise_id)'),
  exercise_ids: z
    .array(uuidSchema)
    .optional()
    .describe('List of exercise UUIDs — for create_workout_preset'),
  name: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Name — for create_exercise / create_workout_preset'),
  // search
  searchTerm: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Search term — required for search_exercises'),
  muscleGroup: z
    .string()
    .optional()
    .describe("Muscle group filter (e.g., 'Chest')"),
  equipment: z
    .string()
    .optional()
    .describe("Equipment filter (e.g., 'Dumbbell', 'None')"),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Pagination limit'),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Pagination offset'),
  // create
  category: z
    .string()
    .optional()
    .describe("Exercise category (e.g., 'Strength', 'Cardio')"),
  calories_per_hour: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('Estimated calories burned per hour'),
  description: z
    .string()
    .max(1000)
    .optional()
    .describe('Description of the exercise'),
  // log
  entry_date: dateSchema.optional().describe('Date for the entry (YYYY-MM-DD)'),
  duration_minutes: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('Duration in minutes'),
  calories_burned: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('Calories burned'),
  notes: z.string().max(2000).optional().describe('Additional notes'),
  distance: z.coerce
    .number()
    .min(0)
    .optional()
    .describe(
      "Distance covered, in the user's distance unit (e.g. km) — cardio, for log/update"
    ),
  avg_heart_rate: z.coerce
    .number()
    .int()
    .min(0)
    .max(300)
    .optional()
    .describe('Average heart rate in bpm — cardio, for log/update'),
  steps: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Step count for the activity — for log/update'),
  sets: z
    .union([
      z.array(
        z.object({
          reps: z.coerce.number().int().min(0).optional(),
          weight: z.coerce.number().min(0).optional(),
          duration: z.coerce.number().min(0).optional(),
          rest_time: z.coerce.number().min(0).optional(),
          set_type: setTypeEnum.optional(),
          rpe: z.coerce.number().min(0).max(10).optional(),
          notes: z.string().max(1000).optional(),
        })
      ),
      z.string(),
    ])
    .optional()
    .describe(
      'Set details as array of objects or JSON string; per-set fields include rpe and notes'
    ),
  // presets
  preset_id: uuidSchema.optional().describe('Workout preset UUID'),
  preset_name: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Workout preset name'),
  // entry management
  entry_id: uuidSchema
    .optional()
    .describe(
      'Exercise diary entry UUID — for update_exercise_entry / delete_exercise_entry'
    ),
  // progress range
  start_date: dateSchema
    .optional()
    .describe('Start date for progress tracking'),
  end_date: dateSchema.optional().describe('End date for progress tracking'),
});
