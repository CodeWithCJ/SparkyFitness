import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import RunProgramCalendarScreen from '../../src/screens/RunProgramCalendarScreen';
import { useRunProgram } from '../../src/services/runProgramService';
import {
  runProgramHookValue,
  storedBeginnerProgram,
} from '../helpers/runProgramFixture';

jest.mock('../../src/services/runProgramService', () => ({
  useRunProgram: jest.fn(),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { first_day_of_week: 1 } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
  useUniwind: () => ({ theme: 'light' }),
}));

const navigate = jest.fn();
const props = () =>
  ({
    navigation: { navigate, goBack: jest.fn() },
    route: { key: 'RunProgramCalendar', name: 'RunProgramCalendar' },
  }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  // A Tuesday, with workouts 0 to 2 done.
  jest
    .spyOn(Date, 'now')
    .mockReturnValue(new Date(2026, 9, 13, 9, 0, 0).getTime());
});
afterEach(() => jest.restoreAllMocks());

const use = (program = storedBeginnerProgram()) =>
  jest
    .mocked(useRunProgram)
    .mockReturnValue(runProgramHookValue(program) as never);

describe('RunProgramCalendarScreen', () => {
  it('marks done days green and the due and coming days with the accent', () => {
    use();
    render(<RunProgramCalendarScreen {...props()} />);
    expect(screen.getByTestId('month-dot-done-2026-10-06')).toBeTruthy();
    expect(screen.getByTestId('month-dot-done-2026-10-08')).toBeTruthy();
    // Workout 3 is due today (Tuesday), then Thursday and Sunday.
    expect(screen.getByTestId('month-dot-ahead-2026-10-13')).toBeTruthy();
    expect(screen.getByTestId('month-dot-ahead-2026-10-15')).toBeTruthy();
    expect(screen.getByTestId('month-dot-ahead-2026-10-18')).toBeTruthy();
    expect(screen.getByText('3 of 27 workouts done')).toBeTruthy();
  });

  it("lists today's workout first and opens it", () => {
    use();
    render(<RunProgramCalendarScreen {...props()} />);
    expect(screen.getByTestId('calendar-day-panel')).toBeTruthy();
    fireEvent.press(screen.getAllByTestId('calendar-workout-3')[0]);
    expect(navigate).toHaveBeenCalledWith('RunProgramWorkout', { index: 3 });
  });

  it('shows the workouts of a day that was picked, past or future', () => {
    use();
    render(<RunProgramCalendarScreen {...props()} />);
    fireEvent.press(screen.getByTestId('month-day-2026-10-08'));
    fireEvent.press(screen.getAllByTestId('calendar-workout-1')[0]);
    expect(navigate).toHaveBeenCalledWith('RunProgramWorkout', { index: 1 });

    fireEvent.press(screen.getByTestId('month-day-2026-10-15'));
    fireEvent.press(screen.getAllByTestId('calendar-workout-4')[0]);
    expect(navigate).toHaveBeenLastCalledWith('RunProgramWorkout', {
      index: 4,
    });
  });

  it('says so for a day with no workout', () => {
    use();
    render(<RunProgramCalendarScreen {...props()} />);
    fireEvent.press(screen.getByTestId('month-day-2026-10-14'));
    expect(screen.getByText('No program workout on this day.')).toBeTruthy();
  });

  it('moves between months', () => {
    use();
    render(<RunProgramCalendarScreen {...props()} />);
    fireEvent.press(screen.getByTestId('month-previous'));
    expect(screen.getByTestId('month-day-2026-09-30')).toBeTruthy();
    expect(screen.getByText('September 2026')).toBeTruthy();
    fireEvent.press(screen.getByTestId('month-next'));
    fireEvent.press(screen.getByTestId('month-next'));
    expect(screen.getByText('November 2026')).toBeTruthy();
  });

  it('lists every workout so ones without a date can still be opened', () => {
    use(storedBeginnerProgram({ run_days: [] }));
    render(<RunProgramCalendarScreen {...props()} />);
    expect(
      screen.getByText(/more workouts are not on the calendar yet/)
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId('calendar-workout-20'));
    expect(navigate).toHaveBeenCalledWith('RunProgramWorkout', { index: 20 });
  });

  it('asks for a program when there is none', () => {
    jest
      .mocked(useRunProgram)
      .mockReturnValue(runProgramHookValue(null) as never);
    render(<RunProgramCalendarScreen {...props()} />);
    expect(
      screen.getByText('Start a training program to see its calendar.')
    ).toBeTruthy();
  });
});
