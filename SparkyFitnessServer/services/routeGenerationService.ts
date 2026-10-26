import {
  ROUTE_MAX_CUES,
  labelRouteOptions,
  restrictRouteStyle,
  routesAreDistinct,
  type GeneratedRoutePreview,
  type GenerateRouteBody,
  type GenerateRouteResponse,
  type RouteCue,
} from '@workspace/shared';
import { prepareRoute } from '../utils/routePrep.js';
import {
  INITIAL_WINDING_FACTOR,
  planLoop,
  planOutAndBack,
  scaleFromResult,
} from './routing/loopPlanner.js';
import {
  RoutingProviderError,
  type LatLon,
  type RoutingProvider,
  type RoutingRequest,
  type RoutingResult,
} from './routing/routingProvider.js';

/** How close to the target a loop must land to stop trying. */
const DISTANCE_TOLERANCE = 0.1;
/** Calls to the engine one loop request may spend finding the right size. */
const MAX_LOOP_ATTEMPTS = 3;

/**
 * Headings to try for the candidates, relative to the first. They are spread
 * round the compass so the shapes differ; a pinned heading uses smaller steps
 * so the candidates stay near the direction the person asked for.
 */
const OPEN_OFFSETS = [0, 120, 240, 60, 180];
const PINNED_OFFSETS = [0, -45, 45, -90, 90];

const ACTIVITY_LABEL = { run: 'run', walk: 'walk', ride: 'ride', hike: 'hike' };

function defaultName(
  activity: GenerateRouteBody['activity'],
  distanceM: number
): string {
  return `Generated ${(distanceM / 1000).toFixed(1)} km ${ACTIVITY_LABEL[activity]}`;
}

/** Keeps the cue list inside what the save endpoint accepts. */
function limitCues(cues: RouteCue[]): RouteCue[] {
  if (cues.length <= ROUTE_MAX_CUES) return cues;
  const significant = cues.filter((cue) => cue.kind !== 'straight');
  return significant.slice(0, ROUTE_MAX_CUES);
}

/**
 * Whether the engine is still worth asking for surface data, shared by every
 * attempt of one request. A measurement that comes back empty (most costly
 * when it times out) turns it off, so a slow trace endpoint is paid for once
 * rather than on every resize and fallback heading.
 */
interface SurfaceMeasurement {
  enabled: boolean;
}

async function generateLoop(
  provider: RoutingProvider,
  body: Extract<GenerateRouteBody, { mode: 'loop' }>,
  bearing: number,
  style: RoutingRequest['style'],
  surface: SurfaceMeasurement
): Promise<RoutingResult> {
  const plan = body.shape === 'out_and_back' ? planOutAndBack : planLoop;
  let windingFactor = INITIAL_WINDING_FACTOR;
  let best: RoutingResult | null = null;

  for (let attempt = 0; attempt < MAX_LOOP_ATTEMPTS; attempt++) {
    const locations: LatLon[] = plan(
      body.start,
      body.distanceM,
      bearing,
      windingFactor
    );
    const result = await provider.route({
      locations,
      activity: body.activity,
      style,
      measureSurface: surface.enabled,
    });
    if (result.trailShare === null) surface.enabled = false;
    const error = Math.abs(result.distanceM - body.distanceM);
    if (!best || error < Math.abs(best.distanceM - body.distanceM)) {
      best = result;
    }
    if (error / body.distanceM <= DISTANCE_TOLERANCE) break;
    windingFactor = scaleFromResult(
      windingFactor,
      body.distanceM,
      result.distanceM
    );
  }
  // MAX_LOOP_ATTEMPTS > 0, so a result exists or provider.route threw.
  return best as RoutingResult;
}

