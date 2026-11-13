import React from 'react';
import { render } from '@testing-library/react-native';
import type {
  CompareMetricKey,
  CompareSinceResponse,
  CompareSinceResult,
} from '@workspace/shared';

import CompareSinceChart from '../../../src/components/compare/CompareSinceChart';
import { initializeI18n } from '../../../src/localization/i18n';

// Run the render-prop with plotted points and a simple scale, and mark each
// mark as an identifiable View carrying its props.
jest.mock('victory-native', () => {
  const ReactModule: typeof import('react') = require('react');
  const { View }: typeof import('react-native') = require('react-native');
  return {
    CartesianChart: ({
      children,
      data,
      yKeys,
      xAxis,
    }: {
      children: (arg: unknown) => React.ReactNode;
      data: Record<string, number | null>[];
      yKeys: string[];
      xAxis: unknown;
    }) => {
      const points: Record<string, unknown[]> = {};
      for (const key of yKeys) {
        points[key] = data.map((d, i) => ({
          x: i * 10,
          xValue: i,
          y: 0,
          yValue: d[key],
        }));
      }
      return ReactModule.createElement(
        View,
        { testID: 'cartesian-chart', yKeys, xAxis },
        children({
          points,
          chartBounds: { left: 0, right: 100, top: 0, bottom: 200 },
          xScale: (value: number) => value * 10,
        })
      );
    },
    Line: (props: Record<string, unknown>) =>
      ReactModule.createElement(View, { testID: 'line-mark', ...props }),
  };
});

jest.mock('@shopify/react-native-skia', () => {
  const ReactModule: typeof import('react') = require('react');
  const { View }: typeof import('react-native') = require('react-native');
  return {
    DashPathEffect: () => null,
    matchFont: jest.fn(() => null),
    Rect: (props: Record<string, unknown>) =>
      ReactModule.createElement(View, { testID: 'shade', ...props }),
    Line: (props: Record<string, unknown>) =>
      ReactModule.createElement(View, { testID: 'start-marker', ...props }),
  };
});

const mockColors: Record<string, string> = {
  '--color-accent-primary': 'accent',
  '--color-cat-slate': 'slate',
  '--color-cat-teal': 'teal',
  '--color-text-muted': 'muted',
  '--color-text-secondary': 'secondary',
};
jest.mock('uniwind', () => ({
  useCSSVariable: (names: string[]) => names.map((name) => mockColors[name]),
}));

const stretch = (from: string, to: string, days: number) => ({
  from,
  to,
  days,
  valueDays: days,
});

function response(
  result: Partial<CompareSinceResult> = {},
  outcome: CompareMetricKey = 'mood',
  values: Record<string, number> = {
    '2026-09-01': 60,
    '2026-09-03': 70,
    '2026-09-05': 80,
  }
): CompareSinceResponse {
  return {
    mode: 'since',
    habit: { key: 'workoutMinutes', values: {} },
    outcome: { key: outcome, values },
    result: {
      status: 'ok',
      start: '2026-09-04',
      suggestedStart: '2026-09-04',
      before: stretch('2026-09-01', '2026-09-03', 3),
      since: stretch('2026-09-04', '2026-09-06', 3),
      line: 70,
      ...result,
    },
  };
}

describe('CompareSinceChart', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('draws the outcome over time with both stretches shaded, the start marked and the line across', () => {
    const { getAllByTestId, getByTestId, getByText, getByLabelText } = render(
      <CompareSinceChart response={response()} />
    );
    const shades = getAllByTestId('shade');
    expect(shades.map((s) => s.props.color)).toEqual(['slate', 'teal']);
    // Each day is a slot one unit wide, clipped to the plot.
    expect(shades.map((s) => [s.props.x, s.props.width])).toEqual([
      [0, 25],
      [25, 30],
    ]);
    // The marker sits where the start day begins.
    const marker = getByTestId('start-marker');
    expect(marker.props.p1).toEqual({ x: 25, y: 0 });
    expect(marker.props.p2).toEqual({ x: 25, y: 200 });

    const lines = getAllByTestId('line-mark');
    expect(lines).toHaveLength(2);
    const [line, outcome] = lines;
    expect(line.props.points.map((p: { yValue: number }) => p.yValue)).toEqual([
      7, 7, 7, 7, 7, 7,
    ]);
    expect(outcome.props.color).toBe('accent');
    expect(
      outcome.props.points.map((p: { yValue: number | null }) => p.yValue)
    ).toEqual([6, null, 7, null, 8, null]);

    expect(getByText('Mood')).toBeTruthy();
    expect(getByText('Before')).toBeTruthy();
    expect(getByText('Since')).toBeTruthy();
    expect(getByText('Line 7.0')).toBeTruthy();
    expect(
      getByLabelText('Mood over time, before and since Sep 4, 2026')
    ).toBeTruthy();
  });

  it('names days on a short axis and months with their year on a long one', () => {
    const label = (r: CompareSinceResponse, index: number) =>
      render(<CompareSinceChart response={r} />)
        .getByTestId('cartesian-chart')
        .props.xAxis.formatXLabel(index);
    expect(label(response(), 0)).toBe('Sep 1');
    const long = response(
      {
        start: '2026-04-01',
        before: stretch('2025-10-01', '2026-03-31', 182),
        since: stretch('2026-04-01', '2026-09-29', 182),
      },
      'mood',
      { '2025-10-01': 60 }
    );
    expect(label(long, 0)).toBe('Oct 2025');
    expect(label(long, 1000)).toBe('');
  });

  it('leaves an empty before stretch unshaded', () => {
    const { getAllByTestId, queryByText } = render(
      <CompareSinceChart
        response={response({
          before: stretch('2026-09-04', '2026-09-03', 0),
        })}
      />
    );
    const shades = getAllByTestId('shade');
    expect(shades.map((s) => s.props.color)).toEqual(['teal']);
    expect(queryByText('Before')).toBeNull();
  });

  it('draws no line for a yes/no outcome', () => {
    const { getAllByTestId, queryByText } = render(
      <CompareSinceChart
        response={response({ line: 1 }, 'meditated', {
          '2026-09-01': 1,
          '2026-09-05': 0,
        })}
      />
    );
    expect(getAllByTestId('line-mark')).toHaveLength(1);
    expect(queryByText(/^Line/)).toBeNull();
  });

  it('reads bedtime and its line as clock times', () => {
    const { getByText } = render(
      <CompareSinceChart
        response={response({ line: 300 }, 'bedtime', { '2026-09-02': 290 })}
      />
    );
    expect(getByText(/^Line 11:00\sPM$/)).toBeTruthy();
  });

  it('says so when nothing was logged', () => {
    const { getByText, queryByTestId } = render(
      <CompareSinceChart response={response({}, 'mood', {})} />
    );
    expect(getByText('Nothing logged in this range')).toBeTruthy();
    expect(queryByTestId('cartesian-chart')).toBeNull();
  });

  it('draws nothing without a start', () => {
    const { toJSON } = render(
      <CompareSinceChart
        response={response(
          {
            status: 'not_enough',
            reason: 'noStart',
            start: null,
            suggestedStart: null,
            before: undefined,
            since: undefined,
            line: 0,
          },
          'mood',
          {}
        )}
      />
    );
    expect(toJSON()).toBeNull();
  });
});
