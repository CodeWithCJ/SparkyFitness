import React from 'react';
import { Line, Scatter } from 'victory-native';

/**
 * A one-point series has no line to stroke — `d3-shape` emits a bare `moveTo` for it and
 * Skia draws nothing — so the lone reading is rendered as a dot instead. Sized to read as
 * a deliberate marker rather than a stray pixel at the trend charts' plot height.
 */
const SINGLE_POINT_RADIUS = 5;

type LineSeriesMarkProps = React.ComponentProps<typeof Line>;

/**
 * Drop-in replacement for victory-native's `<Line>` that stays visible below two points.
 * Takes the same props, so a caller's curve, animation, and stroke options carry over
 * untouched on the multi-point path.
 */
const LineSeriesMark: React.FC<LineSeriesMarkProps> = ({
  points,
  ...lineProps
}) => {
  if (points.length < 2) {
    return (
      <Scatter
        points={points}
        color={lineProps.color}
        radius={SINGLE_POINT_RADIUS}
        shape="circle"
        animate={lineProps.animate}
      />
    );
  }

  return <Line points={points} {...lineProps} />;
};

export default LineSeriesMark;
