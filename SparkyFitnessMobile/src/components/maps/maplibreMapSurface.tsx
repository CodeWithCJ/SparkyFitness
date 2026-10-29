import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from 'react';
import { type NativeSyntheticEvent, StyleSheet, View } from 'react-native';
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type PressEvent,
  UserLocation,
  ViewAnnotation,
  type ViewAnnotationEvent,
} from '@maplibre/maplibre-react-native';
import { resolveMapLibreStyle, zoomForLatitudeDelta } from './mapStyles';
import type {
  MapCoordinate,
  MapLine,
  MapMarkerSpec,
  MapSurfaceHandle,
  MapSurfaceProps,
} from './mapSurfaceTypes';

const DOT_SIZE = 10;
const RING_SIZE = 18;
const PIN_SIZE = 16;
/** Tapping a marker also reaches the map on Android; ignore that second press. */
const MARKER_PRESS_GUARD_MS = 300;
const MERCATOR_MAX_LAT = 85;

const toLngLat = (point: MapCoordinate): [number, number] => [
  point.lon,
  point.lat,
];

const fromLngLat = ([lon, lat]: [number, number]): MapCoordinate => ({
  lat,
  lon,
});

const clampLat = (lat: number) =>
  Math.min(Math.max(lat, -MERCATOR_MAX_LAT), MERCATOR_MAX_LAT);

const boundsForPoints = (
  points: readonly MapCoordinate[]
): [number, number, number, number] => {
  let west = points[0].lon;
  let east = points[0].lon;
  let south = points[0].lat;
  let north = points[0].lat;
  for (const point of points) {
    west = Math.min(west, point.lon);
    east = Math.max(east, point.lon);
    south = Math.min(south, point.lat);
    north = Math.max(north, point.lat);
  }
  return [
    Math.max(west, -180),
    clampLat(south),
    Math.min(east, 180),
    clampLat(north),
  ];
};

const lineFeature = (points: readonly MapCoordinate[]) =>
  ({
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: points.map(toLngLat),
    },
  }) as const;

/** One layer per stretch, so a straight stretch can be dashed on its own. */
const RouteLineLayer: React.FC<{ line: MapLine; index: number }> = ({
  line,
  index,
}) => {
  const paint = {
    'line-color': line.color,
    'line-width': line.width ?? 4,
  };
  return (
    <GeoJSONSource
      id={`route-line-source-${index}`}
      data={lineFeature(line.points)}
    >
      {line.dashed ? (
        <Layer
          id={`route-line-${index}`}
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ ...paint, 'line-dasharray': [2, 2] }}
        />
      ) : (
        <Layer
          id={`route-line-${index}`}
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={paint}
        />
      )}
    </GeoJSONSource>
  );
};

/**
 * The dot or ring the route preview draws. Editor points are drawn the same
 * way rather than as map pins, because MapLibre's draggable annotation is a
 * native view.
 */
const MarkerShape: React.FC<{ marker: MapMarkerSpec }> = ({ marker }) => {
  if (marker.shape === 'ring') {
    const size = marker.size ?? RING_SIZE;
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 3,
          borderColor: marker.color,
          opacity: marker.opacity ?? 1,
        }}
      />
    );
  }
  const size = marker.size ?? (marker.shape === 'pin' ? PIN_SIZE : DOT_SIZE);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: marker.color,
        // A thin light border keeps the dot visible over dark tiles.
        borderWidth: marker.shape === 'pin' ? 2 : 0,
        borderColor: '#ffffff',
        opacity: marker.opacity ?? 1,
      }}
    />
  );
};

/**
 * The keyless route map on Android: MapLibre Native over OpenStreetMap vector
 * tiles from OpenFreeMap. No API key, no billing account, and no Google Play
 * Services, so routes work on de-Googled phones too.
 *
 * A build given a Google Maps key keeps Google Maps instead, through
 * `reactNativeMapSurface.tsx`; `MapSurface.android.tsx` picks between them.
 */
