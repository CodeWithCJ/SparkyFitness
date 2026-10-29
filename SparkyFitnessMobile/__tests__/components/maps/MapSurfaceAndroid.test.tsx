import { createRef } from 'react';
import { act, render } from '@testing-library/react-native';
import type { MapSurfaceHandle } from '../../../src/components/maps/mapSurfaceTypes';

interface CameraMethods {
  fitBounds: jest.Mock;
  easeTo: jest.Mock;
}

// MapLibre ships untranspiled native specs; the map is native-only anyway.
jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const cameraMethods = { fitBounds: jest.fn(), easeTo: jest.fn() };

  const piece = (testID: string) => {
    const Piece = ({
      children,
      ...props
    }: { children?: React.ReactNode } & Record<string, unknown>) =>
      React.createElement(View, { testID, ...props }, children);
    Piece.displayName = testID;
    return Piece;
  };

  const MockCamera = React.forwardRef<
    CameraMethods,
    { children?: React.ReactNode } & Record<string, unknown>
  >(({ children, ...props }, ref) => {
    React.useImperativeHandle(ref, () => cameraMethods);
    return React.createElement(
      View,
      { testID: 'ml-camera', ...props },
      children
    );
  });
  MockCamera.displayName = 'MockCamera';

  return {
    __esModule: true,
    __cameraMethods: cameraMethods,
    Map: piece('ml-map'),
    Camera: MockCamera,
    GeoJSONSource: piece('ml-source'),
    Layer: piece('ml-layer'),
    Marker: piece('ml-marker'),
    ViewAnnotation: piece('ml-view-annotation'),
    UserLocation: () => null,
  };
});

import MapLibreMapSurface from '../../../src/components/maps/maplibreMapSurface';
import {
  MAP_STYLE_DARK,
  MAP_STYLE_LIGHT,
  resolveMapLibreStyle,
} from '../../../src/components/maps/mapStyles';

const { __cameraMethods } = jest.requireMock(
  '@maplibre/maplibre-react-native'
) as { __cameraMethods: CameraMethods };

const VIEWPORT = {
  center: { lat: 51.5, lon: -0.12 },
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

const LINE = [
  { lat: 51.5, lon: -0.12 },
  { lat: 51.51, lon: -0.11 },
];

const renderMap = (dark = false) =>
  render(
    <MapLibreMapSurface
      initialViewport={VIEWPORT}
      dark={dark}
      lines={[{ points: LINE, color: '#2563eb', width: 4 }]}
      markers={[{ point: LINE[0], color: '#16a34a', shape: 'dot' }]}
    />
  );

describe('MapLibreMapSurface', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads the keyless OpenStreetMap style for the theme', () => {
    const light = renderMap();
    expect(light.getByTestId('ml-map').props.mapStyle).toBe(MAP_STYLE_LIGHT);
    light.unmount();

    expect(renderMap(true).getByTestId('ml-map').props.mapStyle).toBe(
      MAP_STYLE_DARK
    );

    expect(resolveMapLibreStyle(false)).toBe(MAP_STYLE_LIGHT);
    expect(resolveMapLibreStyle(true)).toBe(MAP_STYLE_DARK);
  });

  it('sends route coordinates as GeoJSON in [longitude, latitude] order', () => {
    const screen = renderMap();
    const source = screen.getByTestId('ml-source');
    expect(source.props.data.geometry).toEqual({
      type: 'LineString',
      coordinates: [
        [-0.12, 51.5],
        [-0.11, 51.51],
      ],
    });
    expect(screen.getByTestId('ml-layer').props.paint['line-color']).toBe(
      '#2563eb'
    );
  });

  it('turns a map press into a lat/lon point', () => {
    const onPress = jest.fn();
    const screen = render(
      <MapLibreMapSurface initialViewport={VIEWPORT} onPress={onPress} />
    );
    act(() =>
      screen.getByTestId('ml-map').props.onPress({
        nativeEvent: { lngLat: [-0.12, 51.5] },
      })
    );
    expect(onPress).toHaveBeenCalledWith({ lat: 51.5, lon: -0.12 });
  });

  it('reports the visible latitude span for tap tolerance', () => {
    const onViewportChange = jest.fn();
    const screen = render(
      <MapLibreMapSurface
        initialViewport={VIEWPORT}
        onViewportChange={onViewportChange}
      />
    );
    act(() =>
      screen.getByTestId('ml-map').props.onRegionDidChange({
        nativeEvent: { bounds: [-1, 50, 1, 52] },
      })
    );
    expect(onViewportChange).toHaveBeenCalledWith(2);
  });

  it('waits for the style before fitting the camera, then frames the route', () => {
    const ref = createRef<MapSurfaceHandle>();
    const screen = render(
      <MapLibreMapSurface ref={ref} initialViewport={VIEWPORT} />
    );

    act(() => ref.current?.fitPoints(LINE, { top: 20, bottom: 20 }));
    expect(__cameraMethods.fitBounds).not.toHaveBeenCalled();

    act(() => screen.getByTestId('ml-map').props.onDidFinishLoadingStyle());
    expect(__cameraMethods.fitBounds).toHaveBeenCalledWith(
      [-0.12, 51.5, -0.11, 51.51],
      {
        padding: { top: 20, right: 0, bottom: 20, left: 0 },
        duration: 0,
        easing: 'ease',
      }
    );
  });

  it('draws points as map markers and draggable points as annotations', () => {
    const screen = render(
      <MapLibreMapSurface
        initialViewport={VIEWPORT}
        markers={[
          { point: LINE[0], color: '#16a34a', shape: 'pin' },
          {
            point: LINE[1],
            color: '#eab308',
            shape: 'pin',
            draggable: true,
            onDragEnd: jest.fn(),
          },
        ]}
      />
    );
    expect(screen.getByTestId('ml-marker')).toBeTruthy();
    expect(screen.getByTestId('ml-view-annotation')).toBeTruthy();
  });
});
