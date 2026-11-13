import http from 'node:http';
import https from 'node:https';
import type net from 'node:net';
import axios, { isAxiosError } from 'axios';
import { z } from 'zod';
import {
  ROUTE_GENERATE_MAX_WAYPOINTS,
  type RoutePoint,
} from '@workspace/shared';
import { log } from '../../config/logging.js';
import pkg from '../../package.json' with { type: 'json' };
import {
  MAX_ROUTE_MANEUVERS,
  mapValhallaLegs,
  type ValhallaLeg,
} from './valhallaManeuvers.js';
import {
  trailShareFromEdges,
  valhallaCostingOptions,
} from './valhallaCosting.js';
import {
  RoutingProviderError,
  type RoutingActivity,
  type RoutingProvider,
  type RoutingRequest,
  type RoutingResult,
} from './routingProvider.js';

export interface ValhallaProviderOptions {
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
  /**
   * Resolves the server's hostname for every connection. Set for a
   * user-added URL under the public-only network policy, so a name that later
   * points at an internal address is refused when it is used, not just when
   * it was saved.
   */
  lookup?: net.LookupFunction;
}

/**
 * Public Valhalla servers ask clients to identify themselves, so every
 * request says who is calling and where to read about it.
 */
export const ROUTING_USER_AGENT = `SparkyFitness/${pkg.version} (route generation; https://github.com/CodeWithCJ/SparkyFitness)`;

const COSTING: Record<RoutingActivity, 'pedestrian' | 'bicycle'> = {
  run: 'pedestrian',
  walk: 'pedestrian',
  hike: 'pedestrian',
  ride: 'bicycle',
};

/** Valhalla error codes that mean "no route here" rather than "bad request". */
const NO_ROUTE_ERROR_CODES = new Set([171, 442, 443, 444]);

/**
 * What one engine answer may cost. A polyline spends at least two characters
 * on a point, so an unbounded string can expand into tens of millions of
 * point objects on the server's only thread. These sit well above what the
 * generate endpoint itself asks for: a leg per waypoint plus the start and
 * the return, a point every few metres over 100 km, and a cue per turn.
 */
const MAX_ROUTE_LEGS = ROUTE_GENERATE_MAX_WAYPOINTS + 2;
const MAX_LEG_SHAPE_CHARS = 400_000;
const MAX_ROUTE_RESPONSE_BYTES = 8 * 1024 * 1024;
/** A traced route has at most one edge per shape point, so this sits above any leg we accept. */
const MAX_TRACE_EDGES = 50_000;

const routeResponseSchema = z.object({
  trip: z.object({
    summary: z.object({ length: z.number() }),
    legs: z
      .array(
        z.object({
          shape: z.string().max(MAX_LEG_SHAPE_CHARS),
          maneuvers: z
            .array(
              z.object({
                type: z.number(),
                instruction: z.string().optional(),
                length: z.number().optional(),
                begin_shape_index: z.number().optional(),
              })
            )
            .max(MAX_ROUTE_MANEUVERS),
        })
      )
      .min(1)
      .max(MAX_ROUTE_LEGS),
  }),
});

const heightResponseSchema = z.object({ height: z.array(z.number()) });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether an engine answer is small enough to be worth validating. The
 * schema's own `.max()` limits do not bound the work: Zod visits every entry
 * of an array and records an issue object for each bad one, so a body full of
 * tiny bad entries costs gigabytes before the answer is refused. Counting
 * first (array lengths and string lengths are constant time) is what keeps
 * that bounded, whatever the body holds.
 */
function isBoundedRouteAnswer(data: unknown): boolean {
  if (!isRecord(data) || !isRecord(data.trip)) return false;
  const { legs } = data.trip;
  if (!Array.isArray(legs) || legs.length > MAX_ROUTE_LEGS) return false;
  let maneuvers = 0;
  for (const leg of legs as unknown[]) {
    if (!isRecord(leg)) continue;
    if (
      typeof leg.shape === 'string' &&
      leg.shape.length > MAX_LEG_SHAPE_CHARS
    ) {
      return false;
    }
    if (Array.isArray(leg.maneuvers)) {
      maneuvers += leg.maneuvers.length;
      if (maneuvers > MAX_ROUTE_MANEUVERS) return false;
    }
  }
  return true;
}

/** The elevation answer must hold exactly one height per point, so count that first. */
function isBoundedHeightAnswer(data: unknown, pointCount: number): boolean {
  return (
    isRecord(data) &&
    Array.isArray(data.height) &&
    data.height.length === pointCount
  );
}

const traceResponseSchema = z.object({
  edges: z
    .array(
      z.object({
        length: z.number().optional(),
        use: z.string().optional(),
        surface: z.string().optional(),
      })
    )
    .max(MAX_TRACE_EDGES),
});

/** Count the edges before Zod visits them, as for the route answer above. */
function isBoundedTraceAnswer(data: unknown): boolean {
  return (
    isRecord(data) &&
    Array.isArray(data.edges) &&
    data.edges.length <= MAX_TRACE_EDGES
  );
}

const errorBodySchema = z.object({ error_code: z.number() });

