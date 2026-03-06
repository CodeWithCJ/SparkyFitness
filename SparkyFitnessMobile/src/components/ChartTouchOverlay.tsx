import React, { useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  type GestureResponderEvent,
  type NativeSyntheticEvent,
  type NativeTouchEvent,
} from 'react-native';
import type { ChartBounds, PointsArray } from 'victory-native';

export type ChartTouchLayout = {
  chartBounds: ChartBounds | null;
  points: PointsArray;
};

type ChartLayoutReporterProps = {
  chartBounds: ChartBounds;
  points: PointsArray;
  onChange: (layout: ChartTouchLayout) => void;
};

type ChartTouchOverlayProps = {
  layout: ChartTouchLayout;
  onSelect: (index: number) => void;
  onClear?: () => void;
  testIDPrefix?: string;
};

type ChartTouchZone = {
  index: number;
  left: number;
  width: number;
};

type TouchPoint = {
  x: number;
  y: number;
};

export const EMPTY_CHART_TOUCH_LAYOUT: ChartTouchLayout = {
  chartBounds: null,
  points: [] as PointsArray,
};

export const CHART_TOUCH_LONG_PRESS_DELAY_MS = 100;
const MOVE_CANCEL_THRESHOLD_PX = 8;

export const createChartTouchLayoutSignature = (
  layout: ChartTouchLayout,
): string => {
  if (!layout.chartBounds || layout.points.length === 0) {
    return 'empty';
  }

  const { chartBounds, points } = layout;
  const pointSignature = points
    .map(point => `${point.x}:${String(point.xValue)}:${String(point.yValue)}`)
    .join('|');

  return [
    chartBounds.left,
    chartBounds.right,
    chartBounds.top,
    chartBounds.bottom,
    pointSignature,
  ].join(';');
};

export const buildChartTouchZones = (
  points: PointsArray,
  chartBounds: ChartBounds | null,
): ChartTouchZone[] => {
  if (!chartBounds || points.length === 0) {
    return [];
  }

  return points.map((point, index) => {
    const previousPoint = points[index - 1];
    const nextPoint = points[index + 1];

    const leftEdge =
      index === 0 ? chartBounds.left : (previousPoint.x + point.x) / 2;
    const rightEdge =
      index === points.length - 1
        ? chartBounds.right
        : (point.x + nextPoint.x) / 2;

    return {
      index,
      left: Math.max(chartBounds.left, leftEdge),
      width: Math.max(
        1,
        Math.min(chartBounds.right, rightEdge) -
          Math.max(chartBounds.left, leftEdge),
      ),
    };
  });
};

const getTouchPoint = (
  event:
    | NativeSyntheticEvent<NativeTouchEvent>
    | GestureResponderEvent
    | undefined,
): TouchPoint | null => {
  const nativeEvent = event?.nativeEvent;

  if (!nativeEvent) {
    return null;
  }

  const activeTouch =
    nativeEvent.touches?.[0] ?? nativeEvent.changedTouches?.[0] ?? nativeEvent;

  if (
    typeof activeTouch.locationX !== 'number' ||
    typeof activeTouch.locationY !== 'number'
  ) {
    return null;
  }

  return {
    x: activeTouch.locationX,
    y: activeTouch.locationY,
  };
};

const isPointInsideChartBounds = (
  point: TouchPoint,
  chartBounds: ChartBounds,
): boolean =>
  point.x >= chartBounds.left &&
  point.x <= chartBounds.right &&
  point.y >= chartBounds.top &&
  point.y <= chartBounds.bottom;

const getDistanceMoved = (start: TouchPoint, current: TouchPoint): number =>
  Math.hypot(current.x - start.x, current.y - start.y);

const findZoneIndexForPoint = (
  point: TouchPoint,
  zones: ChartTouchZone[],
  chartBounds: ChartBounds,
  requireInBounds: boolean,
): number | null => {
  if (requireInBounds && !isPointInsideChartBounds(point, chartBounds)) {
    return null;
  }

  const clampedX = Math.min(
    chartBounds.right,
    Math.max(chartBounds.left, point.x),
  );

  for (let index = 0; index < zones.length; index += 1) {
    const zone = zones[index];

    if (!zone) {
      continue;
    }

    if (index === zones.length - 1 || clampedX < zone.left + zone.width) {
      return zone.index;
    }
  }

  return null;
};

