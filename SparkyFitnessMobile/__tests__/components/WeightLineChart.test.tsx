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
    }: {
      children: (arg: unknown) => React.ReactNode;
      data: { day: string; weight: number }[];
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
        }),
        [data]
      );

      return ReactModule.createElement(
        View,
        { testID: 'cartesian-chart' },
        children(renderArg)
      );
    },
    Line: (props: Record<string, unknown>) =>
      ReactModule.createElement(View, { testID: 'line-mark', ...props }),
    Scatter: (props: Record<string, unknown>) =>
      ReactModule.createElement(View, { testID: 'scatter-mark', ...props }),
  };
});

const weightSeries = (count: number): WeightDataPoint[] =>
  Array.from({ length: count }, (_, index) => ({
    day: `2026-06-0${index + 1}`,
    weight: 80 + index,
  }));

const renderChart = (data: WeightDataPoint[]) =>
  render(
    <WeightLineChart
      data={data}
      isLoading={false}
      isError={false}
      range="7d"
      unit="kg"
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
});
