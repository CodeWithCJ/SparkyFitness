import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { PointsArray } from 'victory-native';
import LineSeriesMark from '../../../src/components/charts/LineSeriesMark';

// The global `victory-native` mock in jest.setup.js exports neither `Line` nor `Scatter`,
// so both would be `undefined` here. Stub each as an identifiable View carrying its props
// so the forwarded values can be read back off the rendered element.
jest.mock('victory-native', () => {
  const ReactModule: typeof import('react') = require('react');
  const { View }: typeof import('react-native') = require('react-native');
  return {
    Line: (props: Record<string, unknown>) =>
      ReactModule.createElement(View, { testID: 'line-mark', ...props }),
    Scatter: (props: Record<string, unknown>) =>
      ReactModule.createElement(View, { testID: 'scatter-mark', ...props }),
  };
});

const makePoints = (count: number): PointsArray =>
  Array.from({ length: count }, (_, index) => ({
    x: index * 10,
    xValue: `2026-06-0${index + 1}`,
    y: 100 - index,
    yValue: 80 + index,
  }));

const ANIMATE = { type: 'timing', duration: 300 } as const;

describe('LineSeriesMark', () => {
  it('renders a Scatter instead of a Line for a one-point series', () => {
    render(<LineSeriesMark points={makePoints(1)} color="#ABCDEF" />);

    expect(screen.getByTestId('scatter-mark')).toBeTruthy();
    expect(screen.queryByTestId('line-mark')).toBeNull();
  });

  it("gives the single-point Scatter a circle shape, a 5px radius, and the caller's color", () => {
    render(<LineSeriesMark points={makePoints(1)} color="#ABCDEF" />);

    const scatter = screen.getByTestId('scatter-mark');
    expect(scatter.props.shape).toBe('circle');
    expect(scatter.props.radius).toBe(5);
    expect(scatter.props.color).toBe('#ABCDEF');
  });

  it("forwards the caller's animate config to the Scatter", () => {
    render(
      <LineSeriesMark
        points={makePoints(1)}
        color="#ABCDEF"
        animate={ANIMATE}
      />
    );

    expect(screen.getByTestId('scatter-mark').props.animate).toEqual(ANIMATE);
  });

  it('renders a Scatter without throwing for an empty series', () => {
    render(<LineSeriesMark points={makePoints(0)} color="#ABCDEF" />);

    expect(screen.getByTestId('scatter-mark').props.points).toHaveLength(0);
  });

  it('renders a Line once the series has two points', () => {
    render(<LineSeriesMark points={makePoints(2)} color="#ABCDEF" />);

    expect(screen.getByTestId('line-mark')).toBeTruthy();
    expect(screen.queryByTestId('scatter-mark')).toBeNull();
  });

  it('forwards every line prop verbatim for a multi-point series', () => {
    render(
      <LineSeriesMark
        points={makePoints(3)}
        color="#ABCDEF"
        strokeWidth={2}
        curveType="cardinal"
        connectMissingData
        animate={ANIMATE}
      />
    );

    const line = screen.getByTestId('line-mark');
    expect(line.props.color).toBe('#ABCDEF');
    expect(line.props.strokeWidth).toBe(2);
    expect(line.props.curveType).toBe('cardinal');
    expect(line.props.connectMissingData).toBe(true);
    expect(line.props.animate).toEqual(ANIMATE);
  });
});
