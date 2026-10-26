import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { GetRunGoalsResponse } from '@workspace/shared';
import RunGoalsCard from '../../src/components/recording/RunGoalsCard';

jest.mock('../../src/components/CalendarSheet', () => {
  const ReactModule = require('react');
  const { Pressable } = require('react-native');
  return {
    __esModule: true,
    default: ReactModule.forwardRef(
      (
        props: { onSelectDate: (day: string) => void },
        ref: React.Ref<unknown>
      ) => {
        ReactModule.useImperativeHandle(ref, () => ({
          present: jest.fn(),
          dismiss: jest.fn(),
        }));
        return (
          <Pressable
            testID="pick-day"
            onPress={() => props.onSelectDate('2026-12-06')}
          />
        );
      }
    ),
  };
});

const progress = {
  week_start: '2026-10-12',
  week_end: '2026-10-18',
  week_distance_km: 12.5,
  run_count: 2,
  weekly_percent: 42,
  days_left_in_week: 4,
  daily_needed_km: 4.4,
  race_days_left: 31 as number | null,
};

const full: GetRunGoalsResponse = {
  goals: {
    weekly_distance_km: 30,
    race_name: 'City 10K',
    race_date: '2026-11-15',
    race_distance_km: 10,
    updated_at: '2026-10-15T00:00:00.000Z',
  },
  progress,
};

const empty: GetRunGoalsResponse = {
  goals: null,
  progress: {
    ...progress,
    week_distance_km: 0,
    run_count: 0,
    weekly_percent: null,
    daily_needed_km: null,
    race_days_left: null,
  },
};

const renderCard = (
  data: GetRunGoalsResponse,
  over: Partial<React.ComponentProps<typeof RunGoalsCard>> = {}
) => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  render(
    <RunGoalsCard
      data={data}
      distanceUnit="km"
      today="2026-10-15"
      onSave={onSave}
      {...over}
    />
  );
  return onSave;
};

test('invites the person to set a goal when there is none', () => {
  renderCard(empty);
  expect(screen.getByText('Set a goal')).toBeTruthy();
  fireEvent.press(screen.getByText('Set a goal'));
  expect(screen.getByTestId('run-goals-form')).toBeTruthy();
});

test('shows weekly progress and the race countdown', () => {
  renderCard(full);
  expect(screen.getByText('12.5 of 30 km this week')).toBeTruthy();
  expect(
    screen.getByText(/About 4.4 km a day to reach it \(4 days left\)/)
  ).toBeTruthy();
  expect(screen.getByText('City 10K · 10 km')).toBeTruthy();
  expect(screen.getByText(/31 days to go/)).toBeTruthy();
});

test('says so when the weekly goal is reached', () => {
  renderCard({
    ...full,
    progress: { ...progress, weekly_percent: 120, daily_needed_km: null },
  });
  expect(screen.getByText('Weekly goal reached')).toBeTruthy();
});

test.each([
  [0, 'Race day is today'],
  [1, '1 day to go'],
  [-1, '1 day ago'],
  [-5, '5 days ago'],
])('words a race %i days away', (days, text) => {
  renderCard({ ...full, progress: { ...progress, race_days_left: days } });
  expect(screen.getByText(new RegExp(text))).toBeTruthy();
});

test('shows distances in miles when that is the unit', () => {
  renderCard(full, { distanceUnit: 'miles' });
  expect(screen.getByText('7.8 of 18.6 mi this week')).toBeTruthy();
});

test('saves the typed goals in kilometres', async () => {
  const onSave = renderCard(full, { distanceUnit: 'miles' });
  fireEvent.press(screen.getByText('Edit'));
  fireEvent.changeText(screen.getByLabelText('Weekly distance (mi)'), '20');
  fireEvent.changeText(screen.getByLabelText('Race distance (mi)'), '');
  fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(onSave).toHaveBeenCalledWith({
    weekly_distance_km: 32.19,
    race_name: 'City 10K',
    race_date: '2026-11-15',
    race_distance_km: null,
  });
});

test('clears a goal when its field is emptied', async () => {
  const onSave = renderCard(full);
  fireEvent.press(screen.getByText('Edit'));
  fireEvent.changeText(screen.getByLabelText('Weekly distance (km)'), '');
  fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(onSave.mock.calls[0][0].weekly_distance_km).toBeNull();
});

test('refuses a bad distance without calling the server', () => {
  const onSave = renderCard(full);
  fireEvent.press(screen.getByText('Edit'));
  fireEvent.changeText(screen.getByLabelText('Weekly distance (km)'), 'abc');
  fireEvent.press(screen.getByText('Save'));
  expect(screen.getByText(/Enter a distance above zero/)).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();
});

test('asks for a race day when a race name is typed without one', () => {
  const onSave = renderCard(empty);
  fireEvent.press(screen.getByText('Set a goal'));
  fireEvent.changeText(screen.getByLabelText('Race name'), 'City 10K');
  fireEvent.press(screen.getByText('Save'));
  expect(screen.getByText(/Pick the race day/)).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();
});

test('keeps the form open and says so when saving fails', async () => {
  const onSave = jest.fn().mockRejectedValue(new Error('offline'));
  render(
    <RunGoalsCard
      data={full}
      distanceUnit="km"
      today="2026-10-15"
      onSave={onSave}
    />
  );
  fireEvent.press(screen.getByText('Edit'));
  fireEvent.press(screen.getByText('Save'));
  await waitFor(() =>
    expect(screen.getByText(/Could not save your goals/)).toBeTruthy()
  );
  expect(screen.getByTestId('run-goals-form')).toBeTruthy();
});

test('saves a race day picked from the calendar', async () => {
  const onSave = renderCard(empty);
  fireEvent.press(screen.getByText('Set a goal'));
  fireEvent.changeText(screen.getByLabelText('Race name'), 'Turkey Trot');
  fireEvent.press(screen.getByTestId('pick-day'));
  fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(onSave).toHaveBeenCalledWith({
    weekly_distance_km: null,
    race_name: 'Turkey Trot',
    race_date: '2026-12-06',
    race_distance_km: null,
  });
});

test('removing the race sends no race fields', async () => {
  const onSave = renderCard(full);
  fireEvent.press(screen.getByText('Edit'));
  fireEvent.press(screen.getByText('Remove race'));
  fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(onSave).toHaveBeenCalledWith({
    weekly_distance_km: 30,
    race_name: null,
    race_date: null,
    race_distance_km: null,
  });
});