const MapLibreMapSurface = forwardRef<MapSurfaceHandle, MapSurfaceProps>(
  function MapLibreMapSurface(
    {
      initialViewport,
      dark = false,
      interactive = true,
      showUserLocation = false,
      hideFromAccessibility = false,
      lines = [],
      markers = [],
      onPress,
      onViewportChange,
      onReady,
    },
    ref
  ) {
    const cameraRef = useRef<CameraRef>(null);
    const styleLoaded = useRef(false);
    const pendingCameraAction = useRef<((camera: CameraRef) => void) | null>(
      null
    );
    const lastMarkerPress = useRef(0);

    // A camera move asked for before the style is ready is dropped by
    // MapLibre, so keep the last one and apply it once the style loads.
    const runWhenReady = useCallback((action: (camera: CameraRef) => void) => {
      if (styleLoaded.current && cameraRef.current) {
        action(cameraRef.current);
      } else {
        pendingCameraAction.current = action;
      }
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        fitPoints(points, padding, animated = false) {
          if (points.length === 0) return;
          if (points.length === 1) {
            runWhenReady((camera) =>
              camera.easeTo({
                center: toLngLat(points[0]),
                zoom: zoomForLatitudeDelta(0.02),
                duration: 0,
              })
            );
            return;
          }
          const bounds = boundsForPoints(points);
          runWhenReady((camera) =>
            camera.fitBounds(bounds, {
              padding: { top: 0, right: 0, bottom: 0, left: 0, ...padding },
              duration: animated ? 300 : 0,
              easing: 'ease',
            })
          );
        },
        centerOn(point, latitudeDelta) {
          runWhenReady((camera) =>
            camera.easeTo({
              center: toLngLat(point),
              zoom: zoomForLatitudeDelta(latitudeDelta),
              duration: 0,
            })
          );
        },
      }),
      [runWhenReady]
    );

    const handleStyleLoaded = () => {
      styleLoaded.current = true;
      const action = pendingCameraAction.current;
      pendingCameraAction.current = null;
      if (action && cameraRef.current) action(cameraRef.current);
      onReady?.();
    };

    const handlePress = (event: NativeSyntheticEvent<PressEvent>) => {
      if (Date.now() - lastMarkerPress.current < MARKER_PRESS_GUARD_MS) return;
      const [lon, lat] = event.nativeEvent.lngLat;
      onPress?.({ lat, lon });
    };

    const handleMarkerPress = (marker: MapMarkerSpec) => {
      lastMarkerPress.current = Date.now();
      marker.onPress?.();
    };

    const handleMarkerDragEnd = (
      marker: MapMarkerSpec,
      event: NativeSyntheticEvent<ViewAnnotationEvent>
    ) => {
      lastMarkerPress.current = Date.now();
      marker.onDragEnd?.(fromLngLat(event.nativeEvent.lngLat));
    };

    // `satellite` is iOS-only: MapLibre's keyless styles have no imagery layer.
    return (
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={resolveMapLibreStyle(dark)}
        logo={false}
        attribution
        compass={false}
        scaleBar={false}
        dragPan={interactive}
        touchZoom={interactive}
        doubleTapZoom={interactive}
        doubleTapHoldZoom={interactive}
        touchRotate={interactive}
        touchPitch={interactive}
        onPress={handlePress}
        onRegionDidChange={(event) => {
          const [, south, , north] = event.nativeEvent.bounds;
          onViewportChange?.(north - south);
        }}
        onDidFinishLoadingStyle={handleStyleLoaded}
        importantForAccessibility={
          hideFromAccessibility ? 'no-hide-descendants' : undefined
        }
        accessibilityElementsHidden={hideFromAccessibility || undefined}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            bounds: boundsForPoints([
              {
                lat:
                  initialViewport.center.lat -
                  initialViewport.latitudeDelta / 2,
                lon:
                  initialViewport.center.lon -
                  initialViewport.longitudeDelta / 2,
              },
              {
                lat:
                  initialViewport.center.lat +
                  initialViewport.latitudeDelta / 2,
                lon:
                  initialViewport.center.lon +
                  initialViewport.longitudeDelta / 2,
              },
            ]),
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
          }}
        />
        {showUserLocation ? <UserLocation /> : null}
        {lines.map((line, index) => (
          <RouteLineLayer key={`line-${index}`} line={line} index={index} />
        ))}
        {markers.map((marker, index) => {
          const shape = <MarkerShape marker={marker} />;
          if (marker.draggable) {
            return (
              <ViewAnnotation
                key={`marker-${index}`}
                id={`route-marker-${index}`}
                lngLat={toLngLat(marker.point)}
                draggable
                onPress={() => handleMarkerPress(marker)}
                onDragEnd={
                  marker.onDragEnd
                    ? (event) => handleMarkerDragEnd(marker, event)
                    : undefined
                }
              >
                {shape}
              </ViewAnnotation>
            );
          }
          return (
            <Marker
              key={`marker-${index}`}
              id={`route-marker-${index}`}
              lngLat={toLngLat(marker.point)}
              onPress={() => handleMarkerPress(marker)}
            >
              {shape}
            </Marker>
          );
        })}
      </Map>
    );
  }
);

export default MapLibreMapSurface;
