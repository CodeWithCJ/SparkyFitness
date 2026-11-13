import React from 'react';
import type { GpsTrackPoint } from '@workspace/shared';
import { canShowRouteMap } from '../../utils/routeMapSupport';
import RouteLine from './RouteLine';
import RouteTileMap from './RouteTileMap';

interface RouteMapProps {
  points: readonly Pick<GpsTrackPoint, 'lat' | 'lon'>[];
  accessibilityLabel: string;
}

/**
 * A route (a cardio session's or a saved one): over a real map where this build can draw one,
 * otherwise as a plain line.
 */
const RouteMap: React.FC<RouteMapProps> = (props) =>
  canShowRouteMap() ? <RouteTileMap {...props} /> : <RouteLine {...props} />;

export default RouteMap;
