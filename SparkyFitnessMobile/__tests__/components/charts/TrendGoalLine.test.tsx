import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { ChartBounds, Scale } from 'victory-native';
import TrendGoalLine from '../../../src/components/charts/TrendGoalLine';

// The global `@shopify/react-native-skia` mock in jest.setup.js renders `Line` and
// `DashPathEffect` as `null`, so neither prop wiring nor "did it render at all" could be
// asserted against it. Stub each as an identifiable View carrying its props instead.
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
    DashPathEffect: (props: Record<string, unknown>) =>
      ReactModule.createElement(View, { testID: 'goal-line-dash', ...props }),
  };
});

const chartBounds: ChartBounds = { left: 10, right: 210, top: 5, bottom: 105 };

// A stand-in linear scale simple enough to hand-verify: yScale(v) = 100 - v.
const yScale = ((value: number) => 100 - value) as unknown as Scale;

describe('TrendGoalLine', () => {
  it('renders a dashed line spanning the chart at the goal value', () => {
    render(
      <TrendGoalLine
        chartBounds={chartBounds}
        yScale={yScale}
        goal={65}
        color="#94A3B8"
      />
    );

    const line = screen.getByTestId('goal-line');
    expect(line.props.p1).toEqual({ x: 10, y: 35 });
    expect(line.props.p2).toEqual({ x: 210, y: 35 });
    expect(line.props.color).toBe('#94A3B8');

    expect(screen.getByTestId('goal-line-dash')).toBeTruthy();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['zero', 0],
    ['negative', -5],
  ])('renders nothing when the goal is %s', (_label, goal) => {
    render(
      <TrendGoalLine
        chartBounds={chartBounds}
        yScale={yScale}
        goal={goal}
        color="#94A3B8"
      />
    );

    expect(screen.queryByTestId('goal-line')).toBeNull();
  });
});
