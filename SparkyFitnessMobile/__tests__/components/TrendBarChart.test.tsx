import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import TrendBarChart from '../../src/components/TrendBarChart';
import { CHART_TOUCH_LONG_PRESS_DELAY_MS } from '../../src/components/ChartTouchOverlay';

/**
 * The Skia plot is replaced by a stub that still hands `CartesianChart`'s render prop a
 * real layout, so `ChartLayoutReporter` reports it and `ChartTouchOverlay` can resolve a
 * touch to a bar index — selection is what these cases are actually about.
 */
jest.mock('victory-native', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    CartesianChart: ({
      children,
      data,
      domain,
      yAxis,
    }: {
      children: (arg: {
        points: { value: unknown[] };
        chartBounds: {
          left: number;
          right: number;
          top: number;
          bottom: number;
        };
        yScale: (value: number) => number;
      }) => React.ReactNode;
      data: { day: string; value: number }[];
      domain?: { y?: [number] | [number, number] };
      yAxis?: unknown;
    }) => {
      const points = data.map((point, index) => ({
        x: 10 + index * 20,
        y: 0,
        xValue: point.day,
        yValue: point.value,
      }));
      const chartBounds = {
        left: 0,
        right: 20 * data.length,
        top: 0,
        bottom: 100,
      };
      // Identity scale: simple enough for a test to hand-verify a goal line's position.
      const yScale = (value: number) => value;
      return ReactModule.createElement(
        View,
        { testID: 'cartesian-chart', domain, yAxis },
        children({ points: { value: points }, chartBounds, yScale })
      );
    },
    Bar: () => null,
  };
});

jest.mock('@shopify/react-native-skia', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    Line: ({ children, ...props }: Record<string, unknown>) =>
      ReactModule.createElement(
        View,
        { testID: 'goal-line', ...props },
        children
      ),
    DashPathEffect: () => null,
    matchFont: jest.fn(() => null),
  };
});

type Point = { day: string; steps: number };

const data: Point[] = [
  { day: '2026-06-01', steps: 1000 },
  { day: '2026-06-02', steps: 2000 },
  { day: '2026-06-03', steps: 3000 },
];

const getValue = (point: Point): number => point.steps;

const defaultProps = {
  data,
  isLoading: false,
  isError: false,
  range: '7d' as const,
  title: 'Steps',
  getValue,
  formatTooltip: (point: Point) => `${point.steps} steps`,
  errorText: 'Failed to load step data',
  emptyText: 'No step data for this period',
  testIDPrefix: 'trend-touch-overlay',
};

const renderChart = (overrides: Partial<typeof defaultProps> = {}) => {
  const view = render(<TrendBarChart {...defaultProps} {...overrides} />);
  return {
    ...view,
    rerenderChart: (next: Partial<typeof defaultProps> = {}) =>
      view.rerender(<TrendBarChart {...defaultProps} {...next} />),
  };
};

const touchEventAt = (x: number) => ({
  nativeEvent: {
    changedTouches: [{ locationX: x, locationY: 50 }],
    touches: [{ locationX: x, locationY: 50 }],
    locationX: x,
    locationY: 50,
  },
});

/** Holds a bar long enough for the overlay to treat the touch as a selection. */
const selectBar = (index: number) => {
  fireEvent(
    screen.getByTestId('trend-touch-overlay'),
    'touchStart',
    touchEventAt(10 + index * 20)
  );
  act(() => {
    jest.advanceTimersByTime(CHART_TOUCH_LONG_PRESS_DELAY_MS);
  });
};

describe('TrendBarChart', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('renders the title and the plot for a populated series', () => {
    renderChart();

    expect(screen.getByText('Steps')).toBeTruthy();
    expect(screen.getByTestId('cartesian-chart')).toBeTruthy();
  });

  test('shows the loading copy while loading', () => {
    renderChart({ isLoading: true });

    expect(screen.getByText('Loading...')).toBeTruthy();
    expect(screen.queryByTestId('cartesian-chart')).toBeNull();
  });

  test('shows the supplied errorText while errored', () => {
    renderChart({ isError: true });

    expect(screen.getByText('Failed to load step data')).toBeTruthy();
    expect(screen.queryByTestId('cartesian-chart')).toBeNull();
  });

  test('shows the supplied emptyText when every value is zero', () => {
    renderChart({
      data: data.map((point) => ({ ...point, steps: 0 })),
    });

    expect(screen.getByText('No step data for this period')).toBeTruthy();
    expect(screen.queryByTestId('cartesian-chart')).toBeNull();
  });

  test('clears a visible tooltip on the first render after data changes identity', () => {
    const { rerenderChart } = renderChart();
    selectBar(1);
    expect(screen.getByText('2000 steps')).toBeTruthy();

    // A new array with the same contents is still a new dataset to the chart.
    rerenderChart({ data: [...data] });

    expect(screen.queryByText('2000 steps')).toBeNull();
  });

  test('re-derives the visible tooltip from the current formatTooltip', () => {
    const { rerenderChart } = renderChart();
    selectBar(1);
    expect(screen.getByText('2000 steps')).toBeTruthy();

    // Same data, new copy — a language switch must not leave stale text on screen.
    rerenderChart({ formatTooltip: (point: Point) => `${point.steps} kroków` });

    expect(screen.getByText('2000 kroków')).toBeTruthy();
    expect(screen.queryByText('2000 steps')).toBeNull();
  });

  test('expands the y-domain to include a goalValue above every bar', () => {
    renderChart({ goalValue: 5000 });

    expect(screen.getByTestId('cartesian-chart').props.domain).toEqual({
      y: [0, 5000],
    });
  });

  test('labels a nice round domain from the data alone when no goalValue is supplied', () => {
    renderChart();

    expect(screen.getByTestId('cartesian-chart').props.domain).toEqual({
      y: [0, 3000],
    });
  });

  test('renders a dashed goal line at the goalValue', () => {
    renderChart({ goalValue: 2500 });

    expect(screen.getByTestId('goal-line').props.p1).toEqual({ x: 0, y: 2500 });
    expect(screen.getByTestId('goal-line').props.p2).toEqual({
      x: 60,
      y: 2500,
    });
  });

  test('renders no goal line when no goalValue is supplied', () => {
    renderChart();

    expect(screen.queryByTestId('goal-line')).toBeNull();
  });

  test('labels the y-axis in nice round steps up to the goal when it exceeds every bar', () => {
    renderChart({ goalValue: 5000 });

    const [yAxisConfig] = screen.getByTestId('cartesian-chart').props.yAxis;
    expect(yAxisConfig.tickValues).toEqual([0, 1000, 2000, 3000, 4000, 5000]);
  });

  // A `tickCount` smaller than `tickValues.length` makes victory-native re-sample the array
  // by index (`downsampleTicks`), which can silently skip an interior value — e.g. 6 values
  // downsampled to 5 drops index 2 (4000) because `Math.round(2.5)` rounds up to index 3.
  test('sets tickCount to match tickValues.length so no interior tick is silently dropped', () => {
    renderChart({ goalValue: 5000 });

    const [yAxisConfig] = screen.getByTestId('cartesian-chart').props.yAxis;
    expect(yAxisConfig.tickCount).toBe(yAxisConfig.tickValues.length);
  });

  test('labels the y-axis in nice round steps from the data alone when no goalValue is supplied', () => {
    renderChart();

    const [yAxisConfig] = screen.getByTestId('cartesian-chart').props.yAxis;
    expect(yAxisConfig.tickValues).toEqual([0, 1000, 2000, 3000]);
  });
});
