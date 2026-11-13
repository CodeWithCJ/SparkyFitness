import { z } from 'zod';

export const symptomFreeDaysIdSchema = z.string().or(z.number());

export const symptomFreeDaysSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  entry_date: z.date(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const symptomFreeDaysInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  entry_date: z.date().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const symptomFreeDaysMutatorSchema =
  symptomFreeDaysInitializerSchema.partial();

export type SymptomFreeDays = z.infer<typeof symptomFreeDaysSchema>;
export type SymptomFreeDaysInitializer = z.infer<
  typeof symptomFreeDaysInitializerSchema
>;
export type SymptomFreeDaysMutator = z.infer<
  typeof symptomFreeDaysMutatorSchema
>;
