import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import HealthTrendsPager from '../../src/components/HealthTrendsPager';
import type { HealthTrendSeries } from '../../src/types/healthTrends';

// The three charts are replaced by bare testID stubs so this suite asserts page
// composition only. `react-native-pager-view` is mocked globally in jest.setup.js.
// Each factory has to be inlined — Babel rejects a shared stub builder here.
jest.mock('../../src/components/StepsBarChart', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => ReactModule.createElement(View, { testID: 'steps-chart' }),
  };
});

jest.mock('../../src/components/WeightLineChart', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => ReactModule.createElement(View, { testID: 'weight-chart' }),
  };
});

jest.mock('../../src/components/SleepBarChart', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => ReactModule.createElement(View, { testID: 'sleep-chart' }),
  };
});

type PagerProps = React.ComponentProps<typeof HealthTrendsPager>;

const emptySeries = <TPoint,>(): HealthTrendSeries<TPoint> => ({
  data: [],
  isLoading: false,
  isError: false,
});

const populated = <TPoint,>(point: TPoint): HealthTrendSeries<TPoint> => ({
  data: [point],
  isLoading: false,
  isError: false,
});

const stepsSeries = populated({ day: '2026-06-03', steps: 5000 });
const weightSeries = populated({ day: '2026-06-03', weight: 80 });
const sleepSeries = populated({ day: '2026-06-03', hours: 7.5 });

const baseProps = (): PagerProps => ({
  steps: stepsSeries,
  weight: emptySeries(),
  sleep: emptySeries(),
  range: '7d',
  weightUnit: 'kg',
  activePage: 0,
  onPageSelected: jest.fn(),
});

const renderPager = (overrides: Partial<PagerProps> = {}) => {
  const view = render(<HealthTrendsPager {...baseProps()} {...overrides} />);
  return {
    ...view,
    rerenderPager: (next: Partial<PagerProps> = {}) =>
      view.rerender(<HealthTrendsPager {...baseProps()} {...next} />),
  };
};

const chartOrder = (): string[] =>
  screen.getAllByTestId(/-chart$/).map((node) => node.props.testID as string);

const dots = () => screen.queryAllByTestId(/^health-trends-dot-/);

const selectedDotIndex = (): number =>
  dots().findIndex((dot) => dot.props.accessibilityState?.selected === true);

describe('HealthTrendsPager', () => {
  test('renders steps alone when no other trend has data', () => {
    renderPager();

    expect(screen.getByTestId('steps-chart')).toBeTruthy();
    expect(screen.queryByTestId('weight-chart')).toBeNull();
    expect(screen.queryByTestId('sleep-chart')).toBeNull();
    expect(screen.queryByTestId('pager-view')).toBeNull();
    expect(dots()).toHaveLength(0);
  });

  test('orders the pages steps, weight, sleep', () => {
    renderPager({ weight: weightSeries, sleep: sleepSeries });

    expect(chartOrder()).toEqual(['steps-chart', 'weight-chart', 'sleep-chart']);
    expect(dots()).toHaveLength(3);
  });

  test('renders sleep second when weight has no data', () => {
    renderPager({ sleep: sleepSeries });

    expect(chartOrder()).toEqual(['steps-chart', 'sleep-chart']);
    expect(dots()).toHaveLength(2);
  });

  test('gives a still-loading trend a page so its state is visible', () => {
    renderPager({ sleep: { data: [], isLoading: true, isError: false } });

    expect(screen.getByTestId('sleep-chart')).toBeTruthy();
    expect(dots()).toHaveLength(2);
  });

  test('gives a failed trend a page so its error is visible', () => {
    renderPager({ sleep: { data: [], isLoading: false, isError: true } });

    expect(screen.getByTestId('sleep-chart')).toBeTruthy();
    expect(dots()).toHaveLength(2);
  });

  test('keeps steps visible even with no step data', () => {
    renderPager({ steps: emptySeries(), weight: weightSeries });

    expect(chartOrder()).toEqual(['steps-chart', 'weight-chart']);
  });

  test('clamps the active dot when activePage exceeds the page count', () => {
    renderPager({ weight: weightSeries, activePage: 2 });

    expect(dots()).toHaveLength(2);
    expect(selectedDotIndex()).toBe(1);
  });

  test('keeps the highlighted dot stable when a trend arrives late', () => {
    const { rerenderPager } = renderPager({ weight: weightSeries, activePage: 1 });
    expect(dots()).toHaveLength(2);

    rerenderPager({ weight: weightSeries, sleep: sleepSeries, activePage: 1 });

    expect(dots()).toHaveLength(3);
    expect(selectedDotIndex()).toBe(1);
  });

  test('clamps the highlighted dot when a trend disappears', () => {
    const { rerenderPager } = renderPager({
      weight: weightSeries,
      sleep: sleepSeries,
      activePage: 2,
    });
    expect(selectedDotIndex()).toBe(2);

    rerenderPager({ weight: weightSeries, activePage: 2 });

    expect(dots()).toHaveLength(2);
    expect(selectedDotIndex()).toBe(1);
  });

  test('forwards the selected page position', () => {
    const onPageSelected = jest.fn();
    renderPager({ weight: weightSeries, sleep: sleepSeries, onPageSelected });

    fireEvent(screen.getByTestId('pager-view'), 'pageSelected', {
      nativeEvent: { position: 2 },
    });

    expect(onPageSelected).toHaveBeenCalledWith(2);
  });
});
