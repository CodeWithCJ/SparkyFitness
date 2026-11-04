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

  it('says so when the day has no readings', () => {
    mockDayTimeline.mockReturnValue({
      timeline: emptyTimeline,
      isLoading: false,
      isError: false,
    });
    const { getByTestId } = render(
      <HeartRateDayTimelineCard day="2026-10-19" onChangeDay={jest.fn()} />
    );
    expect(getByTestId('heart-rate-day-empty')).toBeTruthy();
  });

  it('steps back a day and cannot go past today', () => {
    mockDayTimeline.mockReturnValue({
      timeline: emptyTimeline,
      isLoading: false,
      isError: false,
    });
    const onChangeDay = jest.fn();
    const { getByTestId, rerender } = render(
      <HeartRateDayTimelineCard day="2026-10-19" onChangeDay={onChangeDay} />
    );
    fireEvent.press(getByTestId('heart-rate-day-prev'));
    expect(onChangeDay).toHaveBeenCalledWith('2026-10-18');
    fireEvent.press(getByTestId('heart-rate-day-next'));
    expect(onChangeDay).toHaveBeenLastCalledWith('2026-10-20');

    onChangeDay.mockClear();
    rerender(
      <HeartRateDayTimelineCard day="2026-10-20" onChangeDay={onChangeDay} />
    );
    fireEvent.press(getByTestId('heart-rate-day-next'));
    expect(onChangeDay).not.toHaveBeenCalled();
  });

  it('lists the day figures once there are readings', () => {
    mockDayTimeline.mockReturnValue({
      timeline: {
        points: [{ minutes: 600, bpm: 70, isSleep: false, workoutName: null }],
        daytimeAvg: 80,
        sleepingAvg: 56,
        sleepDipPct: -30,
        minBpm: 52,
        minMinutes: 180,
        maxBpm: 150,
        maxMinutes: 1110,
      },
      isLoading: false,
      isError: false,
    });
    const { getByText } = render(
      <HeartRateDayTimelineCard day="2026-10-19" onChangeDay={jest.fn()} />
    );
    expect(getByText('80 bpm')).toBeTruthy();
    expect(getByText('56 bpm')).toBeTruthy();
    expect(getByText('-30% against daytime')).toBeTruthy();
    expect(getByText('03:00')).toBeTruthy();
    expect(getByText('18:30')).toBeTruthy();
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
});
