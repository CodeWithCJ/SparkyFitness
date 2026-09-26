import React from 'react';
import { render, screen } from '@testing-library/react-native';
import WeightLineChart from '../../src/components/WeightLineChart';
import type { WeightDataPoint } from '../../src/hooks/useMeasurementsRange';

// The global `victory-native` mock in jest.setup.js drops `CartesianChart`'s children and
// exports neither `Line` nor `Scatter`, so no mark would ever render. Stub the chart to
// invoke its render-prop with plotted points, and each mark as an identifiable View.
// `LineSeriesMark` itself is deliberately left real, so these cases assert what the user
// actually sees rather than only the prop wiring.
jest.mock('victory-native', () => {
  const ReactModule: typeof import('react') = require('react');
  const { View }: typeof import('react-native') = require('react-native');
  return {
    CartesianChart: ({
      children,
      data,
      domain,
      yAxis,
    }: {
      children: (arg: unknown) => React.ReactNode;
      data: { day: string; weight: number }[];
      domain?: { y?: [number, number] };
      yAxis?: unknown;
    }) => {
      // Stable identity across renders: `ChartLayoutReporter` reports the render arg through
      // an effect keyed on it, so fresh objects each render would spin the chart's layout state.
      const renderArg = ReactModule.useMemo(
        () => ({
          points: {
            weight: data.map((datum, index) => ({
              x: index * 10,
              xValue: datum.day,
              y: 100 - index,
              yValue: datum.weight,
            })),
          },
          chartBounds: { left: 0, right: 100, top: 0, bottom: 100 },
          // Identity scale: simple enough for a test to hand-verify a goal line's position.
          yScale: (value: number) => value,
        }),
        [data]
      );

      return ReactModule.createElement(
        View,
        { testID: 'cartesian-chart', domain, yAxis },
        children(renderArg)
      );
    },
    Line: (props: Record<string, unknown>) =>
      ReactModule.createElement(View, { testID: 'line-mark', ...props }),
    Scatter: (props: Record<string, unknown>) =>
      ReactModule.createElement(View, { testID: 'scatter-mark', ...props }),
  };
});

jest.mock('@shopify/react-native-skia', () => {
  const ReactModule: typeof import('react') = require('react');
  const { View }: typeof import('react-native') = require('react-native');
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

const weightSeries = (count: number): WeightDataPoint[] =>
  Array.from({ length: count }, (_, index) => ({
    day: `2026-06-0${index + 1}`,
    weight: 80 + index,
  }));

const renderChart = (data: WeightDataPoint[], goal?: number | null) =>
  render(
    <WeightLineChart
      data={data}
      isLoading={false}
      isError={false}
      range="7d"
      unit="kg"
      goal={goal}
    />
  );

describe('WeightLineChart', () => {
  it('draws a point mark when the window holds a single weigh-in', () => {
    renderChart(weightSeries(1));

    expect(screen.getByTestId('scatter-mark')).toBeTruthy();
    expect(screen.queryByTestId('line-mark')).toBeNull();
  });

  it('draws a line when the window holds several weigh-ins', () => {
    renderChart(weightSeries(3));

    expect(screen.getByTestId('line-mark')).toBeTruthy();
    expect(screen.queryByTestId('scatter-mark')).toBeNull();
  });

  it("keeps the weight line's stroke, curve, and animation settings", () => {
    renderChart(weightSeries(3));

    const line = screen.getByTestId('line-mark');
    expect(line.props.strokeWidth).toBe(2);
    expect(line.props.curveType).toBe('cardinal');
    expect(line.props.connectMissingData).toBe(true);
    expect(line.props.animate).toEqual({ type: 'timing', duration: 300 });
    // The global `uniwind` mock resolves every CSS variable to this value.
    expect(line.props.color).toBe('#888888');
  });

  // The pager only reaches Weight with an empty window through its fallback, when no shown
  // trend has data. Returning null there left the Health Trends heading over blank space,
  // so this card carries its own empty state like Steps and Sleep do.
  it('says there is no weight data when the window is empty and the query is idle', () => {
    renderChart([]);

    expect(screen.getByText('No weight data for this period')).toBeTruthy();
    expect(screen.getByText('Weight')).toBeTruthy();
    expect(screen.queryByTestId('cartesian-chart')).toBeNull();
  });

  it('expands the y-domain to a nice round range that includes a goal outside the plotted range', () => {
    // weightSeries(3) plots 80, 81, 82.
    renderChart(weightSeries(3), 65);

    expect(screen.getByTestId('cartesian-chart').props.domain).toEqual({
      y: [65, 85],
    });
  });

  it('labels a nice round whole-number range from the data alone when there is no goal', () => {
    renderChart(weightSeries(3));

    expect(screen.getByTestId('cartesian-chart').props.domain).toEqual({
      y: [80, 82],
    });
  });

  it('renders a dashed goal line at the goal value', () => {
    renderChart(weightSeries(3), 65);

    expect(screen.getByTestId('goal-line').props.p1).toEqual({ x: 0, y: 65 });
  });

  it('renders no goal line when there is no goal', () => {
    renderChart(weightSeries(3));

    expect(screen.queryByTestId('goal-line')).toBeNull();
  });

  it('labels the y-axis in nice round whole numbers up to a goal outside the plotted range', () => {
    // weightSeries(3) plots 80, 81, 82.
    renderChart(weightSeries(3), 65);

    const [yAxisConfig] = screen.getByTestId('cartesian-chart').props.yAxis;
    expect(yAxisConfig.tickValues).toEqual([65, 70, 75, 80, 85]);
  });

  it('labels the y-axis in whole numbers from the data alone when there is no goal', () => {
    renderChart(weightSeries(3));

    const [yAxisConfig] = screen.getByTestId('cartesian-chart').props.yAxis;
    expect(yAxisConfig.tickValues).toEqual([80, 81, 82]);
  });

  // A `tickCount` smaller than `tickValues.length` makes victory-native re-sample the array
  // by index (`downsampleTicks`), which can silently skip an interior value — e.g. 6 values
  // downsampled to 5 drops index 2 because `Math.round(2.5)` rounds up to index 3.
  it('sets tickCount to match tickValues.length so no interior tick is silently dropped', () => {
    // A 60-65 range labels in 6 whole-number steps (60,61,62,63,64,65) — one more than the
    // default 5-tick target.
    renderChart([{ day: '2026-06-01', weight: 65 }], 60);

    const [yAxisConfig] = screen.getByTestId('cartesian-chart').props.yAxis;
    expect(yAxisConfig.tickValues).toEqual([60, 61, 62, 63, 64, 65]);
    expect(yAxisConfig.tickCount).toBe(yAxisConfig.tickValues.length);
  });
});
