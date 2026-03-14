import { z } from "zod";
import {
  workoutPlanTemplatesInitializerSchema,
  workoutPlanTemplatesMutatorSchema,
  workoutPlanTemplatesSchema,
} from "../database/WorkoutPlanTemplates.zod";
import { workoutPlanTemplateAssignmentsResponseSchema } from "./WorkoutPlanTemplateAssignments.api.zod";

export const workoutPlanTemplatesResponseSchema =
  workoutPlanTemplatesSchema.extend({
    start_date: z.string().nullable(),
    end_date: z.string().nullable(),
    created_at: z.string().nullable(),
    updated_at: z.string().nullable(),
    assignments: z.array(workoutPlanTemplateAssignmentsResponseSchema).optional(),
  });

export const createWorkoutPlanTemplatesRequestSchema =
  workoutPlanTemplatesInitializerSchema
    .omit({
      id: true,
      created_at: true,
      updated_at: true,
    })
    .extend({
      start_date: z.string().optional().nullable(),
      end_date: z.string().optional().nullable(),
    });

export const updateWorkoutPlanTemplatesRequestSchema =
  workoutPlanTemplatesMutatorSchema
    .omit({
      created_at: true,
      updated_at: true,
    })
    .extend({
      start_date: z.string().optional().nullable(),
      end_date: z.string().optional().nullable(),
    });

export type WorkoutPlanTemplatesResponse = z.infer<
  typeof workoutPlanTemplatesResponseSchema
>;
export type CreateWorkoutPlanTemplatesRequest = z.infer<
  typeof createWorkoutPlanTemplatesRequestSchema
>;
export type UpdateWorkoutPlanTemplatesRequest = z.infer<
  typeof updateWorkoutPlanTemplatesRequestSchema
>;