/** Thins and measures a routed result exactly as a save would. */
function toPreview(
  result: RoutingResult,
  body: GenerateRouteBody
): GeneratedRoutePreview {
  if (result.points.length < 2) {
    throw new RoutingProviderError('no_route', 'No route could be found');
  }
  // The preview matches what the client gets back after saving it.
  const prepared = prepareRoute(result.points, result.cues);
  return {
    name: body.name ?? defaultName(body.activity, prepared.distanceM),
    activity: body.activity,
    source: 'generated',
    points: prepared.points,
    cues: limitCues(prepared.cues),
    distanceM: prepared.distanceM,
    elevationGainM: prepared.elevationGainM,
  };
}

interface Candidate {
  route: GeneratedRoutePreview;
  trailShare: number | null;
}

/**
 * Up to `count` loops that really differ: the first batch heads out in
 * different directions in parallel; any that overlap an earlier one too much
 * are dropped, and further headings are tried one at a time to make up the
 * number. Failures are tolerated while at least one candidate succeeds.
 */
async function generateLoopCandidates(
  provider: RoutingProvider,
  body: Extract<GenerateRouteBody, { mode: 'loop' }>,
  count: number,
  style: RoutingRequest['style']
): Promise<Candidate[]> {
  const base = body.bearingDeg ?? Math.random() * 360;
  const offsets = body.bearingDeg === undefined ? OPEN_OFFSETS : PINNED_OFFSETS;
  const surface: SurfaceMeasurement = { enabled: count > 1 };
  const accepted: Candidate[] = [];
  let firstFailure: unknown;
  let engineFailing = false;

  const attempt = async (offset: number): Promise<Candidate | null> => {
    try {
      const result = await generateLoop(
        provider,
        body,
        (base + offset + 360) % 360,
        style,
        surface
      );
      return {
        route: toPreview(result, body),
        trailShare: result.trailShare ?? null,
      };
    } catch (error) {
      if (error instanceof RoutingProviderError) {
        firstFailure ??= error;
        if (error.kind !== 'no_route') engineFailing = true;
        return null;
      }
      throw error;
    }
  };
  const accept = (candidate: Candidate | null) => {
    if (
      candidate &&
      accepted.every((other) =>
        routesAreDistinct(candidate.route.points, other.route.points)
      )
    ) {
      accepted.push(candidate);
    }
  };

  for (const candidate of await Promise.all(
    offsets.slice(0, count).map(attempt)
  )) {
    accept(candidate);
  }
  for (const offset of offsets.slice(count)) {
    // Another heading only helps when the engine merely found no route.
    if (accepted.length >= count || engineFailing) break;
    accept(await attempt(offset));
  }

  if (accepted.length === 0) throw firstFailure;
  return accepted;
}

/**
 * Generates preview routes (nothing is stored). A loop request can return
 * several distinct candidates, each labelled only where its numbers stand
 * out. Provider failures surface as `RoutingProviderError`; a result too
 * short to save as `InvalidRouteError`.
 */
export async function generateRoute(
  provider: RoutingProvider,
  body: GenerateRouteBody
): Promise<GenerateRouteResponse> {
  const style = restrictRouteStyle(body.style, provider.capabilities.style);

  let candidates: Candidate[];
  if (body.mode === 'loop') {
    const count = Math.min(
      body.alternatives,
      provider.capabilities.maxAlternatives
    );
    candidates = await generateLoopCandidates(provider, body, count, style);
  } else {
    const result = await provider.route({
      locations: [
        body.start,
        ...body.waypoints,
        ...(body.returnToStart ? [body.start] : []),
      ],
      activity: body.activity,
      style,
    });
    candidates = [{ route: toPreview(result, body), trailShare: null }];
  }

  const labels = labelRouteOptions(
    candidates.map((c) => ({
      distanceM: c.route.distanceM,
      elevationGainM: c.route.elevationGainM,
      trailShare: c.trailShare,
    }))
  );
  const options = candidates.map((c, i) => ({
    route: c.route,
    label: labels[i] ?? null,
    trailShare: c.trailShare,
  }));
  return { route: options[0].route, options };
}
