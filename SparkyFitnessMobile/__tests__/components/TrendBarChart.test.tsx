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
    }: {
      children: (arg: {
        points: { value: unknown[] };
        chartBounds: {
          left: number;
          right: number;
          top: number;
          bottom: number;
        };
      }) => React.ReactNode;
      data: { day: string; value: number }[];
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
      return ReactModule.createElement(
        View,
        { testID: 'cartesian-chart' },
        children({ points: { value: points }, chartBounds })
      );
    },
    Bar: () => null,
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
});
