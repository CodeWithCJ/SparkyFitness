import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import HeartRateDayTimelineCard from '../../../src/components/reports/HeartRateDayTimelineCard';
import HeartRateRangeCard from '../../../src/components/reports/HeartRateRangeCard';
import { initializeI18n } from '../../../src/localization/i18n';

const mockDayTimeline = jest.fn();
const mockDailyAverages = jest.fn();
jest.mock('../../../src/hooks/useHeartRateTimelines', () => ({
  useHeartRateDayTimeline: (...args: unknown[]) => mockDayTimeline(...args),
  useHeartRateDailyAverages: (...args: unknown[]) => mockDailyAverages(...args),
}));
jest.mock('../../../src/utils/dateUtils', () => ({
  ...jest.requireActual('../../../src/utils/dateUtils'),
  getTodayDate: () => '2026-10-20',
}));
jest.mock('victory-native', () => ({
  CartesianChart: () => null,
  Line: () => null,
  Scatter: () => null,
}));
const mockPreferences = jest.fn();
jest.mock('../../../src/hooks/usePreferences', () => ({
  usePreferences: () => mockPreferences(),
}));

const emptyTimeline = {
  points: [],
  daytimeAvg: null,
  sleepingAvg: null,
  sleepDipPct: null,
  minBpm: null,
  minMinutes: null,
  maxBpm: null,
  maxMinutes: null,
};

describe('HeartRateDayTimelineCard', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });
  beforeEach(() => {
    mockPreferences.mockReturnValue({ preferences: { time_format: 'HH:mm' } });
  });

  it('says so when the day has no readings', () => {
    mockDayTimeline.mockReturnValue({
      timeline: emptyTimeline,
      workouts: [],
      isLoading: false,
      isError: false,
    });
    const { getByTestId } = render(
      <HeartRateDayTimelineCard
        day="2026-10-19"
        minDay="2026-10-14"
        maxDay="2026-10-20"
        onChangeDay={jest.fn()}
      />
    );
    expect(getByTestId('heart-rate-day-empty')).toBeTruthy();
  });

  it('steps between days and stops at the window bounds', () => {
    mockDayTimeline.mockReturnValue({
      timeline: emptyTimeline,
      workouts: [],
      isLoading: false,
      isError: false,
    });
    const onChangeDay = jest.fn();
    const { getByTestId, rerender } = render(
      <HeartRateDayTimelineCard
        day="2026-10-19"
        minDay="2026-10-14"
        maxDay="2026-10-20"
        onChangeDay={onChangeDay}
      />
    );
    fireEvent.press(getByTestId('heart-rate-day-prev'));
    expect(onChangeDay).toHaveBeenCalledWith('2026-10-18');
    fireEvent.press(getByTestId('heart-rate-day-next'));
    expect(onChangeDay).toHaveBeenLastCalledWith('2026-10-20');

    onChangeDay.mockClear();
    rerender(
      <HeartRateDayTimelineCard
        day="2026-10-20"
        minDay="2026-10-14"
        maxDay="2026-10-20"
        onChangeDay={onChangeDay}
      />
    );
    fireEvent.press(getByTestId('heart-rate-day-next'));
    expect(onChangeDay).not.toHaveBeenCalled();

    rerender(
      <HeartRateDayTimelineCard
        day="2026-10-14"
        minDay="2026-10-14"
        maxDay="2026-10-20"
        onChangeDay={onChangeDay}
      />
    );
    fireEvent.press(getByTestId('heart-rate-day-prev'));
    expect(onChangeDay).not.toHaveBeenCalled();
  });

  const filledTimeline = {
    points: [{ minutes: 600, bpm: 70, isSleep: false, workoutName: null }],
    daytimeAvg: 80,
    sleepingAvg: 56,
    sleepDipPct: -30,
    minBpm: 52,
    minMinutes: 180,
    maxBpm: 150,
    maxMinutes: 1110,
  };

  const renderFilled = (state: { isLoading?: boolean; isError?: boolean }) => {
    mockDayTimeline.mockReturnValue({
      timeline: filledTimeline,
      workouts: [],
      isLoading: state.isLoading ?? false,
      isError: state.isError ?? false,
    });
    return render(
      <HeartRateDayTimelineCard
        day="2026-10-19"
        minDay="2026-10-14"
        maxDay="2026-10-20"
        onChangeDay={jest.fn()}
      />
    );
  };

  it('lists the day figures once there are readings', () => {
    const { getByText } = renderFilled({});
    expect(getByText('80 bpm')).toBeTruthy();
    expect(getByText('56 bpm')).toBeTruthy();
    expect(getByText('-30% against daytime')).toBeTruthy();
    expect(getByText('03:00')).toBeTruthy();
    expect(getByText('18:30')).toBeTruthy();
  });

  it('follows a 12 hour time format', () => {
    mockPreferences.mockReturnValue({ preferences: { time_format: 'h:mm A' } });
    const { getByText } = renderFilled({});
    expect(getByText(/^3:00\s?AM$/)).toBeTruthy();
    expect(getByText(/^6:30\s?PM$/)).toBeTruthy();
  });

  it('holds the day figures back while sleep loads or fails', () => {
    expect(renderFilled({ isLoading: true }).queryByText('80 bpm')).toBeNull();
    expect(renderFilled({ isError: true }).queryByText('80 bpm')).toBeNull();
  });
});

describe('HeartRateRangeCard', () => {
  it('says so when the period has no readings', () => {
    mockDailyAverages.mockReturnValue({
      days: [],
      isLoading: false,
      isError: false,
    });
    const { getByTestId } = render(
      <HeartRateRangeCard
        startDate="2026-10-14"
        endDate="2026-10-20"
        windowDays={7}
        onSelectDay={jest.fn()}
      />
    );
    expect(getByTestId('heart-rate-range-empty')).toBeTruthy();
  });

  it('offers to open a day only when the day timeline is shown', () => {
    mockDailyAverages.mockReturnValue({
      days: [{ day: '2026-10-19', avgBpm: 70, minBpm: 50, maxBpm: 120 }],
      isLoading: false,
      isError: false,
    });
    const props = {
      startDate: '2026-10-14',
      endDate: '2026-10-20',
      windowDays: 7,
    };
    const hint = 'Touch and hold a day to open it below';
    const { queryByText, rerender } = render(
      <HeartRateRangeCard {...props} onSelectDay={jest.fn()} />
    );
    expect(queryByText(hint)).toBeTruthy();
    rerender(<HeartRateRangeCard {...props} />);
    expect(queryByText(hint)).toBeNull();
  });
});
