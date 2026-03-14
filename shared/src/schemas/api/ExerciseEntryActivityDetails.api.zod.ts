import { z } from "zod";
import {
  exerciseEntryActivityDetailsInitializerSchema,
  exerciseEntryActivityDetailsMutatorSchema,
  exerciseEntryActivityDetailsSchema,
} from "../database/ExerciseEntryActivityDetails.zod";

export const exerciseEntryActivityDetailsResponseSchema =
  exerciseEntryActivityDetailsSchema
    .extend({
      created_at: z.string().nullable(),
      updated_at: z.string().nullable(),
    })
    .omit({
      created_by_user_id: true,
      updated_by_user_id: true,
    });

export const createExerciseEntryActivityDetailsRequestSchema =
  exerciseEntryActivityDetailsInitializerSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
    created_by_user_id: true,
    updated_by_user_id: true,
  });

export const updateExerciseEntryActivityDetailsRequestSchema =
  exerciseEntryActivityDetailsMutatorSchema.omit({
    created_at: true,
    updated_at: true,
    created_by_user_id: true,
    updated_by_user_id: true,
  });

export type ExerciseEntryActivityDetailsResponse = z.infer<
  typeof exerciseEntryActivityDetailsResponseSchema
>;
export type CreateExerciseEntryActivityDetailsRequest = z.infer<
  typeof createExerciseEntryActivityDetailsRequestSchema
>;
export type UpdateExerciseEntryActivityDetailsRequest = z.infer<
  typeof updateExerciseEntryActivityDetailsRequestSchema
>;
