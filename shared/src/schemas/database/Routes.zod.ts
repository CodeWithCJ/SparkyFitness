import { z } from 'zod';

export const routesIdSchema = z.string();

export const routeActivitySchema = z.enum(['run', 'walk', 'ride', 'hike']);
export const routeSourceSchema = z.enum([
  'drawn',
  'gpx',
  'activity',
  'generated',
]);

export const routesSchema = z.object({
  id: routesIdSchema,
  user_id: z.string(),
  name: z.string(),
  activity: routeActivitySchema,
  source: routeSourceSchema,
  distance_m: z.number(),
  elevation_gain_m: z.number().nullable(),
  points: z.unknown(),
  cues: z.unknown(),
  source_exercise_entry_id: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const routesInitializerSchema = z.object({
  id: routesIdSchema.optional(),
  user_id: z.string(),
  name: z.string(),
  activity: routeActivitySchema.optional().default('run'),
  source: routeSourceSchema.optional().default('drawn'),
  distance_m: z.number().optional().default(0),
  elevation_gain_m: z.number().nullable().optional(),
  points: z.unknown().optional(),
  cues: z.unknown().optional(),
  source_exercise_entry_id: z.string().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const routesMutatorSchema = z.object({
  id: routesIdSchema.optional(),
  user_id: z.string().optional(),
  name: z.string().optional(),
  activity: routeActivitySchema.optional(),
  source: routeSourceSchema.optional(),
  distance_m: z.number().optional(),
  elevation_gain_m: z.number().nullable().optional(),
  points: z.unknown().optional(),
  cues: z.unknown().optional(),
  source_exercise_entry_id: z.string().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export type Routes = z.infer<typeof routesSchema>;
export type RoutesInitializer = z.infer<typeof routesInitializerSchema>;
export type RoutesMutator = z.infer<typeof routesMutatorSchema>;
