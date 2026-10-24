import { z } from 'zod';
import {
  routeActivitySchema,
  routeSourceSchema,
} from '../database/Routes.zod.ts';

/** The most points a client may send; the server simplifies to far fewer. */
export const ROUTE_MAX_INPUT_POINTS = 50000;
/** The most points a stored route keeps. */
export const ROUTE_MAX_STORED_POINTS = 2000;
/** The most routes one person can keep. */
export const ROUTE_MAX_PER_USER = 200;
/** The largest GPX file (characters) the import endpoint accepts. */
export const ROUTE_MAX_GPX_CHARS = 10_000_000;

export const routePointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** Altitude in metres. */
  alt: z.number().min(-1000).max(10000).optional(),
});

/**
 * A turn instruction. `index` is the point in `points` where it applies, so a
 * device can fire the cue when it gets close to that point.
 */
export const routeCueKindSchema = z.enum([
  'depart',
  'straight',
  'slight_left',
  'left',
  'sharp_left',
  'slight_right',
  'right',
  'sharp_right',
  'uturn',
  'arrive',
]);

export const routeCueSchema = z.object({
  index: z.number().int().min(0),
  kind: routeCueKindSchema,
  text: z.string().trim().max(120).optional(),
  /** Metres from the start of the route to this cue. */
  distanceM: z.number().min(0).optional(),
});

export const routeNameSchema = z.string().trim().min(1).max(100);

