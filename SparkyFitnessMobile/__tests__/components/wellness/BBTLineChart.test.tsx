import React from 'react';
import { render, screen } from '@testing-library/react-native';
import BBTLineChart from '../../../src/components/wellness/BBTLineChart';

// Same reason as `WeightLineChart.test.tsx`: the global `victory-native` mock renders no
// chart children and exports no marks. Note the y-key here is `yValue`, not `weight`.
jest.mock('victory-native', () => {
  const ReactModule: typeof import('react') = require('react');
  const { View }: typeof import('react-native') = require('react-native');
  return {
    CartesianChart: ({
      children,
      data,
    }: {
      children: (arg: unknown) => React.ReactNode;
      data: { xValue: string; yValue: number }[];
    }) => {
      // The render arg has to keep a stable identity across renders. `ChartLayoutReporter`
      // reports it through an effect keyed on it, and `BBTLineChart` feeds that straight
      // into state — fresh objects here would loop until the heap gives out.
      const renderArg = ReactModule.useMemo(
        () => ({
          points: {
            yValue: data.map((datum, index) => ({
              x: index * 10,
              xValue: datum.xValue,
              y: 100 - index,
              yValue: datum.yValue,
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

const bbtSeries = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    date: `2026-06-0${index + 1}`,
    bbt: 36.4 + index * 0.1,
  }));

const renderChart = (data: ReturnType<typeof bbtSeries>) =>
  render(<BBTLineChart data={data} isLoading={false} />);

describe('BBTLineChart', () => {
  it('draws a point mark for a single temperature reading', () => {
    renderChart(bbtSeries(1));

    expect(screen.getByTestId('scatter-mark')).toBeTruthy();
    expect(screen.queryByTestId('line-mark')).toBeNull();
  });

  it('draws a line for several temperature readings', () => {
    renderChart(bbtSeries(3));

    expect(screen.getByTestId('line-mark')).toBeTruthy();
    expect(screen.queryByTestId('scatter-mark')).toBeNull();
  });

  it("does not pick up the weight chart's curve or animation options", () => {
    renderChart(bbtSeries(3));

    const line = screen.getByTestId('line-mark');
    expect(line.props.strokeWidth).toBe(2);
    expect(line.props.curveType).toBeUndefined();
    expect(line.props.connectMissingData).toBeUndefined();
    expect(line.props.animate).toBeUndefined();
  });

  it('keeps the empty state when there are no readings', () => {
    renderChart([]);

    expect(
      screen.getByText('Log daily temperature logs to view your BBT chart.')
    ).toBeTruthy();
    expect(screen.queryByTestId('line-mark')).toBeNull();
    expect(screen.queryByTestId('scatter-mark')).toBeNull();
  });
});
