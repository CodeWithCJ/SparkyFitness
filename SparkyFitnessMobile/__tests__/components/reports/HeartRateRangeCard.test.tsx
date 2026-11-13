import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import HeartRateRangeCard from '../../../src/components/reports/HeartRateRangeCard';
import { CHART_TOUCH_LONG_PRESS_DELAY_MS } from '../../../src/components/ChartTouchOverlay';
import { initializeI18n } from '../../../src/localization/i18n';

const mockDailyAverages = jest.fn();
jest.mock('../../../src/hooks/useHeartRateTimelines', () => ({
  useHeartRateDailyAverages: (...args: unknown[]) => mockDailyAverages(...args),
}));
jest.mock('../../../src/components/charts/LineSeriesMark', () => ({
  __esModule: true,
  default: () => null,
}));

/**
 * A stub chart that still hands the render prop a real layout, so
 * `ChartLayoutReporter` reports it and a touch resolves to a day.
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
        points: { avgBpm: unknown[] };
        chartBounds: {
          left: number;
          right: number;
          top: number;
          bottom: number;
        };
      }) => React.ReactNode;
      data: { day: string; avgBpm: number }[];
    }) =>
      ReactModule.createElement(
        View,
        null,
        children({
          points: {
            avgBpm: data.map((point, index) => ({
              x: 10 + index * 20,
              y: 50,
              xValue: point.day,
              yValue: point.avgBpm,
            })),
          },
          chartBounds: {
            left: 0,
            right: 20 * data.length,
            top: 0,
            bottom: 100,
          },
        })
      ),
  };
});

const days = [
  { day: '2026-10-18', avgBpm: 70, minBpm: 50, maxBpm: 120 },
  { day: '2026-10-19', avgBpm: 74, minBpm: 52, maxBpm: 140 },
];

const holdDay = (index: number) => {
  const x = 10 + index * 20;
  fireEvent(
    screen.getByTestId('heart-rate-range-touch-overlay'),
    'touchStart',
    {
      nativeEvent: {
        changedTouches: [{ locationX: x, locationY: 50 }],
        touches: [{ locationX: x, locationY: 50 }],
        locationX: x,
        locationY: 50,
      },
    }
  );
  act(() => {
    jest.advanceTimersByTime(CHART_TOUCH_LONG_PRESS_DELAY_MS);
  });
};

describe('HeartRateRangeCard selection', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.useFakeTimers();
    mockDailyAverages.mockReturnValue({
      days,
      isLoading: false,
      isError: false,
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('opens the held day and shows its figures', () => {
    const onSelectDay = jest.fn();
    render(
      <HeartRateRangeCard
        startDate="2026-10-14"
        endDate="2026-10-20"
        windowDays={7}
        onSelectDay={onSelectDay}
      />
    );
    holdDay(1);
    expect(onSelectDay).toHaveBeenCalledWith('2026-10-19');
    expect(screen.getByText(/^74 bpm avg \(52–140\)/)).toBeTruthy();
  });
});
