import { z } from "zod";

export const userCustomMoodsIdSchema = z.string().or(z.number());

export const userCustomMoodsSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  name: z.string(),
  display_name: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const userCustomMoodsInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  name: z.string().optional(),
  display_name: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const userCustomMoodsMutatorSchema =
  userCustomMoodsInitializerSchema.partial();

export type UserCustomMoods = z.infer<typeof userCustomMoodsSchema>;
export type UserCustomMoodsInitializer = z.infer<
  typeof userCustomMoodsInitializerSchema
>;
export type UserCustomMoodsMutator = z.infer<
  typeof userCustomMoodsMutatorSchema
>;