export const ChartLayoutReporter: React.FC<ChartLayoutReporterProps> = ({
  chartBounds,
  points,
  onChange,
}) => {
  useEffect(() => {
    onChange({ chartBounds, points });
  }, [chartBounds, onChange, points]);

  return null;
};

const ChartTouchOverlay: React.FC<ChartTouchOverlayProps> = ({
  layout,
  onSelect,
  onClear,
  testIDPrefix,
}) => {
  const zones = useMemo(
    () => buildChartTouchZones(layout.points, layout.chartBounds),
    [layout.chartBounds, layout.points],
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPointRef = useRef<TouchPoint | null>(null);
  const lastPointRef = useRef<TouchPoint | null>(null);
  const isSelectionActiveRef = useRef(false);
  const selectedIndexRef = useRef<number | null>(null);

  const clearActivationTimeout = () => {
    if (!timeoutRef.current) {
      return;
    }

    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };

  const updateSelection = (
    point: TouchPoint | null,
    requireInBounds: boolean,
  ) => {
    if (!point || !layout.chartBounds || !zones.length) {
      return;
    }

    const nextIndex = findZoneIndexForPoint(
      point,
      zones,
      layout.chartBounds,
      requireInBounds,
    );

    if (nextIndex == null || nextIndex === selectedIndexRef.current) {
      return;
    }

    selectedIndexRef.current = nextIndex;
    onSelect(nextIndex);
  };

  const resetGesture = () => {
    clearActivationTimeout();

    const shouldClear =
      isSelectionActiveRef.current || selectedIndexRef.current != null;

    startPointRef.current = null;
    lastPointRef.current = null;
    isSelectionActiveRef.current = false;
    selectedIndexRef.current = null;

    if (shouldClear) {
      onClear?.();
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!layout.chartBounds || !zones.length) {
    return null;
  }

  const chartBounds = layout.chartBounds;

  const beginTrackingTouch = (
    event: NativeSyntheticEvent<NativeTouchEvent>,
  ) => {
    const point = getTouchPoint(event);

    resetGesture();

    if (!point || !isPointInsideChartBounds(point, chartBounds)) {
      return;
    }

    startPointRef.current = point;
    lastPointRef.current = point;
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      isSelectionActiveRef.current = true;
      // Wait for an intentional hold so parent scroll and pager gestures win.
      updateSelection(lastPointRef.current, true);
    }, CHART_TOUCH_LONG_PRESS_DELAY_MS);
  };

  const handleTouchMove = (
    event: NativeSyntheticEvent<NativeTouchEvent> | GestureResponderEvent,
  ) => {
    const point = getTouchPoint(event);

    if (!point) {
      return;
    }

    lastPointRef.current = point;

    if (!isSelectionActiveRef.current) {
      if (
        startPointRef.current &&
        getDistanceMoved(startPointRef.current, point) >
          MOVE_CANCEL_THRESHOLD_PX
      ) {
        clearActivationTimeout();
        startPointRef.current = null;
        lastPointRef.current = null;
      }

      return;
    }

    updateSelection(point, false);
  };

  return (
    <View
      style={StyleSheet.absoluteFill}
      testID={testIDPrefix}
      onTouchStart={beginTrackingTouch}
      onTouchMove={handleTouchMove}
      onTouchEnd={resetGesture}
      onTouchCancel={resetGesture}
      onMoveShouldSetResponderCapture={() => isSelectionActiveRef.current}
      onMoveShouldSetResponder={() => isSelectionActiveRef.current}
      onResponderMove={handleTouchMove}
      onResponderRelease={resetGesture}
      onResponderTerminate={resetGesture}
      onResponderTerminationRequest={() => !isSelectionActiveRef.current}
    />
  );
};

export default ChartTouchOverlay;
