import { z } from "zod";

export const userDashboardLayoutsIdSchema = z.string().or(z.number());

export const userDashboardLayoutsSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  page_key: z.string(),
  layout: z.unknown(),
  hidden: z.unknown(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const userDashboardLayoutsInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  page_key: z.string().optional(),
  layout: z.unknown().optional(),
  hidden: z.unknown().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const userDashboardLayoutsMutatorSchema =
  userDashboardLayoutsInitializerSchema.partial();

export type UserDashboardLayouts = z.infer<typeof userDashboardLayoutsSchema>;
export type UserDashboardLayoutsInitializer = z.infer<
  typeof userDashboardLayoutsInitializerSchema
>;
export type UserDashboardLayoutsMutator = z.infer<
  typeof userDashboardLayoutsMutatorSchema
>;
