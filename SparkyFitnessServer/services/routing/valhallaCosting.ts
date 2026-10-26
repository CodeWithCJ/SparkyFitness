import type { RouteStyle } from '@workspace/shared';
import type { RoutingActivity } from './routingProvider.js';

type CostingOptions = Record<string, number>;

/** Seconds of extra cost per flight of steps; Valhalla's own default is 30. */
const AVOID_STEPS_PENALTY_S = 600;

function pedestrianOptions(style: RouteStyle): CostingOptions {
  const options: CostingOptions = {};
  if (style.surface === 'trails') {
    options.walkway_factor = 0.5;
    options.sidewalk_factor = 2;
    options.use_tracks = 1;
  } else if (style.surface === 'roads') {
    options.use_tracks = 0;
    options.sidewalk_factor = 0.7;
  }
  if (style.hilliness === 'flat') options.use_hills = 0;
  if (style.hilliness === 'hilly') options.use_hills = 1;
  if (style.avoidSteps) options.step_penalty = AVOID_STEPS_PENALTY_S;
  if (style.avoidBusyRoads) {
    options.use_living_streets = 1;
    options.walkway_factor = Math.min(options.walkway_factor ?? 1, 0.7);
  }
  return options;
}

function bicycleOptions(style: RouteStyle): CostingOptions {
  const options: CostingOptions = {};
  if (style.surface === 'trails') {
    options.use_roads = 0.1;
    options.avoid_bad_surfaces = 0;
  } else if (style.surface === 'roads') {
    options.use_roads = 0.8;
    options.avoid_bad_surfaces = 1;
  }
  if (style.hilliness === 'flat') options.use_hills = 0;
  if (style.hilliness === 'hilly') options.use_hills = 1;
  if (style.avoidBusyRoads) {
    options.use_roads = Math.min(options.use_roads ?? 0.5, 0.25);
    options.use_living_streets = 1;
  }
  // Steps are never on a cycling route, so `avoidSteps` has nothing to add.
  return options;
}

/**
 * Valhalla's `costing_options` for a style, or undefined when the style
 * changes nothing (so a request without preferences is sent exactly as before).
 */
export function valhallaCostingOptions(
  activity: RoutingActivity,
  style: RouteStyle | undefined
): Record<string, CostingOptions> | undefined {
  if (!style) return undefined;
  const costing = activity === 'ride' ? 'bicycle' : 'pedestrian';
  const options =
    costing === 'bicycle' ? bicycleOptions(style) : pedestrianOptions(style);
  return Object.keys(options).length > 0 ? { [costing]: options } : undefined;
}

/** Edge `use` values that are paths rather than roads. */
const TRAIL_USES = new Set(['path', 'track', 'bridleway', 'mountain_bike']);
/** Edge `surface` values that are not paved. */
const UNPAVED_SURFACES = new Set(['compacted', 'dirt', 'gravel', 'path']);

export interface ValhallaEdge {
  length?: number;
  use?: string;
  surface?: string;
}

/** The share (0 to 1) of the edges' length that is path or unpaved; null if unknowable. */
export function trailShareFromEdges(
  edges: readonly ValhallaEdge[]
): number | null {
  let total = 0;
  let trail = 0;
  for (const edge of edges) {
    const length = edge.length;
    if (typeof length !== 'number' || !(length > 0)) continue;
    total += length;
    if (
      (edge.use !== undefined && TRAIL_USES.has(edge.use)) ||
      (edge.surface !== undefined && UNPAVED_SURFACES.has(edge.surface))
    ) {
      trail += length;
    }
  }
  return total > 0 ? trail / total : null;
}
