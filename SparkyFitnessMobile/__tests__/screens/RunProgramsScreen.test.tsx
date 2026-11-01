import React from 'react';
import { Alert } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { addDays, findProgram, programStatus } from '@workspace/shared';
import { toLocalDateString } from '../../src/utils/dateUtils';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';
import RunProgramsScreen from '../../src/screens/RunProgramsScreen';
import {
  applyProgramRealign,
  setProgramEnabled,
  setProgramPosition,
  setProgramSchedule,
  startProgram,
  useCustomRunPrograms,
  useRunProgram,
} from '../../src/services/runProgramService';
import { storedBeginnerProgram } from '../helpers/runProgramFixture';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useRunGoals } from '../../src/hooks/useRunGoals';
import { usePreferences } from '../../src/hooks/usePreferences';
import { useFitnessTests } from '../../src/services/fitnessTestService';
import { fitnessTest, fitnessTestsHook } from '../helpers/fitnessTestFixture';

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
  applyProgramRealign: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/hooks/useRunGoals', () => ({ useRunGoals: jest.fn() }));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));
jest.mock('../../src/services/fitnessTestService', () => ({
  useFitnessTests: jest.fn(),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(() => ({
    preferences: { timezone: 'UTC', default_distance_unit: 'km' },
  })),
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

const noGoals = {
  data: {
    goals: null,
    progress: {
      week_start: '2026-10-12',
      week_end: '2026-10-18',
      week_distance_km: 0,
      run_count: 0,
      weekly_percent: null,
      days_left_in_week: 4,
      daily_needed_km: null,
      race_days_left: null,
    },
  },
  loaded: true,
  isSaving: false,
  save: jest.fn(() => Promise.resolve()),
  distanceUnit: 'km' as const,
};

describe('RunProgramsScreen', () => {
  afterEach(() => {
    useAppPreferencesStore.setState({ paceReferenceRace: null });
  });

  beforeEach(() => {
    jest.mocked(useFitnessTests).mockReturnValue(fitnessTestsHook([]));
    jest.clearAllMocks();
    // The saved race lives in a persisted global store; start each test clean.
    useAppPreferencesStore.setState({ paceReferenceRace: null });
    jest.mocked(useCustomRunPrograms).mockReturnValue({
      programs: [],
      loaded: true,
      refetch: jest.fn(),
    } as never);
    jest.mocked(useRunGoals).mockReturnValue(noGoals);
  });

  it('offers running goals above the programs', () => {
    mockedUse.mockReturnValue({
      status: null,
      enabled: false,
      lastAdjustment: null,
      schedule: { days: [], startDay: null, endDay: null },
      doneDay: null,
      pendingEffort: null,
      loaded: true,
      refetch: jest.fn(),
    });
    renderScreen(RunProgramsProps());
    expect(screen.getByText('Running goals')).toBeTruthy();
    expect(screen.getByText('Set a goal')).toBeTruthy();
  });

  it('leaves the goals card out until the goals have loaded', () => {
    jest.mocked(useRunGoals).mockReturnValue({ ...noGoals, data: null });
    mockedUse.mockReturnValue({
      status: null,
      enabled: false,
      lastAdjustment: null,
      schedule: { days: [], startDay: null, endDay: null },
      doneDay: null,
      pendingEffort: null,
      loaded: true,
      refetch: jest.fn(),
    });
    renderScreen(RunProgramsProps());
    expect(screen.queryByText('Running goals')).toBeNull();
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

  it('offers the Zone 2 base with a three or four run choice and starts that version', () => {
    mockedUse.mockReturnValue({
      status: null,
      enabled: false,
      lastAdjustment: null,
      schedule: { days: [], startDay: null, endDay: null },
      doneDay: null,
      loaded: true,
    });
    renderScreen(RunProgramsProps());
    expect(screen.queryByTestId('run-program-zone2Base4')).toBeNull();
    const card = screen.getByTestId('run-program-zone2Base');
    expect(within(card).getByText('Zone 2 base')).toBeTruthy();
    expect(
      within(card).getByText(/Zone 2 base: ten weeks, three easy runs a week/)
    ).toBeTruthy();
    fireEvent.press(
      within(screen.getByTestId('run-versions-zone2Base')).getByText(
        '4 runs a week'
      )
    );
    expect(
      within(card).getByText(/Zone 2 base: ten weeks, four easy runs a week/)
    ).toBeTruthy();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    fireEvent.press(within(card).getByText('Start program'));
    alert.mock.calls[0][2]?.[2].onPress?.();
    expect(startProgram).toHaveBeenCalledWith('zone2Base4', null);
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

  describe('the race day from the running goals', () => {
    const today = toLocalDateString(new Date());
    const running = (endDay: string | null) =>
      mockedUse.mockReturnValue({
        status: programStatus({ programId: 'beginner5k', next: 3 })!,
        enabled: true,
        lastAdjustment: null,
        schedule: { days: [], startDay: null, endDay },
        doneDay: null,
        loaded: true,
        refetch: jest.fn(),
      } as never);
    const withRaceDay = (raceDay: string | null) =>
      jest.mocked(useRunGoals).mockReturnValue({
        ...noGoals,
        data: {
          ...noGoals.data,
          goals: {
            weekly_distance_km: null,
            race_name: null,
            race_date: raceDay,
            race_distance_km: null,
            updated_at: '2026-10-12T00:00:00.000Z',
          },
        },
      });

    it('offers it as the goal date when the program has none', () => {
      running(null);
      withRaceDay(addDays(today, 49));
      renderScreen(RunProgramsProps());
      fireEvent.press(screen.getByTestId('run-program-use-race-day'));
      expect(setProgramSchedule).toHaveBeenCalledWith({
        endDay: addDays(today, 49),
      });
    });

    it('does not offer it once the goal date is the race day', () => {
      running(addDays(today, 49));
      withRaceDay(addDays(today, 49));
      renderScreen(RunProgramsProps());
      expect(screen.queryByTestId('run-program-use-race-day')).toBeNull();
    });

    it('does not offer a race day before the program starts', () => {
      mockedUse.mockReturnValue({
        status: programStatus({ programId: 'beginner5k', next: 3 })!,
        enabled: true,
        lastAdjustment: null,
        schedule: { days: [], startDay: addDays(today, 30), endDay: null },
        doneDay: null,
        loaded: true,
        refetch: jest.fn(),
      } as never);
      withRaceDay(addDays(today, 10));
      renderScreen(RunProgramsProps());
      expect(screen.queryByTestId('run-program-use-race-day')).toBeNull();
    });

    it('does not offer a race day that has passed, or none', () => {
      running(null);
      withRaceDay(addDays(today, -1));
      renderScreen(RunProgramsProps());
      expect(screen.queryByTestId('run-program-use-race-day')).toBeNull();
    });

    describe('across timezones', () => {
      // 2026-10-20 12:00 UTC: already the 21st in Kiritimati, still the 20th
      // in Pago Pago, so the account day differs from most device days.
      const freezeClock = () =>
        jest.useFakeTimers({
          now: new Date('2026-10-20T12:00:00Z'),
          doNotFake: [
            'setTimeout',
            'clearTimeout',
            'setInterval',
            'clearInterval',
            'setImmediate',
            'clearImmediate',
            'nextTick',
            'queueMicrotask',
            'requestAnimationFrame',
            'cancelAnimationFrame',
            'performance',
          ],
        });
      const inZone = (timezone: string) =>
        jest
          .mocked(usePreferences)
          .mockReturnValue({ preferences: { timezone } } as never);
      afterEach(() => {
        jest.useRealTimers();
        inZone('UTC');
      });

      it('does not offer a race day that is today in the account timezone', () => {
        freezeClock();
        inZone('Pacific/Kiritimati');
        running(null);
        withRaceDay('2026-10-21');
        renderScreen(RunProgramsProps());
        expect(screen.queryByTestId('run-program-use-race-day')).toBeNull();
      });

      it('offers a race day that is still ahead in the account timezone', () => {
        freezeClock();
        inZone('Pacific/Pago_Pago');
        running(null);
        withRaceDay('2026-10-21');
        renderScreen(RunProgramsProps());
        fireEvent.press(screen.getByTestId('run-program-use-race-day'));
        expect(setProgramSchedule).toHaveBeenCalledWith({
          endDay: '2026-10-21',
        });
      });
    });
  });

  describe('realigning the plan', () => {
    const today = toLocalDateString(new Date());
    // The goal day that leaves `slots` workout days from today (every weekday).
    const behind = (slots: number) =>
      storedBeginnerProgram({
        program_id: 'halfMarathon',
        workouts: findProgram('halfMarathon')!.workouts,
        next_index: 3,
        run_days: [0, 1, 2, 3, 4, 5, 6],
        end_date: addDays(today, slots - 1),
        last_done_date: addDays(today, -2),
      });
    const use = (program: ReturnType<typeof behind>, enabled = true) =>
      mockedUse.mockReturnValue({
        program,
        status: programStatus({ programId: 'halfMarathon', next: 3 }),
        enabled,
        lastAdjustment: null,
        schedule: {
          days: program.run_days,
          startDay: null,
          endDay: program.end_date,
        },
        doneDay: program.last_done_date,
        loaded: true,
        refetch: jest.fn(),
      } as never);

    it('offers a realignment when the plan no longer fits, and applies it on Accept', async () => {
      use(behind(31));
      renderScreen(RunProgramsProps());
      expect(screen.getByTestId('run-program-realign')).toBeTruthy();
      expect(applyProgramRealign).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.press(screen.getByTestId('run-program-realign-accept'));
      });
      expect(applyProgramRealign).toHaveBeenCalledWith({
        token: expect.any(String),
        force: false,
        today,
      });
    });

    it('does not also offer to skip workouts while it offers a realignment', () => {
      use(behind(31));
      renderScreen(RunProgramsProps());
      expect(screen.getByTestId('run-program-realign')).toBeTruthy();
      expect(screen.queryByTestId('run-program-catch-up')).toBeNull();
    });

    it('has no card while the plan fits', () => {
      use(behind(33));
      renderScreen(RunProgramsProps());
      expect(screen.queryByTestId('run-program-realign')).toBeNull();
    });

    it('moves the goal day or opens the race planner from an unrealistic goal', () => {
      use(behind(24));
      const props = RunProgramsProps();
      renderScreen(props);
      fireEvent.press(screen.getByTestId('run-program-realign-lower'));
      expect(props.navigation.navigate).toHaveBeenCalledWith('RunProgramRace', {
        distance: '10k',
        raceDay: addDays(today, 23),
      });
      fireEvent.press(screen.getByTestId('run-program-realign-later'));
      expect(setProgramSchedule).toHaveBeenCalledWith({
        endDay: addDays(today, 32),
      });
    });

    it('stays out of the way while the program is switched off', () => {
      use(behind(31), false);
      renderScreen(RunProgramsProps());
      expect(screen.queryByTestId('run-program-realign')).toBeNull();
    });
  });

  describe('fitness test', () => {
    const noProgram = () =>
      mockedUse.mockReturnValue({
        status: null,
        enabled: false,
        lastAdjustment: null,
        schedule: { days: [], startDay: null, endDay: null },
        doneDay: null,
        pendingEffort: null,
        loaded: true,
        refetch: jest.fn(),
      });
    const navigate = jest.fn();
    const props = () =>
      ({
        navigation: { navigate, goBack: jest.fn() },
        route: { key: 'RunPrograms', name: 'RunPrograms' },
      }) as unknown as React.ComponentProps<typeof RunProgramsScreen>;

    beforeEach(() => navigate.mockClear());

    it('invites a first test, and opens the tests', () => {
      noProgram();
      renderScreen(props());
      fireEvent.press(screen.getByTestId('fitness-test-take'));
      expect(navigate).toHaveBeenCalledWith('FitnessTest');
    });

    it('starts the program the latest test points to, asking when', () => {
      noProgram();
      jest
        .mocked(useFitnessTests)
        .mockReturnValue(fitnessTestsHook([fitnessTest()]));
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      renderScreen(props());
      fireEvent.press(screen.getByTestId('fitness-test-start-program'));
      expect(alert.mock.calls[0][0]).toBe('Start Faster 10K');
      alert.mock.calls[0][2]?.[2].onPress?.();
      expect(startProgram).toHaveBeenCalledWith('faster10k', null);
      alert.mockRestore();
    });

    it('plans a race from the test', () => {
      noProgram();
      jest
        .mocked(useFitnessTests)
        .mockReturnValue(fitnessTestsHook([fitnessTest()]));
      renderScreen(props());
      fireEvent.press(screen.getByTestId('fitness-test-plan-race'));
      expect(navigate).toHaveBeenCalledWith('RunProgramRace');
    });

    it('offers a retest with the program being followed, and shows the panel there too', () => {
      mockedUse.mockReturnValue({
        status: programStatus({ programId: 'beginner5k', next: 3 })!,
        enabled: true,
        lastAdjustment: null,
        schedule: { days: [], startDay: null, endDay: null },
        doneDay: null,
        pendingEffort: null,
        loaded: true,
        refetch: jest.fn(),
      });
      // Seven weeks after the test.
      jest.mocked(useFitnessTests).mockReturnValue(
        fitnessTestsHook([
          fitnessTest({
            test_date: addDays(toLocalDateString(new Date()), -49),
          }),
        ])
      );
      renderScreen(props());
      expect(screen.getByTestId('fitness-retest-prompt')).toBeTruthy();
      fireEvent.press(screen.getByTestId('fitness-retest-start'));
      expect(navigate).toHaveBeenCalledWith('FitnessTest');
      expect(screen.getByTestId('fitness-test-panel')).toBeTruthy();
    });

    it('says a saved test replaces the typed race time', () => {
      noProgram();
      jest
        .mocked(useFitnessTests)
        .mockReturnValue(fitnessTestsHook([fitnessTest()]));
      renderScreen(props());
      expect(screen.getByTestId('pace-reference-test-note')).toBeTruthy();
    });

    it('shows one short row, not the full invitation, while a program runs', () => {
      mockedUse.mockReturnValue({
        status: programStatus({ programId: 'beginner5k', next: 3 })!,
        enabled: true,
        lastAdjustment: null,
        schedule: { days: [], startDay: null, endDay: null },
        doneDay: null,
        pendingEffort: null,
        loaded: true,
        refetch: jest.fn(),
      });
      renderScreen(props());
      expect(screen.getByText('Take a guided fitness test')).toBeTruthy();
      expect(screen.queryByText(/Run a guided fitness test/)).toBeNull();
      fireEvent.press(screen.getByTestId('fitness-test-take'));
      expect(navigate).toHaveBeenCalledWith('FitnessTest');
    });

    it('does not mention it without a test', () => {
      noProgram();
      renderScreen(props());
      expect(screen.queryByTestId('pace-reference-test-note')).toBeNull();
    });
  });
});
