import React from 'react';
import { Alert } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import RunProgramEditScreen from '../../src/screens/RunProgramEditScreen';
import {
  removeCustomProgram,
  saveCustomProgram,
  useCustomRunPrograms,
} from '../../src/services/runProgramService';

jest.mock('../../src/services/runProgramService', () => ({
  useCustomRunPrograms: jest.fn(),
  saveCustomProgram: jest.fn(() => Promise.resolve({})),
  removeCustomProgram: jest.fn(() => Promise.resolve()),
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
jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
  useUniwind: () => ({ theme: 'light' }),
}));

const goBack = jest.fn();
const renderFor = (id?: string, fromProgramId?: string) =>
  render(
    <RunProgramEditScreen
      {...({
        navigation: { goBack, navigate: jest.fn() },
        route: {
          key: 'e',
          name: 'RunProgramEdit',
          params: id ? { id } : fromProgramId ? { fromProgramId } : {},
        },
      } as never)}
    />
  );

const plan = {
  id: '0b6f1c1e-6a52-4a8e-9a3b-2f1d4f5a9c10',
  name: 'Hills',
  activity: 'run' as const,
  workouts: [
    {
      week: 0,
      day: 0,
      title: 'Warm hills',
      plan: {
        style: 'runWalk' as const,
        steps: [
          { kind: 'warmup' as const, seconds: 300 },
          { kind: 'work' as const, seconds: 600 },
        ],
      },
    },
  ],
  created_at: '',
  updated_at: '',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useCustomRunPrograms).mockReturnValue({
    programs: [plan],
    loaded: true,
    refetch: jest.fn(),
  } as never);
});

describe('RunProgramEditScreen', () => {
  it('will not save a plan without a name', () => {
    renderFor();
    expect(screen.getByText('Give the plan a name.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('plan-save'));
    expect(saveCustomProgram).not.toHaveBeenCalled();
  });

  it('builds a plan from workouts and steps and saves it', async () => {
    renderFor();
    fireEvent.changeText(screen.getByTestId('plan-name'), 'Mine');
    fireEvent.press(screen.getByTestId('plan-activity-walk'));
    fireEvent.press(screen.getByTestId('plan-add-workout'));
    fireEvent.press(screen.getByTestId('plan-add-step-1'));
    fireEvent.press(screen.getByTestId('plan-step-more-0-1'));
    fireEvent.press(screen.getByTestId('plan-workout-remove-0'));
    expect(screen.queryByTestId('plan-workout-1')).toBeNull();
    fireEvent.press(screen.getByTestId('plan-save'));
    await waitFor(() => expect(saveCustomProgram).toHaveBeenCalled());
    const [input, id] = jest.mocked(saveCustomProgram).mock.calls[0];
    expect(id).toBeUndefined();
    expect(input).toMatchObject({ name: 'Mine', activity: 'walk' });
    expect(input.workouts).toHaveLength(1);
    // The remaining one is the second, with its added step.
    expect(input.workouts[0].plan.steps).toHaveLength(4);
    expect(input.workouts[0].plan.style).toBe('fastEasy');
    await waitFor(() => expect(goBack).toHaveBeenCalled());
  });

  it('fills the form from an existing plan and saves changes to it', async () => {
    renderFor(plan.id);
    expect(screen.getByTestId('plan-name').props.value).toBe('Hills');
    fireEvent.press(screen.getByTestId('plan-step-more-0-1'));
    fireEvent.press(screen.getByTestId('plan-save'));
    await waitFor(() => expect(saveCustomProgram).toHaveBeenCalled());
    const [input, id] = jest.mocked(saveCustomProgram).mock.calls[0];
    expect(id).toBe(plan.id);
    expect(input.workouts[0].title).toBe('Warm hills');
    expect(input.workouts[0].plan.steps[1].seconds).toBe(660);
  });

  it('saves a pace and heart-rate target on a step', async () => {
    renderFor();
    fireEvent.changeText(screen.getByTestId('plan-name'), 'Mine');
    fireEvent.changeText(screen.getByTestId('plan-step-0-1-pace-fast'), '5:00');
    fireEvent.changeText(screen.getByTestId('plan-step-0-1-pace-slow'), '6:00');
    fireEvent.changeText(screen.getByTestId('plan-step-0-1-hr-low'), '130');
    fireEvent.changeText(screen.getByTestId('plan-step-0-1-hr-high'), '150');
    // Warm up takes no target.
    expect(screen.queryByTestId('plan-step-0-0-pace-fast')).toBeNull();
    fireEvent.press(screen.getByTestId('plan-save'));
    await waitFor(() => expect(saveCustomProgram).toHaveBeenCalled());
    const [input] = jest.mocked(saveCustomProgram).mock.calls[0];
    expect(input.workouts[0].plan.steps[1]).toMatchObject({
      pace: { minSecondsPerKm: 300, maxSecondsPerKm: 360 },
      heartRate: { minBpm: 130, maxBpm: 150 },
    });
  });

  it('starts from a copy of a built-in program', async () => {
    renderFor(undefined, 'beginner5k');
    expect(screen.getByTestId('plan-name').props.value).toBe(
      'Beginner 5K (my copy)'
    );
    // Beginner 5K has 27 workouts, named by their week and run.
    expect(screen.getByTestId('plan-workout-26')).toBeTruthy();
    expect(screen.queryByTestId('plan-workout-27')).toBeNull();
    fireEvent.press(screen.getByTestId('plan-save'));
    await waitFor(() => expect(saveCustomProgram).toHaveBeenCalled());
    const [input, id] = jest.mocked(saveCustomProgram).mock.calls[0];
    expect(id).toBeUndefined();
    expect(input.workouts).toHaveLength(27);
    expect(input.workouts[0].title).toBe('Week 1, run 1');
  });

  it('deletes a plan after asking', async () => {
    const spy = jest.spyOn(Alert, 'alert');
    renderFor(plan.id);
    fireEvent.press(screen.getByText('Delete plan'));
    const buttons = spy.mock.calls.at(-1)?.[2] ?? [];
    act(() => buttons.find((b) => b.style === 'destructive')?.onPress?.());
    await waitFor(() =>
      expect(removeCustomProgram).toHaveBeenCalledWith(plan.id)
    );
    await waitFor(() => expect(goBack).toHaveBeenCalled());
  });

  it('says so when the plan is gone', () => {
    jest.mocked(useCustomRunPrograms).mockReturnValue({
      programs: [],
      loaded: true,
      refetch: jest.fn(),
    } as never);
    renderFor('missing');
    expect(screen.getByText('This plan is no longer there.')).toBeTruthy();
  });
});
