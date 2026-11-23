import React from 'react';
import { render } from '@testing-library/react-native';
import type { GpsTrackPoint } from '@workspace/shared';

import RouteMap from '../../../src/components/exerciseStats/RouteMap';
import { canShowRouteMap } from '../../../src/utils/routeMapSupport';
import { DARK_MAP_STYLE } from '../../../src/components/exerciseStats/darkMapStyle';

jest.mock('../../../src/utils/routeMapSupport', () => ({
  canShowRouteMap: jest.fn(),
}));

let mockTheme = 'light';
jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map((key) => `color:${key}`) : `color:${keys}`,
  useUniwind: () => ({ theme: mockTheme }),
}));

// The map is hidden from screen readers; the wrapper carries the label.
const HIDDEN = { includeHiddenElements: true };

const mockCanShowRouteMap = canShowRouteMap as jest.MockedFunction<
  typeof canShowRouteMap
>;

const point = (lat: number, lon: number) =>
  ({ t: '2026-09-20T12:00:00Z', lat, lon }) as GpsTrackPoint;

const ROUTE = [
  point(0, 0),
  point(51.5, -0.12),
  point(51.502, -0.118),
  point(51.504, -0.121),
];

describe('RouteMap', () => {
  beforeEach(() => {
    mockTheme = 'light';
    mockCanShowRouteMap.mockReturnValue(true);
  });

  it('draws the route over a map, from start dot to finish ring', () => {
    const screen = render(
      <RouteMap points={ROUTE} accessibilityLabel="Route" />
    );
    expect(screen.getByLabelText('Route').props.testID).toBe('route-tile-map');

    const polyline = screen.getByTestId('map-polyline', HIDDEN);
    // The 0,0 fix before GPS lock is not drawn.
    expect(polyline.props.coordinates).toEqual([
      { latitude: 51.5, longitude: -0.12 },
      { latitude: 51.502, longitude: -0.118 },
      { latitude: 51.504, longitude: -0.121 },
    ]);
    expect(polyline.props.strokeColor).toBe('color:--color-accent-primary');

    const [finish, start] = screen.getAllByTestId('map-marker', HIDDEN);
    expect(finish!.props.coordinate).toEqual({
      latitude: 51.504,
      longitude: -0.121,
    });
    expect(start!.props.coordinate).toEqual({
      latitude: 51.5,
      longitude: -0.12,
    });
  });

  it('frames the route and keeps the map still inside the scroll view', () => {
    const screen = render(
      <RouteMap points={ROUTE} accessibilityLabel="Route" />
    );
    const map = screen.getByTestId('map-view', HIDDEN);
    expect(map.props.initialRegion.latitude).toBeCloseTo(51.502);
    expect(map.props.initialRegion.longitude).toBeCloseTo(-0.1195);
    expect(map.props.scrollEnabled).toBe(false);
    expect(map.props.zoomEnabled).toBe(false);
  });

  it('never sets a map ID, which would bill loads as Dynamic Maps', () => {
    const screen = render(
      <RouteMap points={ROUTE} accessibilityLabel="Route" />
    );
    expect(
      screen.getByTestId('map-view', HIDDEN).props.googleMapId
    ).toBeUndefined();
  });

  it('follows a dark theme on both platforms', () => {
    mockTheme = 'amoled';
    const screen = render(
      <RouteMap points={ROUTE} accessibilityLabel="Route" />
    );
    const map = screen.getByTestId('map-view', HIDDEN);
    expect(map.props.userInterfaceStyle).toBe('dark');
    expect(map.props.customMapStyle).toBe(DARK_MAP_STYLE);
  });

  it('keeps the plain line where no map can be drawn', () => {
    mockCanShowRouteMap.mockReturnValue(false);
    const screen = render(
      <RouteMap points={ROUTE} accessibilityLabel="Route" />
    );
    expect(screen.queryByTestId('map-view', HIDDEN)).toBeNull();
    expect(screen.getByLabelText('Route').props.testID).toBeUndefined();
  });
});
