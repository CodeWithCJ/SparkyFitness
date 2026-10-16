import { z } from "zod";

export const customRunProgramsIdSchema = z.string();

export const customRunProgramsSchema = z.object({
  id: customRunProgramsIdSchema,
  user_id: z.string(),
  name: z.string(),
  activity: z.enum(["run", "walk"]),
  workouts: z.unknown(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const customRunProgramsInitializerSchema = z.object({
  id: customRunProgramsIdSchema.optional(),
  user_id: z.string(),
  name: z.string(),
  activity: z.enum(["run", "walk"]).optional().default("run"),
  workouts: z.unknown().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const customRunProgramsMutatorSchema = z.object({
  id: customRunProgramsIdSchema.optional(),
  user_id: z.string().optional(),
  name: z.string().optional(),
  activity: z.enum(["run", "walk"]).optional(),
  workouts: z.unknown().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export type CustomRunPrograms = z.infer<typeof customRunProgramsSchema>;
export type CustomRunProgramsInitializer = z.infer<
  typeof customRunProgramsInitializerSchema
>;
export type CustomRunProgramsMutator = z.infer<
  typeof customRunProgramsMutatorSchema
>;
