import React from 'react';
import { Alert } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { programStatus } from '@workspace/shared';
import RunProgramRaceScreen from '../../src/screens/RunProgramRaceScreen';
import {
  saveCustomProgram,
  setProgramSchedule,
  startProgram,
  useRunProgram,
} from '../../src/services/runProgramService';

jest.mock('../../src/services/runProgramService', () => ({
  useRunProgram: jest.fn(),
  saveCustomProgram: jest.fn(() =>
    Promise.resolve({ id: '0b6f1c1e-6a52-4a8e-9a3b-2f1d4f5a9c10' })
  ),
  startProgram: jest.fn(() => Promise.resolve()),
  setProgramSchedule: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));
let selectDate: ((day: string) => void) | undefined;
jest.mock('../../src/components/CalendarSheet', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ReactModule.forwardRef(
      (props: { onSelectDate: (day: string) => void }, ref: unknown) => {
        selectDate = props.onSelectDate;
        ReactModule.useImperativeHandle(ref, () => ({
          present: jest.fn(),
          dismiss: jest.fn(),
        }));
        return <View testID="calendar-sheet" />;
      }
    ),
  };
});

const goBack = jest.fn();
const renderScreen = () =>
  render(
    <RunProgramRaceScreen
      {...({
        navigation: { goBack, navigate: jest.fn() },
        route: { key: 'r', name: 'RunProgramRace' },
      } as never)}
    />
  );

const none = {
  status: null,
  enabled: false,
  program: null,
  lastAdjustment: null,
  schedule: { days: [], startDay: null, endDay: null },
  doneDay: null,
  loaded: true,
  refetch: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  // A Wednesday.
  jest
    .spyOn(Date, 'now')
    .mockReturnValue(new Date(2026, 9, 14, 9, 0, 0).getTime());
  jest.mocked(useRunProgram).mockReturnValue(none as never);
});
afterEach(() => jest.restoreAllMocks());

describe('RunProgramRaceScreen', () => {
  it('summarises the plan it would make', () => {
    renderScreen();
    expect(screen.getByText(/weeks to race day/)).toBeTruthy();
    expect(screen.getByText(/workouts, the longest run about/)).toBeTruthy();
  });

  it('creates the plan, starts it on the chosen days and ends it on race day', async () => {
    renderScreen();
    act(() => selectDate?.('2026-12-13'));
    fireEvent.press(screen.getByTestId('race-create'));
    await waitFor(() => expect(saveCustomProgram).toHaveBeenCalled());
    const [input] = jest.mocked(saveCustomProgram).mock.calls[0];
    expect(input.name).toBe('10K race plan');
    expect(input.workouts.at(-1)?.title).toBe('Race day: 10K');
    await waitFor(() =>
      expect(startProgram).toHaveBeenCalledWith(
        'custom:0b6f1c1e-6a52-4a8e-9a3b-2f1d4f5a9c10',
        null
      )
    );
    await waitFor(() => expect(setProgramSchedule).toHaveBeenCalled());
    expect(jest.mocked(setProgramSchedule).mock.calls[0][0]).toMatchObject({
      days: [0, 2, 4],
      endDay: '2026-12-13',
    });
    await waitFor(() => expect(goBack).toHaveBeenCalled());
  });

  it('will not create a plan for a race that is too close', () => {
    renderScreen();
    fireEvent.press(screen.getByTestId('race-distance-marathon'));
    fireEvent.press(screen.getByTestId('race-level-new'));
    expect(screen.getByTestId('race-too-short')).toBeTruthy();
    fireEvent.press(screen.getByTestId('race-create'));
    expect(saveCustomProgram).not.toHaveBeenCalled();
  });

  it('needs at least two days to run', () => {
    renderScreen();
    fireEvent.press(screen.getByTestId('race-weekday-2'));
    fireEvent.press(screen.getByTestId('race-weekday-4'));
    // Only Sunday is left, and it is not enough.
    expect(screen.getByText('Pick at least two days to run.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('race-create'));
    expect(saveCustomProgram).not.toHaveBeenCalled();
  });

  it('asks before replacing the program being followed', async () => {
    jest.mocked(useRunProgram).mockReturnValue({
      ...none,
      status: programStatus({ programId: 'beginner5k', next: 2 })!,
      enabled: true,
    } as never);
    const alert = jest.spyOn(Alert, 'alert');
    renderScreen();
    fireEvent.press(screen.getByTestId('race-create'));
    expect(saveCustomProgram).not.toHaveBeenCalled();
    const buttons = alert.mock.calls.at(-1)?.[2] ?? [];
    act(() => buttons.find((b) => b.style !== 'cancel')?.onPress?.());
    await waitFor(() => expect(saveCustomProgram).toHaveBeenCalled());
  });
});
