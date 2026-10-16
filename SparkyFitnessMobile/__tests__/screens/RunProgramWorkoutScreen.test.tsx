import React from 'react';
import { Alert } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import RunProgramWorkoutScreen from '../../src/screens/RunProgramWorkoutScreen';
import {
  setProgramPosition,
  useRunProgram,
} from '../../src/services/runProgramService';
import { fetchExerciseEntry } from '../../src/services/api/exerciseStatsApi';
import {
  runProgramHookValue,
  storedBeginnerProgram,
} from '../helpers/runProgramFixture';

jest.mock('../../src/services/runProgramService', () => ({
  useRunProgram: jest.fn(),
  setProgramPosition: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/api/exerciseStatsApi', () => ({
  fetchExerciseEntry: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const navigate = jest.fn();
const goBack = jest.fn();
const renderFor = (index: number) =>
  render(
    <RunProgramWorkoutScreen
      {...({
        navigation: { navigate, goBack },
        route: {
          key: 'RunProgramWorkout',
          name: 'RunProgramWorkout',
          params: { index },
        },
      } as never)}
    />
  );

const use = (program = storedBeginnerProgram()) =>
  jest
    .mocked(useRunProgram)
    .mockReturnValue(runProgramHookValue(program) as never);

beforeEach(() => {
  jest.clearAllMocks();
  // A Tuesday, with workouts 0 to 2 done.
  jest
    .spyOn(Date, 'now')
    .mockReturnValue(new Date(2026, 9, 13, 9, 0, 0).getTime());
  use();
});
afterEach(() => jest.restoreAllMocks());

/** Presses the confirming button of the Alert the screen raised. */
const confirmAlert = () => {
  const spy = jest.spyOn(Alert, 'alert');
  return () => {
    const buttons = spy.mock.calls.at(-1)?.[2] ?? [];
    const confirm = buttons.find((button) => button.style !== 'cancel');
    act(() => confirm?.onPress?.());
  };
};

describe('RunProgramWorkoutScreen', () => {
  it('shows a finished workout with when it was done, how hard it felt and its steps', () => {
    renderFor(1);
    expect(screen.getByTestId('workout-title')).toHaveTextContent(
      'Week 1, run 2'
    );
    expect(screen.getByTestId('workout-state')).toHaveTextContent('Done');
    expect(screen.getByText(/Done on/)).toBeTruthy();
    expect(screen.getByTestId('workout-rating')).toHaveTextContent(
      '7 out of 10'
    );
    expect(screen.getByTestId('workout-steps')).toBeTruthy();
    expect(screen.getByText('Warm up')).toBeTruthy();
  });

  it('opens the run it was done as', async () => {
    jest.mocked(fetchExerciseEntry).mockResolvedValue({
      id: 'entry-1',
      entry_date: '2026-10-08',
      entry_time: null,
      duration_minutes: 25,
      calories_burned: 250,
      distance: 3.2,
      avg_heart_rate: null,
      source: 'sparky',
      notes: null,
      exercise_id: null,
      exercise_snapshot: { name: 'Outdoor Running', category: 'cardio' },
      sets: [],
      activity_details: [],
      superset_group: null,
    } as never);
    renderFor(1);
    fireEvent.press(screen.getByText('View your run'));
    await waitFor(() =>
      expect(fetchExerciseEntry).toHaveBeenCalledWith('entry-1')
    );
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(navigate.mock.calls[0][0]).toMatch(/CardioSession|ActivityDetail/);
  });

  it('offers to start the workout that is due, and a way to repeat done ones', () => {
    renderFor(3);
    expect(screen.getByTestId('workout-state')).toHaveTextContent(
      'Next workout'
    );
    fireEvent.press(screen.getByText('Start this workout'));
    expect(navigate).toHaveBeenCalledWith('RecordActivity', {
      programWorkout: true,
    });
  });

  it('shows the date a coming workout falls on and can make it the next one', async () => {
    const confirm = confirmAlert();
    renderFor(5);
    expect(screen.getByTestId('workout-state')).toHaveTextContent('Coming up');
    // Due Tue 13, then Thu 15 (4), Sun 18 (5).
    expect(screen.getByText(/Scheduled for/)).toBeTruthy();
    fireEvent.press(screen.getByText('Make this the next workout'));
    confirm();
    await waitFor(() => expect(setProgramPosition).toHaveBeenCalledWith(5));
    await waitFor(() => expect(goBack).toHaveBeenCalled());
  });

  it('repeats a finished workout by moving the place back to it', async () => {
    const confirm = confirmAlert();
    renderFor(0);
    fireEvent.press(screen.getByText('Repeat this workout'));
    confirm();
    await waitFor(() => expect(setProgramPosition).toHaveBeenCalledWith(0));
  });

  it('says so when the workout is no longer in the program', () => {
    renderFor(99);
    expect(
      screen.getByText('This workout is not in your program any more.')
    ).toBeTruthy();
  });
});
