import { z } from "zod";

export const runProgramsIdSchema = z.string();

export const runProgramsSchema = z.object({
  id: runProgramsIdSchema,
  user_id: z.string(),
  program_id: z.string(),
  name: z.string().nullable(),
  activity: z.enum(["run", "walk"]).nullable(),
  enabled: z.boolean(),
  next_index: z.number(),
  workouts: z.unknown(),
  adjustment_log: z.unknown(),
  effort_log: z.unknown(),
  completion_log: z.unknown(),
  run_days: z.array(z.number()),
  start_date: z.coerce.date().nullable(),
  end_date: z.coerce.date().nullable(),
  last_done_date: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const runProgramsInitializerSchema = z.object({
  id: runProgramsIdSchema.optional(),
  user_id: z.string(),
  program_id: z.string(),
  name: z.string().nullable().optional(),
  activity: z.enum(["run", "walk"]).nullable().optional(),
  enabled: z.boolean().optional().default(true),
  next_index: z.number().optional().default(0),
  workouts: z.unknown().optional(),
  adjustment_log: z.unknown().optional(),
  effort_log: z.unknown().optional(),
  completion_log: z.unknown().optional(),
  run_days: z.array(z.number()).optional(),
  start_date: z.coerce.date().nullable().optional(),
  end_date: z.coerce.date().nullable().optional(),
  last_done_date: z.coerce.date().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const runProgramsMutatorSchema = z.object({
  id: runProgramsIdSchema.optional(),
  user_id: z.string().optional(),
  program_id: z.string().optional(),
  name: z.string().nullable().optional(),
  activity: z.enum(["run", "walk"]).nullable().optional(),
  enabled: z.boolean().optional(),
  next_index: z.number().optional(),
  workouts: z.unknown().optional(),
  adjustment_log: z.unknown().optional(),
  effort_log: z.unknown().optional(),
  completion_log: z.unknown().optional(),
  run_days: z.array(z.number()).optional(),
  start_date: z.coerce.date().nullable().optional(),
  end_date: z.coerce.date().nullable().optional(),
  last_done_date: z.coerce.date().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export type RunPrograms = z.infer<typeof runProgramsSchema>;
export type RunProgramsInitializer = z.infer<
  typeof runProgramsInitializerSchema
>;
export type RunProgramsMutator = z.infer<typeof runProgramsMutatorSchema>;
