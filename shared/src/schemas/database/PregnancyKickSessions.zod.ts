import { z } from "zod";

export const pregnancyKickSessionsIdSchema = z.string().or(z.number());

export const pregnancyKickSessionsSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  pregnancy_id: z.string(),
  started_at: z.date(),
  ended_at: z.date().nullable().optional(),
  kick_count: z.number(),
  kick_times: z.array(z.string()),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const pregnancyKickSessionsInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  pregnancy_id: z.string().optional(),
  started_at: z.date().optional(),
  ended_at: z.date().nullable().optional(),
  kick_count: z.number().optional(),
  kick_times: z.array(z.string()).optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const pregnancyKickSessionsMutatorSchema =
  pregnancyKickSessionsInitializerSchema.partial();

export type PregnancyKickSessions = z.infer<typeof pregnancyKickSessionsSchema>;
export type PregnancyKickSessionsInitializer = z.infer<
  typeof pregnancyKickSessionsInitializerSchema
>;
export type PregnancyKickSessionsMutator = z.infer<
  typeof pregnancyKickSessionsMutatorSchema
>;
