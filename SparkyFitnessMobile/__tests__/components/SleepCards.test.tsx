import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import {
  BedTimeCard,
  NapsCard,
  WakeUpCard,
} from '../../src/components/SleepCards';
import { usePreferences } from '../../src/hooks/usePreferences';
import { initializeI18n } from '../../src/localization/i18n';
import { buildSleepEntry } from '../helpers/sleepFixtures';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

// Sleep times follow the account's 12h/24h `time_format`, same as diary food entries.
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(() => ({ preferences: { time_format: 'h:mm A' } })),
}));

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

const DAY = '2026-08-23';

const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
} as unknown as React.ComponentProps<typeof WakeUpCard>['navigation'];

/**
 * Builds an ISO instant with a known *local* wall-clock time, so clock assertions hold
 * regardless of the runner's timezone.
 */
const localInstant = (hour: number, minute: number): string =>
  new Date(2026, 7, 23, hour, minute, 0).toISOString();

describe('SleepCards', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (usePreferences as jest.Mock).mockReturnValue({
      preferences: { time_format: 'h:mm A' },
    });
  });

  describe('WakeUpCard', () => {
    test('renders wake time, time asleep and sleep score', () => {
      const entry = buildSleepEntry({
        wake_time: localInstant(6, 45),
        time_asleep_in_seconds: 27000,
        sleep_score: 82,
      });

      const { getByText, getByTestId } = render(
        <WakeUpCard entry={entry} day={DAY} navigation={mockNavigation} />
      );

      expect(getByText('6:45 AM')).toBeTruthy();
      expect(getByText('7h 30m')).toBeTruthy();
      expect(getByTestId('sleep-score')).toBeTruthy();
      expect(getByText('82')).toBeTruthy();
    });

    test('omits the score element entirely when sleep_score is null', () => {
      const entry = buildSleepEntry({ sleep_score: null });

      const { queryByTestId, queryByText } = render(
        <WakeUpCard entry={entry} day={DAY} navigation={mockNavigation} />
      );

      expect(queryByTestId('sleep-score')).toBeNull();
      expect(queryByText('null')).toBeNull();
      expect(queryByText('NaN')).toBeNull();
    });

    test('falls back to duration with a "Time in bed" label when time asleep is null', () => {
      const entry = buildSleepEntry({
        time_asleep_in_seconds: null,
        duration_in_seconds: 28800,
      });

      const { getByText, queryByText } = render(
        <WakeUpCard entry={entry} day={DAY} navigation={mockNavigation} />
      );

      expect(getByText('Time in bed')).toBeTruthy();
      expect(queryByText('Time asleep')).toBeNull();
      expect(getByText('8h 0m')).toBeTruthy();
      expect(queryByText('NaN')).toBeNull();
    });

    test('navigates to SleepDetail with its own entry id', () => {
      const entry = buildSleepEntry({ id: 'entry-main' });

      const { getByTestId } = render(
        <WakeUpCard entry={entry} day={DAY} navigation={mockNavigation} />
      );
      fireEvent.press(getByTestId('wake-up-card'));

      expect(mockNavigate).toHaveBeenCalledWith('SleepDetail', {
        entryId: 'entry-main',
        day: DAY,
      });
    });

    test("renders 24-hour time under the account's 'HH:mm' preference", () => {
      // The regression: these times used to follow the locale's 12h/24h convention and
      // ignore the account setting, so they disagreed with diary food entries.
      (usePreferences as jest.Mock).mockReturnValue({
        preferences: { time_format: 'HH:mm' },
      });
      const entry = buildSleepEntry({ wake_time: localInstant(6, 45) });

      const { getByText, queryByText } = render(
        <WakeUpCard entry={entry} day={DAY} navigation={mockNavigation} />
      );

      expect(getByText('06:45')).toBeTruthy();
      expect(queryByText('6:45 AM')).toBeNull();
    });

    test('hides the card entirely when the day has no main sleep', () => {
      const { queryByTestId } = render(
        <WakeUpCard entry={null} day={DAY} navigation={mockNavigation} />
      );

      expect(queryByTestId('wake-up-card')).toBeNull();
    });
  });

  describe('NapsCard', () => {
    const napOne = buildSleepEntry({
      id: 'nap-1',
      duration_in_seconds: 2700,
      time_asleep_in_seconds: 2700,
      bedtime: localInstant(13, 15),
    });
    const napTwo = buildSleepEntry({
      id: 'nap-2',
      duration_in_seconds: 1200,
      time_asleep_in_seconds: 1200,
      bedtime: localInstant(17, 30),
    });

    test('renders one row per nap with its clock time and duration', () => {
      const { getByTestId, getByText } = render(
        <NapsCard
          naps={[napOne, napTwo]}
          day={DAY}
          navigation={mockNavigation}
        />
      );

      expect(getByTestId('nap-row-nap-1')).toBeTruthy();
      expect(getByTestId('nap-row-nap-2')).toBeTruthy();
      expect(getByText('1:15 PM')).toBeTruthy();
      expect(getByText('45m')).toBeTruthy();
      expect(getByText('5:30 PM')).toBeTruthy();
      expect(getByText('20m')).toBeTruthy();
    });

    test('hides the card entirely when there are no naps', () => {
      const { queryByTestId } = render(
        <NapsCard naps={[]} day={DAY} navigation={mockNavigation} />
      );

      expect(queryByTestId('naps-card')).toBeNull();
    });

    test('uses a count plural family for the header', () => {
      const single = render(
        <NapsCard naps={[napOne]} day={DAY} navigation={mockNavigation} />
      );
      expect(single.getByText('1 nap')).toBeTruthy();

      const double = render(
        <NapsCard
          naps={[napOne, napTwo]}
          day={DAY}
          navigation={mockNavigation}
        />
      );
      expect(double.getByText('2 naps')).toBeTruthy();
    });

    test('gives each nap row a label carrying its own time and duration', () => {
      // A shared "Open nap details" leaves a screen reader user unable to tell the rows
      // apart, which is the one thing the visible column of times and durations does.
      const { getByLabelText } = render(
        <NapsCard
          naps={[napOne, napTwo]}
          day={DAY}
          navigation={mockNavigation}
        />
      );

      expect(getByLabelText('Open nap details, 1:15 PM, 45m')).toBeTruthy();
      expect(getByLabelText('Open nap details, 5:30 PM, 20m')).toBeTruthy();
    });

    test('navigates with the tapped nap’s id, not the main sleep’s', () => {
      const { getByTestId } = render(
        <NapsCard
          naps={[napOne, napTwo]}
          day={DAY}
          navigation={mockNavigation}
        />
      );
      fireEvent.press(getByTestId('nap-row-nap-2'));

      expect(mockNavigate).toHaveBeenCalledWith('SleepDetail', {
        entryId: 'nap-2',
        day: DAY,
      });
      expect(mockNavigate).not.toHaveBeenCalledWith('SleepDetail', {
        entryId: 'entry-main',
        day: DAY,
      });
    });
  });

  describe('BedTimeCard', () => {
    test('renders the bedtime taken from the D+1 entry', () => {
      const tonight = buildSleepEntry({
        id: 'tonight',
        entry_date: '2026-08-24',
        bedtime: localInstant(22, 45),
      });

      const { getByText } = render(
        <BedTimeCard entry={tonight} day={DAY} navigation={mockNavigation} />
      );

      expect(getByText('10:45 PM')).toBeTruthy();
    });

    test('hides the card entirely until tonight’s sleep has synced', () => {
      const { queryByTestId } = render(
        <BedTimeCard entry={null} day={DAY} navigation={mockNavigation} />
      );

      expect(queryByTestId('bed-time-card')).toBeNull();
    });

    test('navigates with the D+1 entry id', () => {
      const tonight = buildSleepEntry({
        id: 'tonight',
        entry_date: '2026-08-24',
      });

      const { getByTestId } = render(
        <BedTimeCard entry={tonight} day={DAY} navigation={mockNavigation} />
      );
      fireEvent.press(getByTestId('bed-time-card'));

      expect(mockNavigate).toHaveBeenCalledWith('SleepDetail', {
        entryId: 'tonight',
        day: DAY,
      });
    });
  });

  describe('record zones', () => {
    // 22:45 UTC reads as 07:45 the next morning in Tokyo, a time no runner timezone can
    // produce from this instant by accident.
    const instant = '2026-08-22T22:45:00+00:00';

    test('renders the hour the session was recorded at, not the phone’s current hour', () => {
      const entry = buildSleepEntry({
        wake_time: instant,
        record_timezone: 'Asia/Tokyo',
      });

      const { getByText } = render(
        <WakeUpCard entry={entry} day={DAY} navigation={mockNavigation} />
      );

      expect(getByText('7:45 AM')).toBeTruthy();
    });

    test('falls back to the profile timezone when the session recorded no zone', () => {
      (usePreferences as jest.Mock).mockReturnValue({
        preferences: { time_format: 'h:mm A', timezone: 'Asia/Tokyo' },
      });

      const { getByText } = render(
        <WakeUpCard
          entry={buildSleepEntry({ wake_time: instant })}
          day={DAY}
          navigation={mockNavigation}
        />
      );

      expect(getByText('7:45 AM')).toBeTruthy();
    });

    test('reads a nap against its own recorded zone', () => {
      const nap = buildSleepEntry({
        id: 'nap-1',
        bedtime: instant,
        duration_in_seconds: 2400,
        time_asleep_in_seconds: 2400,
        record_utc_offset_minutes: 540,
      });

      const { getByText } = render(
        <NapsCard naps={[nap]} day={DAY} navigation={mockNavigation} />
      );

      expect(getByText('7:45 AM')).toBeTruthy();
    });
  });
});
