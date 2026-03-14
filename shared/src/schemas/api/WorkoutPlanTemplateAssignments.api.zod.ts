import { z } from "zod";
import {
  workoutPlanTemplateAssignmentsInitializerSchema,
  workoutPlanTemplateAssignmentsMutatorSchema,
  workoutPlanTemplateAssignmentsSchema,
} from "../database/WorkoutPlanTemplateAssignments.zod";
import { exercisesResponseSchema } from "./Exercises.api.zod";
import { workoutPlanAssignmentSetsResponseSchema } from "./WorkoutPlanAssignmentSets.api.zod";
import { workoutPresetsResponseSchema } from "./WorkoutPresets.api.zod";

export const workoutPlanTemplateAssignmentsResponseSchema =
  workoutPlanTemplateAssignmentsSchema.extend({
    created_at: z.string().nullable(),
    updated_at: z.string().nullable(),
    sets: z.array(workoutPlanAssignmentSetsResponseSchema).optional(),
    workout_preset: workoutPresetsResponseSchema.optional(),
    exercise: exercisesResponseSchema.optional(),
  });

export const createWorkoutPlanTemplateAssignmentsRequestSchema =
  workoutPlanTemplateAssignmentsInitializerSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
  });

export const updateWorkoutPlanTemplateAssignmentsRequestSchema =
  workoutPlanTemplateAssignmentsMutatorSchema.omit({
    created_at: true,
    updated_at: true,
  });

export type WorkoutPlanTemplateAssignmentsResponse = z.infer<
  typeof workoutPlanTemplateAssignmentsResponseSchema
>;
export type CreateWorkoutPlanTemplateAssignmentsRequest = z.infer<
  typeof createWorkoutPlanTemplateAssignmentsRequestSchema
>;
export type UpdateWorkoutPlanTemplateAssignmentsRequest = z.infer<
  typeof updateWorkoutPlanTemplateAssignmentsRequestSchema
>;
