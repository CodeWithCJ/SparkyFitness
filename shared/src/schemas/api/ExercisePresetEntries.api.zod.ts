import { z } from "zod";
import {
  exercisePresetEntriesInitializerSchema,
  exercisePresetEntriesMutatorSchema,
  exercisePresetEntriesSchema,
} from "../database/ExercisePresetEntries.zod";
import { exerciseEntriesResponseSchema } from "./ExerciseEntries.api.zod";

export const exercisePresetEntriesResponseSchema =
  exercisePresetEntriesSchema
    .extend({
      entry_date: z.string(),
      created_at: z.string().nullable(),
      updated_at: z.string().nullable(),
      exercises: z.array(exerciseEntriesResponseSchema).optional(),
    })
    .omit({
      created_by_user_id: true,
    });

export const createExercisePresetEntriesRequestSchema =
  exercisePresetEntriesInitializerSchema
    .omit({
      id: true,
      created_at: true,
      updated_at: true,
      created_by_user_id: true,
    })
    .extend({
      entry_date: z.string(),
    });

export const updateExercisePresetEntriesRequestSchema =
  exercisePresetEntriesMutatorSchema
    .omit({
      created_at: true,
      updated_at: true,
      created_by_user_id: true,
    })
    .extend({
      entry_date: z.string().optional(),
    });

export type ExercisePresetEntriesResponse = z.infer<
  typeof exercisePresetEntriesResponseSchema
>;
export type CreateExercisePresetEntriesRequest = z.infer<
  typeof createExercisePresetEntriesRequestSchema
>;
export type UpdateExercisePresetEntriesRequest = z.infer<
  typeof updateExercisePresetEntriesRequestSchema
>;
