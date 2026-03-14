import { z } from "zod";
import {
  workoutPlanAssignmentSetsInitializerSchema,
  workoutPlanAssignmentSetsMutatorSchema,
  workoutPlanAssignmentSetsSchema,
} from "../database/WorkoutPlanAssignmentSets.zod";

export const workoutPlanAssignmentSetsResponseSchema =
  workoutPlanAssignmentSetsSchema.extend({
    created_at: z.string().nullable(),
    updated_at: z.string().nullable(),
  });

export const createWorkoutPlanAssignmentSetsRequestSchema =
  workoutPlanAssignmentSetsInitializerSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
  });

export const updateWorkoutPlanAssignmentSetsRequestSchema =
  workoutPlanAssignmentSetsMutatorSchema.omit({
    created_at: true,
    updated_at: true,
  });

export type WorkoutPlanAssignmentSetsResponse = z.infer<
  typeof workoutPlanAssignmentSetsResponseSchema
>;
export type CreateWorkoutPlanAssignmentSetsRequest = z.infer<
  typeof createWorkoutPlanAssignmentSetsRequestSchema
>;
export type UpdateWorkoutPlanAssignmentSetsRequest = z.infer<
  typeof updateWorkoutPlanAssignmentSetsRequestSchema
>;
