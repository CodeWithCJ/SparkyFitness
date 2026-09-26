import React from 'react';
import { DashPathEffect, Line } from '@shopify/react-native-skia';
import type { ChartBounds, Scale } from 'victory-native';

type TrendGoalLineProps = {
  chartBounds: ChartBounds;
  yScale: Scale;
  goal: number | null | undefined;
  color: string;
};

const GOAL_LINE_STROKE_WIDTH = 1.5;
const GOAL_LINE_DASH_INTERVALS = [6, 4];

/**
 * A dashed horizontal reference line across a `CartesianChart` plot at a given data value,
 * shared by every trend chart that draws a user-set goal alongside its plotted series.
 */
const TrendGoalLine: React.FC<TrendGoalLineProps> = ({
  chartBounds,
  yScale,
  goal,
  color,
}) => {
  if (goal == null || goal <= 0) {
    return null;
  }

  const y = yScale(goal);

  return (
    <Line
      p1={{ x: chartBounds.left, y }}
      p2={{ x: chartBounds.right, y }}
      color={color}
      strokeWidth={GOAL_LINE_STROKE_WIDTH}
    >
      <DashPathEffect intervals={GOAL_LINE_DASH_INTERVALS} />
    </Line>
  );
};

export default TrendGoalLine;
