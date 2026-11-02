import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import { DARK_MAP_STYLE } from '../exerciseStats/darkMapStyle';
import type {
  MapCoordinate,
  MapMarkerSpec,
  MapSurfaceHandle,
  MapSurfaceProps,
} from './mapSurfaceTypes';

const MARKER_CENTER = { x: 0.5, y: 0.5 };
const DOT_SIZE = 10;
const RING_SIZE = 18;

const toCoordinate = (point: MapCoordinate) => ({
  latitude: point.lat,
  longitude: point.lon,
});

const fromCoordinate = (coordinate: {
  latitude: number;
  longitude: number;
}): MapCoordinate => ({ lat: coordinate.latitude, lon: coordinate.longitude });

/**
 * A dot or a ring, the two markers the route preview draws. The finish is a
 * ring so a loop that ends where it began still shows the start dot inside it.
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
        }}
      />
    );
  }
  const size = marker.size ?? DOT_SIZE;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: marker.color,
      }}
    />
  );
};

/**
 * The route map wherever `react-native-maps` draws it: Apple Maps (MapKit) on
 * iOS, which needs no key, and Google Maps on an Android build given
 * `GOOGLE_MAPS_ANDROID_API_KEY`. Keyless Android builds use
 * `maplibreMapSurface.tsx` instead.
 *
 * Every implementation shares `MapSurfaceProps`, so screens never branch on
 * the platform for map behaviour.
 */
const ReactNativeMapSurface = forwardRef<MapSurfaceHandle, MapSurfaceProps>(
  function ReactNativeMapSurface(
    {
      initialViewport,
      dark = false,
      satellite = false,
      interactive = true,
      lite = false,
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
    const mapRef = useRef<MapView>(null);

    useImperativeHandle(
      ref,
      () => ({
        fitPoints(points, padding, animated = false) {
          if (points.length === 0) return;
          mapRef.current?.fitToCoordinates(points.map(toCoordinate), {
            edgePadding: {
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              ...padding,
            },
            animated,
          });
        },
        centerOn(point, latitudeDelta) {
          mapRef.current?.animateToRegion(
            {
              ...toCoordinate(point),
              latitudeDelta,
              longitudeDelta: latitudeDelta,
            },
            0
          );
        },
      }),
      []
    );

    return (
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: initialViewport.center.lat,
          longitude: initialViewport.center.lon,
          latitudeDelta: initialViewport.latitudeDelta,
          longitudeDelta: initialViewport.longitudeDelta,
        }}
        mapType={satellite ? 'hybrid' : 'standard'}
        liteMode={lite}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={interactive}
        pitchEnabled={interactive}
        toolbarEnabled={false}
        userInterfaceStyle={dark ? 'dark' : 'light'}
        customMapStyle={dark ? DARK_MAP_STYLE : []}
        showsUserLocation={showUserLocation}
        onMapReady={onReady}
        onRegionChangeComplete={(region: Region) =>
          onViewportChange?.(region.latitudeDelta)
        }
        onPress={
          onPress
            ? (event) => onPress(fromCoordinate(event.nativeEvent.coordinate))
            : undefined
        }
        importantForAccessibility={
          hideFromAccessibility ? 'no-hide-descendants' : undefined
        }
        accessibilityElementsHidden={hideFromAccessibility || undefined}
      >
        {lines.map((line, index) => (
          <Polyline
            key={`line-${index}`}
            coordinates={line.points.map(toCoordinate)}
            strokeColor={line.color}
            strokeWidth={line.width ?? 4}
            lineCap="round"
            lineJoin="round"
            lineDashPattern={line.dashed ? [10, 8] : undefined}
          />
        ))}
        {markers.map((marker, index) => (
          <Marker
            key={`marker-${index}`}
            coordinate={toCoordinate(marker.point)}
            anchor={marker.shape === 'pin' ? undefined : MARKER_CENTER}
            draggable={marker.draggable}
            opacity={marker.opacity}
            pinColor={marker.shape === 'pin' ? marker.color : undefined}
            onPress={
              marker.onPress
                ? (event) => {
                    event.stopPropagation();
                    marker.onPress?.();
                  }
                : undefined
            }
            onDragEnd={
              marker.onDragEnd
                ? (event) =>
                    marker.onDragEnd?.(
                      fromCoordinate(event.nativeEvent.coordinate)
                    )
                : undefined
            }
          >
            {marker.shape === 'pin' ? null : <MarkerShape marker={marker} />}
          </Marker>
        ))}
      </MapView>
    );
  }
);

export default ReactNativeMapSurface;
