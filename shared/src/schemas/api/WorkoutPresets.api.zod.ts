import { z } from "zod";
import {
  workoutPresetsInitializerSchema,
  workoutPresetsMutatorSchema,
  workoutPresetsSchema,
} from "../database/WorkoutPresets.zod";
import { workoutPresetExercisesResponseSchema } from "./WorkoutPresetExercises.api.zod";

export const workoutPresetsResponseSchema = workoutPresetsSchema.extend({
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  exercises: z.array(workoutPresetExercisesResponseSchema).optional(),
});

export const createWorkoutPresetsRequestSchema =
  workoutPresetsInitializerSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
  });

export const updateWorkoutPresetsRequestSchema = workoutPresetsMutatorSchema.omit(
  {
    created_at: true,
    updated_at: true,
  },
);

export type WorkoutPresetsResponse = z.infer<typeof workoutPresetsResponseSchema>;
export type CreateWorkoutPresetsRequest = z.infer<typeof createWorkoutPresetsRequestSchema>;
export type UpdateWorkoutPresetsRequest = z.infer<typeof updateWorkoutPresetsRequestSchema>;
