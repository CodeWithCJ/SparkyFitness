import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';
import type { GpsTrackPoint } from '@workspace/shared';
import { projectRoute } from '../../utils/cardioSession';

const HEIGHT = 220;

interface RouteLineProps {
  points: readonly Pick<GpsTrackPoint, 'lat' | 'lon'>[];
  accessibilityLabel: string;
}

/**
 * The GPS track drawn as a line, with start and finish dots, and no map
 * under it. Shows the shape of the route only; used where a map cannot be
 * drawn, or as an offline fallback when map styles or tiles fail to load.
 */
const RouteLine: React.FC<RouteLineProps> = ({
  points,
  accessibilityLabel,
}) => {
  const [width, setWidth] = useState(0);
  const [routeColor, startColor, finishColor, trackBg] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-success',
    '--color-heart-rate',
    '--color-raised',
  ]) as [string, string, string, string];

  const route = useMemo(
    () => (width > 0 ? projectRoute(points, width, HEIGHT) : null),
    [points, width]
  );

  return (
    <View
      className="rounded-lg overflow-hidden"
      style={{ height: HEIGHT, backgroundColor: trackBg }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={accessibilityLabel}
    >
      {route ? (
        <Svg width={width} height={HEIGHT}>
          <Path
            d={route.d}
            stroke={routeColor}
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="none"
          />
          {/* The finish is a ring so a loop that ends where it began
              still shows the start dot inside it. */}
          <Circle
            cx={route.end.x}
            cy={route.end.y}
            r={8}
            fill="none"
            stroke={finishColor}
            strokeWidth={3}
          />
          <Circle
            cx={route.start.x}
            cy={route.start.y}
            r={4.5}
            fill={startColor}
          />
        </Svg>
      ) : null}
    </View>
  );
};

export default RouteLine;
