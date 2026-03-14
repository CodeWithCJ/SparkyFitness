import { z } from "zod";
import {
  exerciseEntrySetsInitializerSchema,
  exerciseEntrySetsMutatorSchema,
  exerciseEntrySetsSchema,
} from "../database/ExerciseEntrySets.zod";

export const exerciseEntrySetsResponseSchema = exerciseEntrySetsSchema.extend({
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export const createExerciseEntrySetsRequestSchema =
  exerciseEntrySetsInitializerSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
  });

export const updateExerciseEntrySetsRequestSchema =
  exerciseEntrySetsMutatorSchema.omit({
    created_at: true,
    updated_at: true,
  });

export type ExerciseEntrySetsResponse = z.infer<typeof exerciseEntrySetsResponseSchema>;
export type CreateExerciseEntrySetsRequest = z.infer<typeof createExerciseEntrySetsRequestSchema>;
export type UpdateExerciseEntrySetsRequest = z.infer<typeof updateExerciseEntrySetsRequestSchema>;
