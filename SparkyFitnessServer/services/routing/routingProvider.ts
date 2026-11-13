import type {
  RouteCue,
  RouteGenerateCapabilities,
  RoutePoint,
  RouteStyle,
} from '@workspace/shared';

export type RoutingActivity = 'run' | 'walk' | 'ride' | 'hike';

export interface LatLon {
  lat: number;
  lon: number;
}

export interface RoutingRequest {
  /** Start, any via points in order, and the finish; at least two. */
  locations: LatLon[];
  activity: RoutingActivity;
  /** Preferences, already limited to what `capabilities.style` supports. */
  style?: RouteStyle;
  /** Also work out how much of the route is on paths and unpaved ways. */
  measureSurface?: boolean;
}

export interface RoutingResult {
  points: RoutePoint[];
  cues: RouteCue[];
  distanceM: number;
  /** Share (0 to 1) of the route on paths and unpaved ways, when measured. */
  trailShare?: number | null;
}

/** What an engine can do beyond plain routing. */
export interface RoutingCapabilities {
  style: RouteGenerateCapabilities['style'];
  /** The most distinct loop candidates worth asking for. */
  maxAlternatives: number;
}

export type RoutingFailureKind =
  /** The engine could not be reached. */
  | 'unreachable'
  | 'timeout'
  /** The engine answered but found no route (e.g. start off the map extract). */
  | 'no_route'
  /** The engine refused the request or our credentials. */
  | 'rejected'
  /** The engine answered with something we could not read. */
  | 'bad_response';

export class RoutingProviderError extends Error {
  constructor(
    readonly kind: RoutingFailureKind,
    message: string
  ) {
    super(message);
    this.name = 'RoutingProviderError';
  }
}

/**
 * A routing engine. The endpoint only talks to this interface, so supporting
 * another engine means adding an implementation and a case in `routingConfig`.
 */
export interface RoutingProvider {
  readonly kind: string;
  readonly capabilities: RoutingCapabilities;
  route(request: RoutingRequest): Promise<RoutingResult>;
}
