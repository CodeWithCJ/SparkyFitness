import { z } from "zod";

export const cyclesIdSchema = z.string().or(z.number());

export const cyclesSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  start_date: z.date(),
  end_date: z.date().nullable().optional(),
  period_length: z.number().nullable().optional(),
  cycle_length: z.number().nullable().optional(),
  is_excluded: z.boolean(),
  source: z.string(),
  birth_control_method: z.string().nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const cyclesInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  start_date: z.date().optional(),
  end_date: z.date().nullable().optional(),
  period_length: z.number().nullable().optional(),
  cycle_length: z.number().nullable().optional(),
  is_excluded: z.boolean().optional(),
  source: z.string().optional(),
  birth_control_method: z.string().nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const cyclesMutatorSchema = cyclesInitializerSchema.partial();

export type Cycles = z.infer<typeof cyclesSchema>;
export type CyclesInitializer = z.infer<typeof cyclesInitializerSchema>;
export type CyclesMutator = z.infer<typeof cyclesMutatorSchema>;
