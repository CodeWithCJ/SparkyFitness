import { z } from "zod";
import {
  workoutPresetExerciseSetsInitializerSchema,
  workoutPresetExerciseSetsMutatorSchema,
  workoutPresetExerciseSetsSchema,
} from "../database/WorkoutPresetExerciseSets.zod";

export const workoutPresetExerciseSetsResponseSchema =
  workoutPresetExerciseSetsSchema.extend({
    created_at: z.string().nullable(),
    updated_at: z.string().nullable(),
  });

export const createWorkoutPresetExerciseSetsRequestSchema =
  workoutPresetExerciseSetsInitializerSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
  });

export const updateWorkoutPresetExerciseSetsRequestSchema =
  workoutPresetExerciseSetsMutatorSchema.omit({
    created_at: true,
    updated_at: true,
  });

export type WorkoutPresetExerciseSetsResponse = z.infer<
  typeof workoutPresetExerciseSetsResponseSchema
>;
export type CreateWorkoutPresetExerciseSetsRequest = z.infer<
  typeof createWorkoutPresetExerciseSetsRequestSchema
>;
export type UpdateWorkoutPresetExerciseSetsRequest = z.infer<
  typeof updateWorkoutPresetExerciseSetsRequestSchema
>;