function failureFromAxios(error: unknown): RoutingProviderError {
  if (!isAxiosError(error)) {
    return new RoutingProviderError('bad_response', 'Unexpected routing error');
  }
  // Never log or forward `error` itself: its config holds the API key.
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return new RoutingProviderError('timeout', 'The routing engine timed out');
  }
  const status = error.response?.status;
  if (status === undefined) {
    return new RoutingProviderError(
      'unreachable',
      'The routing engine could not be reached'
    );
  }
  if (status === 400) {
    const body = errorBodySchema.safeParse(error.response?.data);
    if (body.success && NO_ROUTE_ERROR_CODES.has(body.data.error_code)) {
      return new RoutingProviderError('no_route', 'No route could be found');
    }
  }
  if (status === 401 || status === 403) {
    return new RoutingProviderError(
      'rejected',
      'The routing engine refused our credentials'
    );
  }
  if (status === 429) {
    return new RoutingProviderError(
      'rejected',
      'The routing engine is rate limiting this server'
    );
  }
  return new RoutingProviderError(
    status >= 500 ? 'unreachable' : 'rejected',
    `The routing engine answered with status ${status}`
  );
}

export function createValhallaProvider(
  options: ValhallaProviderOptions
): RoutingProvider {
  const base = options.baseUrl.replace(/\/+$/, '');
  const config = {
    timeout: options.timeoutMs,
    headers: { 'User-Agent': ROUTING_USER_AGENT },
    ...(options.lookup
      ? {
          httpAgent: new http.Agent({ lookup: options.lookup }),
          httpsAgent: new https.Agent({ lookup: options.lookup }),
        }
      : {}),
    // The key travels as `api_key`, the convention of hosted Valhalla
    // services; self-hosted engines ignore it.
    params: options.apiKey ? { api_key: options.apiKey } : undefined,
    maxContentLength: MAX_ROUTE_RESPONSE_BYTES,
    maxRedirects: 0,
  };

  /** Best effort: a missing elevation model must not fail the route. */
  async function fetchElevations(
    shape: string,
    pointCount: number
  ): Promise<number[] | null> {
    try {
      const response = await axios.post(
        `${base}/height`,
        { encoded_polyline: shape, shape_format: 'polyline6', range: false },
        config
      );
      if (!isBoundedHeightAnswer(response.data, pointCount)) return null;
      const parsed = heightResponseSchema.safeParse(response.data);
      if (!parsed.success || parsed.data.height.length !== pointCount) {
        return null;
      }
      // Valhalla fills gaps in its elevation model with -32768; a route with
      // holes in it is better off with no elevation than a wrong one.
      return parsed.data.height.every((h) => h >= -1000 && h <= 10000)
        ? parsed.data.height
        : null;
    } catch {
      log('debug', 'Routing engine returned no elevation data');
      return null;
    }
  }

  /** Best effort: no surface data just means no "more trail" label. */
  async function fetchTrailShare(
    shape: string,
    costing: string
  ): Promise<number | null> {
    try {
      const response = await axios.post(
        `${base}/trace_attributes`,
        {
          encoded_polyline: shape,
          shape_match: 'edge_walk',
          costing,
          filters: {
            attributes: ['edge.length', 'edge.use', 'edge.surface'],
            action: 'include',
          },
        },
        config
      );
      if (!isBoundedTraceAnswer(response.data)) return null;
      const parsed = traceResponseSchema.safeParse(response.data);
      return parsed.success ? trailShareFromEdges(parsed.data.edges) : null;
    } catch {
      log('debug', 'Routing engine returned no surface data');
      return null;
    }
  }

  return {
    kind: 'valhalla',
    capabilities: {
      style: {
        surface: true,
        hilliness: true,
        avoidSteps: true,
        avoidBusyRoads: true,
      },
      maxAlternatives: 3,
    },
    async route(request: RoutingRequest): Promise<RoutingResult> {
      const last = request.locations.length - 1;
      const body = {
        locations: request.locations.map((location, i) => ({
          lat: location.lat,
          lon: location.lon,
          // Via points should not split the route into legs with their own
          // arrive/depart instructions.
          type: i === 0 || i === last ? 'break' : 'through',
        })),
        costing: COSTING[request.activity],
        costing_options: valhallaCostingOptions(
          request.activity,
          request.style
        ),
        directions_options: { units: 'kilometers', language: 'en-US' },
      };

      let data: unknown;
      try {
        data = (await axios.post(`${base}/route`, body, config)).data;
      } catch (error) {
        const failure = failureFromAxios(error);
        log('warn', `Routing request failed (${failure.kind})`);
        throw failure;
      }

      const parsed = isBoundedRouteAnswer(data)
        ? routeResponseSchema.safeParse(data)
        : null;
      if (parsed === null || !parsed.success) {
        throw new RoutingProviderError(
          'bad_response',
          'The routing engine returned an unreadable route'
        );
      }

      const legs: ValhallaLeg[] = parsed.data.trip.legs;
      let mapped: ReturnType<typeof mapValhallaLegs>;
      try {
        mapped = mapValhallaLegs(legs);
      } catch {
        throw new RoutingProviderError(
          'bad_response',
          'The routing engine returned an unreadable route shape'
        );
      }

      let points: RoutePoint[] = mapped.points;
      // Elevation is only requested for single-leg answers, whose shape can
      // be passed to /height as returned.
      if (legs.length === 1) {
        const heights = await fetchElevations(legs[0].shape, points.length);
        if (heights) {
          points = points.map((point, i) => ({ ...point, alt: heights[i] }));
        }
      }

      let trailShare: number | null | undefined;
      if (request.measureSurface && legs.length === 1) {
        trailShare = await fetchTrailShare(
          legs[0].shape,
          COSTING[request.activity]
        );
      }

      return {
        points,
        cues: mapped.cues,
        distanceM: parsed.data.trip.summary.length * 1000,
        trailShare,
      };
    },
  };
}
