import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ExerciseTrendPoint } from '@workspace/shared';
import ExerciseTrendCard, {
  formatPeriodAxisLabel,
} from '../../src/components/ExerciseTrendCard';
import { useExerciseTrend } from '../../src/hooks/useExerciseTrend';

jest.mock('../../src/hooks/useExerciseTrend', () => ({
  useExerciseTrend: jest.fn(),
}));

// The global `victory-native` mock drops the chart's children; render them with
// plotted points so the record dots can be checked.
jest.mock('victory-native', () => {
  const ReactModule: typeof import('react') = require('react');
  const { View }: typeof import('react-native') = require('react-native');
  return {
    CartesianChart: ({
      children,
      data,
    }: {
      children: (arg: unknown) => React.ReactNode;
      data: { periodStart: string; value: number; record: number | null }[];
    }) => {
      const renderArg = ReactModule.useMemo(
        () => ({
          points: {
            value: data.map((datum, index) => ({
              x: index * 10,
              xValue: datum.periodStart,
              y: 100 - index,
              yValue: datum.value,
            })),
            record: data.map((datum, index) => ({
              x: index * 10,
              xValue: datum.periodStart,
              y: datum.record == null ? undefined : 100 - index,
              yValue: datum.record,
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

// Selecting a point is the overlay's job; a stand-in that picks the second one.
jest.mock('../../src/components/ChartTouchOverlay', () => {
  const ReactModule: typeof import('react') = require('react');
  const { Pressable }: typeof import('react-native') = require('react-native');
  return {
    __esModule: true,
    default: ({ onSelect }: { onSelect: (index: number) => void }) =>
      ReactModule.createElement(Pressable, {
        testID: 'select-second-point',
        onPress: () => onSelect(1),
      }),
    ChartLayoutReporter: () => null,
    EMPTY_CHART_TOUCH_LAYOUT: {},
    createChartTouchLayoutSignature: () => '',
  };
});

jest.mock('@shopify/react-native-skia', () => ({
  matchFont: jest.fn(() => null),
}));

const mockUseExerciseTrend = useExerciseTrend as jest.MockedFunction<
  typeof useExerciseTrend
>;

const mockRefetch = jest.fn();

// Stable across renders, as the real hook's memoized points are.
const onePoint: ExerciseTrendPoint[] = [
  { periodStart: '2026-01-01', valueKg: 20, isRecord: true },
];

const points: ExerciseTrendPoint[] = [
  { periodStart: '2026-09-01', valueKg: 20, isRecord: true },
  { periodStart: '2026-10-01', valueKg: 18, isRecord: false },
  { periodStart: '2026-11-01', valueKg: 23, isRecord: true },
];

const mockTrend = (
  overrides: Partial<ReturnType<typeof useExerciseTrend>> = {}
) =>
  mockUseExerciseTrend.mockReturnValue({
    points,
    sessionCount: 5,
    period: 'month',
    currentPeriodStart: '2026-11-01',
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: mockRefetch,
    ...overrides,
  });

describe('ExerciseTrendCard', () => {
  beforeEach(() => {
    mockUseExerciseTrend.mockReset();
    mockRefetch.mockReset();
  });

  it('shows the latest value in the weight unit and the change over the view', () => {
    mockTrend();
    render(<ExerciseTrendCard exerciseId="ex-1" weightUnit="kg" />);
    expect(screen.getByTestId('exercise-trend-value')).toHaveTextContent(
      '23 kg'
    );
    // (23 - 20) / 20 = 15%
    expect(screen.getByTestId('exercise-trend-change')).toHaveTextContent(
      '▲ 15%'
    );
  });

  it('converts to pounds', () => {
    mockTrend();
    render(<ExerciseTrendCard exerciseId="ex-1" weightUnit="lbs" />);
    expect(screen.getByTestId('exercise-trend-value')).toHaveTextContent(
      '50.7 lbs'
    );
  });

  it('opens on estimated 1RM by month and switches metric and period', () => {
    mockTrend();
    render(<ExerciseTrendCard exerciseId="ex-1" weightUnit="kg" />);
    expect(mockUseExerciseTrend).toHaveBeenLastCalledWith(
      'ex-1',
      'month',
      'estimated1RM'
    );

    fireEvent.press(screen.getByTestId('exercise-trend-metric-volume'));
    expect(mockUseExerciseTrend).toHaveBeenLastCalledWith(
      'ex-1',
      'month',
      'volume'
    );

    fireEvent.press(screen.getByText('Weeks'));
    expect(mockUseExerciseTrend).toHaveBeenLastCalledWith(
      'ex-1',
      'week',
      'volume'
    );
  });

  it('marks only the record points', () => {
    mockTrend();
    render(<ExerciseTrendCard exerciseId="ex-1" weightUnit="kg" />);
    const scatter = screen.getByTestId('scatter-mark');
    const recordPoints = (
      scatter.props.points as { yValue: number | null }[]
    ).filter((point) => point.yValue != null);
    expect(recordPoints.map((point) => point.yValue)).toEqual([20, 23]);
  });

  it('keeps the card with an empty message in another view', () => {
    mockTrend();
    const { rerender } = render(
      <ExerciseTrendCard exerciseId="ex-1" weightUnit="kg" />
    );
    fireEvent.press(screen.getByText('Weeks'));
    mockTrend({ points: [] });
    rerender(<ExerciseTrendCard exerciseId="ex-1" weightUnit="kg" />);
    expect(screen.getByTestId('exercise-trend-card')).toBeTruthy();
    expect(screen.getByText('Nothing logged in this period')).toBeTruthy();
  });
});

describe('ExerciseTrendCard states', () => {
  beforeEach(() => {
    mockUseExerciseTrend.mockReset();
    mockRefetch.mockReset();
  });

  it('shows a falling trend', () => {
    mockTrend({
      points: [
        { periodStart: '2026-10-01', valueKg: 40, isRecord: true },
        { periodStart: '2026-11-01', valueKg: 30, isRecord: false },
      ],
    });
    render(<ExerciseTrendCard exerciseId="ex-1" weightUnit="kg" />);
    expect(screen.getByTestId('exercise-trend-change')).toHaveTextContent(
      '▼ 25%'
    );
  });

  it('leaves the period still under way out of the volume change', () => {
    mockTrend({
      points: [
        { periodStart: '2026-09-01', valueKg: 1000, isRecord: true },
        { periodStart: '2026-10-01', valueKg: 1200, isRecord: true },
        { periodStart: '2026-11-01', valueKg: 100, isRecord: false },
      ],
    });
    render(<ExerciseTrendCard exerciseId="ex-1" weightUnit="kg" />);
    fireEvent.press(screen.getByTestId('exercise-trend-metric-volume'));
    expect(screen.getByTestId('exercise-trend-change')).toHaveTextContent(
      '▲ 20%'
    );
  });

  it('shows the tapped point with its period instead of the change', () => {
    mockTrend();
    render(<ExerciseTrendCard exerciseId="ex-1" weightUnit="kg" />);
    fireEvent.press(screen.getByTestId('select-second-point'));
    expect(screen.getByTestId('exercise-trend-value')).toHaveTextContent(
      '18 kg'
    );
    expect(screen.queryByTestId('exercise-trend-change')).toBeNull();
  });

  it('shows volume in whole numbers', () => {
    mockTrend({
      points: [
        { periodStart: '2025-01-01', valueKg: 4000, isRecord: true },
        { periodStart: '2026-01-01', valueKg: 15267.3, isRecord: true },
      ],
    });
    render(<ExerciseTrendCard exerciseId="ex-1" weightUnit="kg" />);
    fireEvent.press(screen.getByTestId('exercise-trend-metric-volume'));
    expect(screen.getByTestId('exercise-trend-value')).toHaveTextContent(
      '15,267 kg × reps'
    );
  });

  it('opens on Years when the last 12 months hold fewer than two sessions', () => {
    mockUseExerciseTrend.mockImplementation((_id, period) => ({
      points,
      sessionCount: period === 'month' ? 1 : 6,
      period,
      currentPeriodStart: '2026-01-01',
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
    }));
    render(<ExerciseTrendCard exerciseId="ex-1" weightUnit="kg" />);
    expect(mockUseExerciseTrend).toHaveBeenLastCalledWith(
      'ex-1',
      'year',
      'estimated1RM'
    );
    expect(screen.getByTestId('exercise-trend-card')).toBeTruthy();
  });

  it('stays hidden when even Years holds fewer than two sessions', () => {
    mockUseExerciseTrend.mockImplementation((_id, period) => ({
      points: onePoint,
      sessionCount: 1,
      period,
      currentPeriodStart: '2026-01-01',
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
    }));
    render(<ExerciseTrendCard exerciseId="ex-1" weightUnit="kg" />);
    expect(screen.queryByTestId('exercise-trend-card')).toBeNull();
  });

  it('shows loading while a retry runs', () => {
    mockTrend({ points: [], isError: true, isFetching: true });
    render(<ExerciseTrendCard exerciseId="ex-1" weightUnit="kg" />);
    expect(screen.getByText('Loading...')).toBeTruthy();
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('says it is loading', () => {
    mockTrend({ points: [], isLoading: true });
    render(<ExerciseTrendCard exerciseId="ex-1" weightUnit="kg" />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('offers a retry when the read fails', () => {
    mockTrend({ points: [], isError: true });
    render(<ExerciseTrendCard exerciseId="ex-1" weightUnit="kg" />);
    expect(screen.getByText('Could not load progress')).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(mockRefetch).toHaveBeenCalled();
  });
});

describe('formatPeriodAxisLabel', () => {
  it('labels a year by its number', () => {
    expect(formatPeriodAxisLabel('2026-01-01', 'year')).toBe('2026');
  });

  it('labels a month by its short name and a week by its first day', () => {
    expect(formatPeriodAxisLabel('2026-11-01', 'month')).toBe('Nov');
    expect(formatPeriodAxisLabel('2026-11-16', 'week')).toBe('Nov 16');
  });
});
