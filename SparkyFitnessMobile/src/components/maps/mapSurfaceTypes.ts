/** A geographic point. Map engines take these as lat/lon, never as a Region. */
export interface MapCoordinate {
  lat: number;
  lon: number;
}

/** The part of a react-native-maps Region the route screens need. */
export interface MapViewport {
  center: MapCoordinate;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** A route stretch: one line per stretch so each can be dashed on its own. */
export interface MapLine {
  points: readonly MapCoordinate[];
  color: string;
  width?: number;
  dashed?: boolean;
}

export interface MapMarkerSpec {
  point: MapCoordinate;
  /** `pin` is a map pin; `dot` and `ring` are the route preview's markers. */
  shape: 'pin' | 'dot' | 'ring';
  color: string;
  /** Diameter in points for `dot` and `ring`. */
  size?: number;
  opacity?: number;
  draggable?: boolean;
  onPress?: () => void;
  onDragEnd?: (point: MapCoordinate) => void;
}

export interface MapSurfaceHandle {
  /** Frames every point, using the engine's own aspect-ratio fitting. */
  fitPoints(
    points: readonly MapCoordinate[],
    padding?: Partial<MapPadding>,
    animated?: boolean
  ): void;
  /** Centers on a point and shows roughly `latitudeDelta` degrees of it. */
  centerOn(point: MapCoordinate, latitudeDelta: number): void;
}

export interface MapSurfaceProps {
  initialViewport: MapViewport;
  /** Follows the app theme: light or dark base map. */
  dark?: boolean;
  /** Apple Maps' hybrid imagery. Android has no keyless satellite layer. */
  satellite?: boolean;
  /** Pan, zoom, rotate and pitch. Off for a still preview inside a scroll view. */
  interactive?: boolean;
  /** Google Maps lite mode only (Android with a key). Apple Maps and MapLibre ignore it. */
  lite?: boolean;
  showUserLocation?: boolean;
  /** Hides the map itself from screen readers; the wrapper carries the label. */
  hideFromAccessibility?: boolean;
  lines?: readonly MapLine[];
  markers?: readonly MapMarkerSpec[];
  onPress?: (point: MapCoordinate) => void;
  onViewportChange?: (latitudeDelta: number) => void;
  onReady?: () => void;
}
