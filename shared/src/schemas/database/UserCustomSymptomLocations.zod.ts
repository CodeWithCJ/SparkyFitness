import { z } from "zod";

export const userCustomSymptomLocationsIdSchema = z.string().or(z.number());

export const userCustomSymptomLocationsSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  name: z.string(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const userCustomSymptomLocationsInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  name: z.string().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const userCustomSymptomLocationsMutatorSchema =
  userCustomSymptomLocationsInitializerSchema.partial();

export type UserCustomSymptomLocations = z.infer<
  typeof userCustomSymptomLocationsSchema
>;
export type UserCustomSymptomLocationsInitializer = z.infer<
  typeof userCustomSymptomLocationsInitializerSchema
>;
export type UserCustomSymptomLocationsMutator = z.infer<
  typeof userCustomSymptomLocationsMutatorSchema
>;
