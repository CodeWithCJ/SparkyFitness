import React from 'react';
import { Alert } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { addDays, programStatus } from '@workspace/shared';
import { toLocalDateString } from '../../src/utils/dateUtils';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';
import RunProgramsScreen from '../../src/screens/RunProgramsScreen';
import {
  setProgramEnabled,
  setProgramPosition,
  setProgramSchedule,
  startProgram,
  useCustomRunPrograms,
  useRunProgram,
} from '../../src/services/runProgramService';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const metrics = {
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};
const renderScreen = (props: React.ComponentProps<typeof RunProgramsScreen>) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <RunProgramsScreen {...props} />
    </SafeAreaProvider>
  );

jest.mock('../../src/services/runProgramService', () => ({
  useRunProgram: jest.fn(),
  useCustomRunPrograms: jest.fn(() => ({
    programs: [],
    loaded: true,
    refetch: jest.fn(),
  })),
  startProgram: jest.fn(() => Promise.resolve()),
  setProgramEnabled: jest.fn(() => Promise.resolve()),
  setProgramPosition: jest.fn(() => Promise.resolve()),
  restartProgram: jest.fn(() => Promise.resolve()),
  skipProgramWorkout: jest.fn(() => Promise.resolve()),
  setProgramSchedule: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

/** Minimal navigation props for rendering the screen in a test. */
const RunProgramsProps = () =>
  ({
    navigation: { navigate: jest.fn(), goBack: jest.fn() },
    route: { key: 'RunPrograms', name: 'RunPrograms' },
  }) as unknown as React.ComponentProps<typeof RunProgramsScreen>;

jest.mock('../../src/components/CalendarSheet', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ReactModule.forwardRef(
      (props: unknown, ref: React.Ref<unknown>) => {
        (globalThis as { __calendarProps?: unknown }).__calendarProps = props;
        ReactModule.useImperativeHandle(ref, () => ({
          present: jest.fn(),
          dismiss: jest.fn(),
        }));
        return <View testID="calendar-sheet" />;
      }
    ),
  };
});

const mockedUse = jest.mocked(useRunProgram);

describe('RunProgramsScreen', () => {
  afterEach(() => {
    useAppPreferencesStore.setState({ paceReferenceRace: null });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // The saved race lives in a persisted global store; start each test clean.
    useAppPreferencesStore.setState({ paceReferenceRace: null });
    jest.mocked(useCustomRunPrograms).mockReturnValue({
      programs: [],
      loaded: true,
      refetch: jest.fn(),
    } as never);
  });

  it('lists every program and starts the one chosen', () => {
    mockedUse.mockReturnValue({
      status: null,
      enabled: false,
      lastAdjustment: null,
      schedule: { days: [], startDay: null, endDay: null },
      doneDay: null,
      loaded: true,
    });
    renderScreen(RunProgramsProps());
    expect(screen.getByTestId('run-program-beginner5k')).toBeTruthy();
    expect(screen.getByTestId('run-program-marathon')).toBeTruthy();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    fireEvent.press(screen.getAllByText('Start program')[0]);
    const buttons = alert.mock.calls[0][2] ?? [];
    expect(buttons.map((b) => b.text)).toEqual([
      'Cancel',
      'Pick a date',
      'Start today',
    ]);
    buttons[2].onPress?.();
    expect(startProgram).toHaveBeenCalledWith('walkFit', null);
    alert.mockRestore();
  });

  it('lets you choose three or four runs a week and starts that version', () => {
    mockedUse.mockReturnValue({
      status: null,
      enabled: false,
      lastAdjustment: null,
      schedule: { days: [], startDay: null, endDay: null },
      doneDay: null,
      loaded: true,
    });
    renderScreen(RunProgramsProps());
    expect(screen.queryByTestId('run-program-halfMarathon4')).toBeNull();
    expect(screen.queryByTestId('run-versions-beginner5k')).toBeNull();
    const card = screen.getByTestId('run-program-halfMarathon');
    const choice = within(screen.getByTestId('run-versions-halfMarathon'));
    expect(choice.getByText('3 runs a week')).toBeTruthy();
    fireEvent.press(choice.getByText('4 runs a week'));
    expect(
      within(card).getByText(/Half marathon: twelve weeks, four runs a week/)
    ).toBeTruthy();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    fireEvent.press(within(card).getByText('Start program'));
    alert.mock.calls[0][2]?.[2].onPress?.();
    expect(startProgram).toHaveBeenCalledWith('halfMarathon4', null);
    alert.mockRestore();
  });

  it('shows the race pace card and keeps what is saved on this device', () => {
    mockedUse.mockReturnValue({
      status: null,
      enabled: false,
      lastAdjustment: null,
      schedule: { days: [], startDay: null, endDay: null },
      doneDay: null,
      loaded: true,
    });
    renderScreen(RunProgramsProps());
    expect(screen.getByTestId('pace-reference-card')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('pace-reference-minutes'), '25');
    fireEvent.press(screen.getByTestId('pace-reference-save'));
    expect(useAppPreferencesStore.getState().paceReferenceRace).toEqual({
      distanceKm: 5,
      seconds: 1500,
    });
    expect(screen.getByTestId('pace-reference-saved')).toBeTruthy();
    fireEvent.press(screen.getByTestId('pace-reference-clear'));
    expect(useAppPreferencesStore.getState().paceReferenceRace).toBeNull();
  });

  it('starts on a date picked from the calendar', () => {
    mockedUse.mockReturnValue({
      status: null,
      enabled: false,
      lastAdjustment: null,
      schedule: { days: [], startDay: null, endDay: null },
      doneDay: null,
      loaded: true,
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderScreen(RunProgramsProps());
    fireEvent.press(screen.getAllByText('Start program')[0]);
    act(() => alert.mock.calls[0][2]?.[1].onPress?.());
    expect(startProgram).not.toHaveBeenCalled();
    const { onSelectDate } = (
      globalThis as {
        __calendarProps?: { onSelectDate: (day: string) => void };
      }
    ).__calendarProps!;
    act(() => onSelectDate('2099-01-05'));
    expect(startProgram).toHaveBeenCalledWith('walkFit', '2099-01-05');
    alert.mockRestore();
  });

  it('offers to skip workouts to finish before the goal day', async () => {
    const day = toLocalDateString(new Date());
    mockedUse.mockReturnValue({
      status: programStatus({ programId: 'beginner5k', next: 2 })!,
      enabled: true,
      lastAdjustment: null,
      schedule: {
        days: [0, 1, 2, 3, 4, 5, 6],
        startDay: null,
        endDay: addDays(day, 22),
      },
      doneDay: null,
      loaded: true,
    });
    renderScreen(RunProgramsProps());
    expect(screen.getByTestId('run-program-catch-up')).toBeTruthy();
    fireEvent.press(screen.getByTestId('run-program-catch-up-button'));
    await act(async () => {});
    expect(setProgramPosition).toHaveBeenCalledWith(4);
  });

  it("shows the program being followed and starts today's workout from Record", () => {
    mockedUse.mockReturnValue({
      status: programStatus({ programId: 'beginner5k', next: 2 })!,
      enabled: true,
      lastAdjustment: null,
      schedule: { days: [], startDay: null, endDay: null },
      doneDay: null,
      loaded: true,
    });
    const props = RunProgramsProps();
    renderScreen(props);
    expect(screen.queryByTestId('run-program-marathon')).toBeNull();
    fireEvent.press(screen.getByText("Start today's workout"));
    expect(props.navigation.navigate).toHaveBeenCalledWith('RecordActivity', {
      programWorkout: true,
    });
  });

  it('saves the Diary days with the program', () => {
    mockedUse.mockReturnValue({
      status: programStatus({ programId: 'beginner5k', next: 2 })!,
      enabled: true,
      lastAdjustment: null,
      schedule: { days: [], startDay: null, endDay: null },
      doneDay: null,
      loaded: true,
    });
    renderScreen(RunProgramsProps());
    fireEvent.press(screen.getByLabelText('Monday'));
    expect(setProgramSchedule).toHaveBeenCalledWith({ toggleDay: 1 });
  });

  it('keeps the place and offers to resume a program that is switched off', () => {
    mockedUse.mockReturnValue({
      status: programStatus({ programId: 'beginner5k', next: 2 })!,
      enabled: false,
      lastAdjustment: null,
      schedule: { days: [], startDay: null, endDay: null },
      doneDay: null,
      loaded: true,
    });
    renderScreen(RunProgramsProps());
    fireEvent(
      screen.getByLabelText('Use a training program'),
      'valueChange',
      true
    );
    expect(setProgramEnabled).toHaveBeenCalledWith(true, 'beginner5k');
  });
  it('opens the program calendar', () => {
    mockedUse.mockReturnValue({
      status: programStatus({ programId: 'beginner5k', next: 2 })!,
      enabled: true,
      lastAdjustment: null,
      schedule: { days: [], startDay: null, endDay: null },
      doneDay: null,
      loaded: true,
    });
    const props = RunProgramsProps();
    renderScreen(props);
    fireEvent.press(screen.getByText('Open the program calendar'));
    expect(props.navigation.navigate).toHaveBeenCalledWith(
      'RunProgramCalendar'
    );
  });

  it('offers to customize each program and the one being followed', () => {
    mockedUse.mockReturnValue({
      status: null,
      enabled: false,
      lastAdjustment: null,
      schedule: { days: [], startDay: null, endDay: null },
      doneDay: null,
      loaded: true,
    });
    const props = RunProgramsProps();
    const first = renderScreen(props);
    fireEvent.press(screen.getByTestId('customize-halfMarathon'));
    expect(props.navigation.navigate).toHaveBeenCalledWith('RunProgramEdit', {
      fromProgramId: 'halfMarathon',
    });
    first.unmount();

    mockedUse.mockReturnValue({
      status: programStatus({ programId: 'beginner5k', next: 2 })!,
      enabled: true,
      lastAdjustment: null,
      schedule: { days: [], startDay: null, endDay: null },
      doneDay: null,
      loaded: true,
    });
    const next = RunProgramsProps();
    renderScreen(next);
    fireEvent.press(screen.getByTestId('customize-current'));
    expect(next.navigation.navigate).toHaveBeenCalledWith('RunProgramEdit', {
      fromProgramId: 'beginner5k',
    });
  });

  describe('your own plans', () => {
    const plan = {
      id: '0b6f1c1e-6a52-4a8e-9a3b-2f1d4f5a9c10',
      name: 'Hills',
      activity: 'run' as const,
      workouts: [{}, {}, {}],
      created_at: '',
      updated_at: '',
    };
    const withPlan = () =>
      jest.mocked(useCustomRunPrograms).mockReturnValue({
        programs: [plan],
        loaded: true,
        refetch: jest.fn(),
      } as never);

    it('offers to create a plan', () => {
      mockedUse.mockReturnValue({
        status: null,
        enabled: false,
        lastAdjustment: null,
        schedule: { days: [], startDay: null, endDay: null },
        doneDay: null,
        loaded: true,
      });
      const props = RunProgramsProps();
      renderScreen(props);
      fireEvent.press(screen.getByTestId('custom-plan-new'));
      expect(props.navigation.navigate).toHaveBeenCalledWith('RunProgramEdit');
    });

    it('lists a plan, edits it and starts it from today', () => {
      withPlan();
      mockedUse.mockReturnValue({
        status: null,
        enabled: false,
        lastAdjustment: null,
        schedule: { days: [], startDay: null, endDay: null },
        doneDay: null,
        loaded: true,
      });
      const props = RunProgramsProps();
      const alert = jest.spyOn(Alert, 'alert');
      renderScreen(props);
      expect(screen.getByText('Hills')).toBeTruthy();
      expect(screen.getByText('3 workouts')).toBeTruthy();
      fireEvent.press(screen.getByTestId(`custom-plan-edit-${plan.id}`));
      expect(props.navigation.navigate).toHaveBeenCalledWith('RunProgramEdit', {
        id: plan.id,
      });
      fireEvent.press(screen.getByTestId(`custom-plan-start-${plan.id}`));
      const buttons = alert.mock.calls.at(-1)?.[2] ?? [];
      act(() => buttons.find((b) => b.text === 'Start today')?.onPress?.());
      expect(startProgram).toHaveBeenCalledWith(`custom:${plan.id}`, null);
    });
  });
});
