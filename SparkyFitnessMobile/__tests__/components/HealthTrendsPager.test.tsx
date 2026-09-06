import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import PagerView from 'react-native-pager-view';
import HealthTrendsPager from '../../src/components/HealthTrendsPager';
import type { SleepTrendSeries } from '../../src/hooks/useHealthTrends';
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

jest.mock('../../src/components/SleepTimelineChart', () => {
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

/**
 * Sleep is padded to one entry per day, so `data` is never empty and the pager gates its
 * page on `nightsWithData` instead. Both fixtures below carry a full window; only the
 * night count says whether any of it is real.
 */
const sleepTrend = (
  overrides: Partial<SleepTrendSeries> = {}
): SleepTrendSeries => ({
  data: [
    {
      day: '2026-06-03',
      timeInBedSeconds: 0,
      timeAsleepSeconds: null,
      segments: [],
      zone: null,
    },
  ],
  isLoading: false,
  isError: false,
  averageTimeInBedSeconds: null,
  averageTimeAsleepSeconds: null,
  nightsWithData: 0,
  ...overrides,
});

const sleepSeries = sleepTrend({
  data: [
    {
      day: '2026-06-03',
      timeInBedSeconds: 28800,
      timeAsleepSeconds: 27000,
      segments: [{ stage: 'other', startMs: 0, endMs: 28800000 }],
      zone: null,
    },
  ],
  averageTimeInBedSeconds: 28800,
  averageTimeAsleepSeconds: 27000,
  nightsWithData: 1,
});

const baseProps = (): PagerProps => ({
  steps: stepsSeries,
  weight: emptySeries(),
  sleep: sleepTrend(),
  range: '7d',
  weightUnit: 'kg',
  visibleTrends: ['steps', 'weight', 'sleep'],
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
  screen.queryAllByTestId(/-chart$/).map((node) => node.props.testID as string);

const dots = () => screen.queryAllByTestId(/^health-trends-dot-/);

const selectedDotIndex = (): number =>
  dots().findIndex((dot) => dot.props.accessibilityState?.selected === true);

// The global pager mock hangs its imperative handle off the component itself.
const pagerMock = PagerView as unknown as {
  setPageWithoutAnimation: jest.Mock;
};

describe('HealthTrendsPager', () => {
  beforeEach(() => {
    pagerMock.setPageWithoutAnimation.mockClear();
  });

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

    expect(chartOrder()).toEqual([
      'steps-chart',
      'weight-chart',
      'sleep-chart',
    ]);
    expect(dots()).toHaveLength(3);
  });

  test('renders sleep second when weight has no data', () => {
    renderPager({ sleep: sleepSeries });

    expect(chartOrder()).toEqual(['steps-chart', 'sleep-chart']);
    expect(dots()).toHaveLength(2);
  });

  test('gives a still-loading trend a page so its state is visible', () => {
    renderPager({ sleep: sleepTrend({ isLoading: true }) });

    expect(screen.getByTestId('sleep-chart')).toBeTruthy();
    expect(dots()).toHaveLength(2);
  });

  test('gives a failed trend a page so its error is visible', () => {
    renderPager({ sleep: sleepTrend({ isError: true }) });

    expect(screen.getByTestId('sleep-chart')).toBeTruthy();
    expect(dots()).toHaveLength(2);
  });

  test('clamps the active dot when activePage exceeds the page count', () => {
    renderPager({ weight: weightSeries, activePage: 2 });

    expect(dots()).toHaveLength(2);
    expect(selectedDotIndex()).toBe(1);
  });

  test('keeps the highlighted dot stable when a trend arrives late', () => {
    const { rerenderPager } = renderPager({
      weight: weightSeries,
      activePage: 1,
    });
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

  test('keeps the user on Sleep when Weight is inserted ahead of it', () => {
    // Weight hides itself until the window holds a weigh-in, so logging one turns
    // [steps, sleep] into [steps, weight, sleep] on the next focus refetch. Index 1 was
    // Sleep and is now Weight — tracking the index alone swaps the chart under the user.
    const onPageSelected = jest.fn();
    const { rerenderPager } = renderPager({
      sleep: sleepSeries,
      activePage: 1,
      onPageSelected,
    });
    expect(chartOrder()).toEqual(['steps-chart', 'sleep-chart']);

    rerenderPager({
      weight: weightSeries,
      sleep: sleepSeries,
      activePage: 1,
      onPageSelected,
    });

    expect(chartOrder()).toEqual([
      'steps-chart',
      'weight-chart',
      'sleep-chart',
    ]);
    expect(pagerMock.setPageWithoutAnimation).toHaveBeenCalledWith(2);
    expect(onPageSelected).toHaveBeenCalledWith(2);

    // Once the dashboard applies it, Sleep is the highlighted page again.
    onPageSelected.mockClear();
    pagerMock.setPageWithoutAnimation.mockClear();
    rerenderPager({
      weight: weightSeries,
      sleep: sleepSeries,
      activePage: 2,
      onPageSelected,
    });

    expect(selectedDotIndex()).toBe(2);
    expect(onPageSelected).not.toHaveBeenCalled();
    expect(pagerMock.setPageWithoutAnimation).not.toHaveBeenCalled();
  });

  test('moves the pager and the dashboard off a page removed under them', () => {
    // Clamping the dot is not enough on its own: the native pager and the dashboard's
    // chartPage both have to land on a page that still exists.
    const onPageSelected = jest.fn();
    const { rerenderPager } = renderPager({
      weight: weightSeries,
      sleep: sleepSeries,
      activePage: 2,
      onPageSelected,
    });
    expect(pagerMock.setPageWithoutAnimation).not.toHaveBeenCalled();

    rerenderPager({ weight: weightSeries, activePage: 2, onPageSelected });

    expect(pagerMock.setPageWithoutAnimation).toHaveBeenCalledWith(1);
    expect(onPageSelected).toHaveBeenCalledWith(1);
  });

  test('leaves the reconciled selection alone when the removed trend returns', () => {
    const onPageSelected = jest.fn();
    const { rerenderPager } = renderPager({
      weight: weightSeries,
      sleep: sleepSeries,
      activePage: 2,
      onPageSelected,
    });

    // Sleep drops out and the selection settles on weight.
    rerenderPager({ weight: weightSeries, activePage: 2, onPageSelected });
    expect(onPageSelected).toHaveBeenLastCalledWith(1);

    // Sleep comes back. The user is on weight, which is still page 1, so nothing may move.
    onPageSelected.mockClear();
    pagerMock.setPageWithoutAnimation.mockClear();
    rerenderPager({
      weight: weightSeries,
      sleep: sleepSeries,
      activePage: 1,
      onPageSelected,
    });

    expect(onPageSelected).not.toHaveBeenCalled();
    expect(pagerMock.setPageWithoutAnimation).not.toHaveBeenCalled();
    expect(chartOrder()).toEqual([
      'steps-chart',
      'weight-chart',
      'sleep-chart',
    ]);
    expect(selectedDotIndex()).toBe(1);
  });

  test('renders pages in the order the user chose', () => {
    renderPager({
      weight: weightSeries,
      visibleTrends: ['weight', 'steps'],
    });

    expect(chartOrder()).toEqual(['weight-chart', 'steps-chart']);
  });

  test('omits a trend the user hid, even with data for it', () => {
    renderPager({
      weight: weightSeries,
      visibleTrends: ['steps', 'sleep'],
    });

    expect(screen.queryByTestId('weight-chart')).toBeNull();
  });

  test('still hides a shown trend that has no data in this window', () => {
    renderPager({
      weight: emptySeries(),
      visibleTrends: ['steps', 'weight'],
    });

    expect(chartOrder()).toEqual(['steps-chart']);
  });

  // The charts are mocked here, so this only asserts which page the fallback picks. That
  // the page is not blank is each chart's own responsibility, covered by its empty-state
  // test — see `WeightLineChart.test.tsx`, which is where the fallback used to render
  // nothing at all.
  test('falls back to the first shown trend when every shown trend is empty', () => {
    renderPager({
      steps: emptySeries(),
      weight: emptySeries(),
      sleep: sleepTrend({ nightsWithData: 0 }),
      visibleTrends: ['weight', 'steps'],
    });

    expect(chartOrder()).toEqual(['weight-chart']);
  });

  test('renders the all-hidden card when nothing is visible', () => {
    renderPager({ visibleTrends: [] });

    expect(
      screen.getByText(
        'All graphs are hidden. Choose which to show in Dashboard Settings.'
      )
    ).toBeTruthy();
    expect(screen.queryByTestId('pager-view')).toBeNull();
    expect(chartOrder()).toEqual([]);
  });

  test('keeps sleep gated on nightsWithData rather than data.length', () => {
    // The sleep series is padded to one entry per day, so `data` is never empty.
    renderPager({
      sleep: sleepTrend(),
      visibleTrends: ['steps', 'sleep'],
    });

    expect(screen.queryByTestId('sleep-chart')).toBeNull();
  });

  test('keeps the user on the same trend across a pure reorder', () => {
    const onPageSelected = jest.fn();
    const { rerenderPager } = renderPager({
      weight: weightSeries,
      sleep: sleepSeries,
      visibleTrends: ['steps', 'weight', 'sleep'],
      activePage: 1,
      onPageSelected,
    });
    expect(chartOrder()).toEqual([
      'steps-chart',
      'weight-chart',
      'sleep-chart',
    ]);

    rerenderPager({
      weight: weightSeries,
      sleep: sleepSeries,
      visibleTrends: ['weight', 'steps', 'sleep'],
      activePage: 1,
      onPageSelected,
    });

    expect(chartOrder()).toEqual([
      'weight-chart',
      'steps-chart',
      'sleep-chart',
    ]);
    expect(pagerMock.setPageWithoutAnimation).toHaveBeenCalledWith(0);
    expect(onPageSelected).toHaveBeenCalledWith(0);
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
