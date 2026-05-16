import { z } from "zod";
import { dateSchema, setTypeEnum, paginationSchema, uuidSchema } from "./common.js";

const exerciseSetSchema = z.object({
  reps: z.coerce.number().int().min(0).optional().describe("Number of repetitions"),
  weight: z.coerce.number().min(0).optional().describe("Weight in kg"),
  duration: z.coerce.number().min(0).optional().describe("Duration in seconds"),
  rest_time: z.coerce.number().min(0).optional().describe("Rest time in seconds"),
  set_type: setTypeEnum.default("Working Set"),
}).strict();

const searchExercisesSchema = z.object({
  action: z.literal("search_exercises"),
  searchTerm: z.string().min(1).max(200).describe("Name or part of exercise name"),
  muscleGroup: z.string().optional().describe("Muscle group filter (e.g., 'Chest', 'Biceps')"),
  equipment: z.string().optional().describe("Equipment filter (e.g., 'Dumbbell', 'None')"),
  ...paginationSchema.shape,
}).strict();

const createExerciseSchema = z.object({
  action: z.literal("create_exercise"),
  name: z.string().min(1).max(200).describe("Full name for the exercise"),
  category: z.string().optional().describe("Category (e.g., 'Strength', 'Cardio')"),
  calories_per_hour: z.coerce.number().min(0).optional().describe("Estimated calories burned per hour"),
  description: z.string().max(1000).optional().describe("Description of the exercise"),
}).strict();

const logExerciseSchema = z.object({
  action: z.literal("log_exercise"),
  exercise_id: uuidSchema.optional().describe("UUID of the exercise"),
  exercise_name: z.string().min(1).max(200).optional().describe("Name of the exercise (alternative to ID)"),
  entry_date: dateSchema,
  duration_minutes: z.coerce.number().min(0).optional().describe("Duration in minutes"),
  calories_burned: z.coerce.number().min(0).optional().describe("Calories burned"),
  notes: z.string().max(2000).optional().describe("Additional notes"),
  sets: z.union([z.array(exerciseSetSchema), z.string()]).optional().describe("Set details as array or JSON string"),
}).strict();

const listExerciseDiarySchema = z.object({
  action: z.literal("list_exercise_diary"),
  entry_date: dateSchema,
}).strict();

const getWorkoutPresetsSchema = z.object({
  action: z.literal("get_workout_presets"),
}).strict();

const logWorkoutPresetSchema = z.object({
  action: z.literal("log_workout_preset"),
  preset_id: uuidSchema.optional().describe("UUID of the workout preset"),
  preset_name: z.string().min(1).max(200).optional().describe("Name of the preset (alternative to ID)"),
  entry_date: dateSchema,
}).strict();

const deleteExerciseEntrySchema = z.object({
  action: z.literal("delete_exercise_entry"),
  entry_id: uuidSchema.describe("UUID of the exercise entry to delete"),
}).strict();

const getExerciseDetailsSchema = z.object({
  action: z.literal("get_exercise_details"),
  exercise_id: uuidSchema.optional().describe("UUID of the exercise"),
  exercise_name: z.string().min(1).max(200).optional().describe("Name of the exercise (alternative to ID)"),
}).strict();

const createWorkoutPresetSchema = z.object({
  action: z.literal("create_workout_preset"),
  name: z.string().min(1).max(200).describe("Name of the workout preset"),
  exercise_ids: z.array(uuidSchema).describe("List of exercise UUIDs to include in the preset"),
}).strict();

const getExerciseProgressSchema = z.object({
  action: z.literal("get_exercise_progress"),
  exercise_id: uuidSchema.optional().describe("UUID of the exercise"),
  exercise_name: z.string().min(1).max(200).optional().describe("Name of the exercise (alternative to ID)"),
  start_date: dateSchema.optional().describe("Start date for progress tracking"),
  end_date: dateSchema.optional().describe("End date for progress tracking"),
}).strict();

export const manageExerciseSchema = z.discriminatedUnion("action", [
  searchExercisesSchema,
  createExerciseSchema,
  logExerciseSchema,
  listExerciseDiarySchema,
  getWorkoutPresetsSchema,
  logWorkoutPresetSchema,
  deleteExerciseEntrySchema,
  getExerciseDetailsSchema,
  createWorkoutPresetSchema,
  getExerciseProgressSchema,
]);

export type ManageExerciseInput = z.infer<typeof manageExerciseSchema>;
