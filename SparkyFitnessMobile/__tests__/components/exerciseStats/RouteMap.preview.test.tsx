import React from 'react';
import { render, screen } from '@testing-library/react-native';

import RouteMap from '../../../src/components/exerciseStats/RouteMap';
import type {
  MapSurfaceHandle,
  MapSurfaceProps,
} from '../../../src/components/maps/mapSurfaceTypes';

const mockFitPoints = jest.fn();

jest.mock('../../../src/utils/routeMapSupport', () => ({
  canShowRouteMap: jest.fn(() => true),
  usesGoogleMapsOnAndroid: jest.fn(() => false),
}));

jest.mock('../../../src/components/maps/MapSurface', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');

  const MockMapSurface = React.forwardRef<MapSurfaceHandle, MapSurfaceProps>(
    (props, ref) => {
      React.useImperativeHandle(ref, () => ({
        fitPoints: mockFitPoints,
        centerOn: jest.fn(),
      }));
      return React.createElement(View, {
        testID: 'route-map-surface',
        ...props,
      });
    }
  );

  return { __esModule: true, default: MockMapSurface };
});

describe('RouteMap preview integration', () => {
  it('passes preview padding and hides native attribution', () => {
    render(
      <RouteMap
        points={[
          { lat: 51.5, lon: -0.12 },
          { lat: 51.502, lon: -0.118 },
          { lat: 51.504, lon: -0.121 },
        ]}
        accessibilityLabel="Route"
      />
    );

    expect(mockFitPoints).toHaveBeenCalledWith(
      [
        { lat: 51.5, lon: -0.12 },
        { lat: 51.502, lon: -0.118 },
        { lat: 51.504, lon: -0.121 },
      ],
      { top: 18, right: 18, bottom: 26, left: 18 },
      false
    );
    expect(screen.getByTestId('route-map-surface').props.attribution).toBe(
      false
    );
  });
});
