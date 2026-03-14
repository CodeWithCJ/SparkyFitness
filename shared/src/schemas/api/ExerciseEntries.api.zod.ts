import { z } from "zod";
import {
  exerciseEntriesInitializerSchema,
  exerciseEntriesMutatorSchema,
  exerciseEntriesSchema,
} from "../database/ExerciseEntries.zod";
import { exerciseEntrySetsResponseSchema } from "./ExerciseEntrySets.api.zod";
import { exerciseEntryActivityDetailsResponseSchema } from "./ExerciseEntryActivityDetails.api.zod";

export const exerciseEntriesResponseSchema = exerciseEntriesSchema
  .extend({
    entry_date: z.string().nullable(),
    created_at: z.string().nullable(),
    updated_at: z.string(),
    sets: z.array(exerciseEntrySetsResponseSchema).optional(),
    activity_details: z.array(exerciseEntryActivityDetailsResponseSchema).optional(),
  })
  .omit({
    created_by_user_id: true,
    updated_by_user_id: true,
  });

export const createExerciseEntriesRequestSchema =
  exerciseEntriesInitializerSchema
    .omit({
      id: true,
      created_at: true,
      updated_at: true,
      created_by_user_id: true,
      updated_by_user_id: true,
    })
    .extend({
      entry_date: z.string().optional().nullable(),
    });

export const updateExerciseEntriesRequestSchema =
  exerciseEntriesMutatorSchema
    .omit({
      created_at: true,
      updated_at: true,
      created_by_user_id: true,
      updated_by_user_id: true,
    })
    .extend({
      entry_date: z.string().optional().nullable(),
    });

export type ExerciseEntriesResponse = z.infer<typeof exerciseEntriesResponseSchema>;
export type CreateExerciseEntriesRequest = z.infer<typeof createExerciseEntriesRequestSchema>;
export type UpdateExerciseEntriesRequest = z.infer<typeof updateExerciseEntriesRequestSchema>;
