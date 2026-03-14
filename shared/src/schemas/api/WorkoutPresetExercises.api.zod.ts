import { z } from "zod";
import {
  workoutPresetExercisesInitializerSchema,
  workoutPresetExercisesMutatorSchema,
  workoutPresetExercisesSchema,
} from "../database/WorkoutPresetExercises.zod";
import { exercisesResponseSchema } from "./Exercises.api.zod";
import { workoutPresetExerciseSetsResponseSchema } from "./WorkoutPresetExerciseSets.api.zod";

export const workoutPresetExercisesResponseSchema =
  workoutPresetExercisesSchema.extend({
    created_at: z.string().nullable(),
    updated_at: z.string().nullable(),
    exercise: exercisesResponseSchema.optional(),
    sets: z.array(workoutPresetExerciseSetsResponseSchema).optional(),
  });

export const createWorkoutPresetExercisesRequestSchema =
  workoutPresetExercisesInitializerSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
  });

export const updateWorkoutPresetExercisesRequestSchema =
  workoutPresetExercisesMutatorSchema.omit({
    created_at: true,
    updated_at: true,
  });

export type WorkoutPresetExercisesResponse = z.infer<
  typeof workoutPresetExercisesResponseSchema
>;
export type CreateWorkoutPresetExercisesRequest = z.infer<
  typeof createWorkoutPresetExercisesRequestSchema
>;
export type UpdateWorkoutPresetExercisesRequest = z.infer<
  typeof updateWorkoutPresetExercisesRequestSchema
>;
