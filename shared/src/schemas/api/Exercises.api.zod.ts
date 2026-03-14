import { z } from "zod";
import {
  exercisesInitializerSchema,
  exercisesMutatorSchema,
  exercisesSchema,
} from "../database/Exercises.zod";

export const exercisesResponseSchema = exercisesSchema.extend({
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export const createExercisesRequestSchema = exercisesInitializerSchema
  .omit({
    id: true,
    created_at: true,
    updated_at: true,
  })
  .extend({
    source: z.string().optional(),
  });

export const updateExercisesRequestSchema = exercisesMutatorSchema.omit({
  created_at: true,
  updated_at: true,
});

export type ExercisesResponse = z.infer<typeof exercisesResponseSchema>;
export type CreateExercisesRequest = z.infer<typeof createExercisesRequestSchema>;
export type UpdateExercisesRequest = z.infer<typeof updateExercisesRequestSchema>;