export const routeSchema = z.object({
  id: z.string(),
  name: z.string(),
  activity: routeActivitySchema,
  source: routeSourceSchema,
  distanceM: z.number(),
  elevationGainM: z.number().nullable(),
  points: z.array(routePointSchema),
  cues: z.array(routeCueSchema),
  sourceExerciseEntryId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** A route in a list: everything but the (large) points and cues. */
export const routeSummarySchema = routeSchema
  .omit({ points: true, cues: true })
  .extend({
    /** First point, for placing the route on a map. */
    start: routePointSchema.nullable(),
    pointCount: z.number().int(),
  });

export const createRouteBodySchema = z.object({
  name: routeNameSchema,
  activity: routeActivitySchema.default('run'),
  points: z.array(routePointSchema).min(2).max(ROUTE_MAX_INPUT_POINTS),
  cues: z.array(routeCueSchema).max(1000).optional(),
  /**
   * `generated` lets a client save a route it got from the generate endpoint.
   * Defaults to `drawn`; `gpx` and `activity` stay server-assigned.
   */
  source: z.enum(['drawn', 'generated']).default('drawn'),
});

export const updateRouteBodySchema = z
  .object({
    name: routeNameSchema.optional(),
    activity: routeActivitySchema.optional(),
    /** A new line for the route; distance and elevation are recomputed. */
    points: z
      .array(routePointSchema)
      .min(2)
      .max(ROUTE_MAX_INPUT_POINTS)
      .optional(),
    /** Turn cues for the new line. Replaced together with `points`; cleared when omitted. */
    cues: z.array(routeCueSchema).max(1000).optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.activity !== undefined ||
      body.points !== undefined,
    { message: 'Provide a name, an activity or points' }
  )
  .refine((body) => body.cues === undefined || body.points !== undefined, {
    message: 'Cues can only be sent together with points',
    path: ['cues'],
  })
  .refine(
    (body) =>
      body.cues === undefined ||
      body.points === undefined ||
      body.cues.every((cue) => cue.index < body.points!.length),
    {
      message: 'A cue must point at one of the route points',
      path: ['cues'],
    }
  );

export const importGpxRouteBodySchema = z.object({
  gpx: z.string().min(1).max(ROUTE_MAX_GPX_CHARS),
  /** Overrides the name found in the file. */
  name: routeNameSchema.optional(),
  activity: routeActivitySchema.default('run'),
});

export const routeFromActivityBodySchema = z.object({
  name: routeNameSchema.optional(),
  activity: routeActivitySchema.optional(),
});

/** The most cues a saved route keeps (matches `createRouteBodySchema`). */
export const ROUTE_MAX_CUES = 1000;
/** Bounds for a generated loop or out-and-back, in metres. */
export const ROUTE_GENERATE_MIN_DISTANCE_M = 500;
export const ROUTE_GENERATE_MAX_DISTANCE_M = 100_000;
/** The most waypoints a generated route may be routed through. */
export const ROUTE_GENERATE_MAX_WAYPOINTS = 20;
/** The most distinct candidates one loop request may return. */
export const ROUTE_GENERATE_MAX_ALTERNATIVES = 3;

/** What the routing engine is asked to prefer. */
export const routeSurfaceSchema = z.enum(['any', 'trails', 'roads']);
export const routeHillinessSchema = z.enum(['any', 'flat', 'hilly']);

export const routeStyleSchema = z.object({
  surface: routeSurfaceSchema.default('any'),
  hilliness: routeHillinessSchema.default('any'),
  /** Pedestrian activities only; riders are never routed over steps. */
  avoidSteps: z.boolean().default(false),
  avoidBusyRoads: z.boolean().default(false),
});

/**
 * What the server offers this person. Every field after `available` is absent
 * from older servers, so a missing one reads as "not supported". `stops` is
 * reported as unsupported until a stops lookup exists.
 */
export const routeGenerateCapabilitiesSchema = z.object({
  available: z.boolean(),
  /** Candidates a loop request can return (1 = one route only). */
  maxAlternatives: z
    .number()
    .int()
    .min(1)
    .max(ROUTE_GENERATE_MAX_ALTERNATIVES)
    .default(1),
  style: z
    .object({
      surface: z.boolean().default(false),
      hilliness: z.boolean().default(false),
      avoidSteps: z.boolean().default(false),
      avoidBusyRoads: z.boolean().default(false),
    })
    .default({
      surface: false,
      hilliness: false,
      avoidSteps: false,
      avoidBusyRoads: false,
    }),
  /** Whether stops (water, toilets, cafes, viewpoints) can be looked up. */
  stops: z.boolean().default(false),
  /**
   * Where the routing engine comes from: a routing provider the person (or the
   * admin) added in Settings > External Providers. Null when `available` is
   * false.
   */
  source: z.enum(['provider']).nullable().default(null),
});

const generateBaseSchema = z.object({
  /** Where the route starts (and, for loops, ends). */
  start: routePointSchema.pick({ lat: true, lon: true }),
  activity: routeActivitySchema.default('run'),
  name: routeNameSchema.optional(),
  /** Preferences; ignored for any the engine does not support. */
  style: routeStyleSchema.optional(),
});

/** (a) A loop or out-and-back of about `distanceM` from the start. */
export const generateLoopRouteBodySchema = generateBaseSchema.extend({
  mode: z.literal('loop'),
  distanceM: z
    .number()
    .min(ROUTE_GENERATE_MIN_DISTANCE_M)
    .max(ROUTE_GENERATE_MAX_DISTANCE_M),
  shape: z.enum(['loop', 'out_and_back']).default('loop'),
  /** Compass direction (degrees) to head out in; random when omitted. */
  bearingDeg: z.number().min(0).max(360).optional(),
  /** How many distinct candidates to return, at most. */
  alternatives: z
    .number()
    .int()
    .min(1)
    .max(ROUTE_GENERATE_MAX_ALTERNATIVES)
    .default(1),
});

/** (b) An ordered list of waypoints to route through. */
export const generateWaypointsRouteBodySchema = generateBaseSchema.extend({
  mode: z.literal('waypoints'),
  waypoints: z
    .array(routePointSchema.pick({ lat: true, lon: true }))
    .min(1)
    .max(ROUTE_GENERATE_MAX_WAYPOINTS),
  /** Finish back at the start instead of the last waypoint. */
  returnToStart: z.boolean().default(false),
});

export const generateRouteBodySchema = z.discriminatedUnion('mode', [
  generateLoopRouteBodySchema,
  generateWaypointsRouteBodySchema,
]);

/**
 * A route that has been generated but not saved. Every field is what
 * `POST /api/v2/routes` accepts, so the client can save it as returned.
 */
export const generatedRoutePreviewSchema = z.object({
  name: routeNameSchema,
  activity: routeActivitySchema,
  source: z.literal('generated'),
  points: z.array(routePointSchema),
  cues: z.array(routeCueSchema),
  distanceM: z.number(),
  elevationGainM: z.number().nullable(),
});

/** Said of a candidate only when its numbers beat the others'. */
export const routeOptionLabelSchema = z.enum([
  'flatter',
  'moreTrail',
  'shorter',
]);

export const generatedRouteOptionSchema = z.object({
  route: generatedRoutePreviewSchema,
  label: routeOptionLabelSchema.nullable(),
  /** Share (0 to 1) of the route on paths and unpaved ways, when known. */
  trailShare: z.number().min(0).max(1).nullable(),
});

/** `route` is the first option, so a client that ignores `options` still works. */
export const generateRouteResponseSchema = z.object({
  route: generatedRoutePreviewSchema,
  options: z.array(generatedRouteOptionSchema).min(1),
});

export type RoutePoint = z.infer<typeof routePointSchema>;
export type RouteCueKind = z.infer<typeof routeCueKindSchema>;
export type RouteCue = z.infer<typeof routeCueSchema>;
export type Route = z.infer<typeof routeSchema>;
export type RouteSummary = z.infer<typeof routeSummarySchema>;
export type CreateRouteBody = z.infer<typeof createRouteBodySchema>;
export type UpdateRouteBody = z.infer<typeof updateRouteBodySchema>;
export type ImportGpxRouteBody = z.infer<typeof importGpxRouteBodySchema>;
export type RouteFromActivityBody = z.infer<typeof routeFromActivityBodySchema>;
export type RouteGenerateCapabilities = z.infer<
  typeof routeGenerateCapabilitiesSchema
>;
export type GenerateRouteBody = z.infer<typeof generateRouteBodySchema>;
export type GeneratedRoutePreview = z.infer<typeof generatedRoutePreviewSchema>;
export type GenerateRouteResponse = z.infer<typeof generateRouteResponseSchema>;
export type RouteStyle = z.infer<typeof routeStyleSchema>;
export type RouteSurface = z.infer<typeof routeSurfaceSchema>;
export type RouteHilliness = z.infer<typeof routeHillinessSchema>;
export type RouteOptionLabel = z.infer<typeof routeOptionLabelSchema>;
export type GeneratedRouteOption = z.infer<typeof generatedRouteOptionSchema>;
