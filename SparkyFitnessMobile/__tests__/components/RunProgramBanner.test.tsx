import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { programStatus, type ExerciseSessionResponse } from '@workspace/shared';
import RunProgramBanner from '../../src/components/recording/RunProgramBanner';
import {
  adjustProgramRunning,
  completeProgramWorkout,
  useRunProgram,
} from '../../src/services/runProgramService';
import { useTrainingLoad } from '../../src/hooks/useTrainingLoad';
import { addDays, toLocalDateString } from '../../src/utils/dateUtils';

jest.mock('../../src/services/runProgramService', () => ({
  useRunProgram: jest.fn(),
  completeProgramWorkout: jest.fn(() => Promise.resolve()),
  adjustProgramRunning: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/hooks/useTrainingLoad', () => ({
  useTrainingLoad: jest.fn(() => ({
    load: undefined,
    isLoading: false,
    isError: false,
  })),
}));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mockedProgram = jest.mocked(useRunProgram);
const today = toLocalDateString(new Date());

const program = (
  over: Partial<ReturnType<typeof useRunProgram>> = {}
): ReturnType<typeof useRunProgram> => ({
  status: programStatus({ programId: 'beginner5k', next: 4 })!,
  enabled: true,
  lastAdjustment: null,
  schedule: { days: [], startDay: null, endDay: null },
  doneDay: null,
  pendingEffort: null,
  loaded: true,
  refetch: jest.fn(() => Promise.resolve()),
  ...over,
});

beforeEach(() => {
  mockedProgram.mockReturnValue(program());
  jest.mocked(useTrainingLoad).mockReturnValue({
    load: undefined,
    isLoading: false,
    isError: false,
  });
});

test("offers today's workout with a Start button", () => {
  const onStart = jest.fn();
  render(
    <RunProgramBanner date={today} exerciseEntries={[]} onStart={onStart} />
  );
  expect(screen.getByText(/Beginner 5K •/)).toBeTruthy();
  expect(screen.getByText(/Week 2, run 2 ·/)).toBeTruthy();
  fireEvent.press(screen.getByText('Start'));
  expect(onStart).toHaveBeenCalled();
});

test('waits for the start day', () => {
  mockedProgram.mockReturnValue(
    program({ schedule: { days: [], startDay: '2999-01-01', endDay: null } })
  );
  render(
    <RunProgramBanner date={today} exerciseEntries={[]} onStart={jest.fn()} />
  );
  expect(screen.queryByTestId('run-program-banner')).toBeNull();
});

test('says scheduled on a run day', () => {
  mockedProgram.mockReturnValue(
    program({
      schedule: { days: [0, 1, 2, 3, 4, 5, 6], startDay: null, endDay: null },
    })
  );
  render(
    <RunProgramBanner date={today} exerciseEntries={[]} onStart={jest.fn()} />
  );
  expect(screen.getByText(/Scheduled Today/)).toBeTruthy();
});

test('is not shown for another day, after a workout today, or with the program off', () => {
  const { rerender } = render(
    <RunProgramBanner
      date="2020-01-01"
      exerciseEntries={[]}
      onStart={jest.fn()}
    />
  );
  expect(screen.queryByTestId('run-program-banner')).toBeNull();

  mockedProgram.mockReturnValue(program({ doneDay: today }));
  rerender(
    <RunProgramBanner date={today} exerciseEntries={[]} onStart={jest.fn()} />
  );
  expect(screen.queryByTestId('run-program-banner')).toBeNull();

  mockedProgram.mockReturnValue(program({ enabled: false }));
  rerender(
    <RunProgramBanner date={today} exerciseEntries={[]} onStart={jest.fn()} />
  );
  expect(screen.queryByTestId('run-program-banner')).toBeNull();
});

test('shows what is scheduled on a later run day, without a Start button', () => {
  mockedProgram.mockReturnValue(
    program({
      schedule: { days: [0, 1, 2, 3, 4, 5, 6], startDay: null, endDay: null },
    })
  );
  const tomorrow = addDays(today, 1);
  render(
    <RunProgramBanner
      date={tomorrow}
      exerciseEntries={[]}
      onStart={jest.fn()}
    />
  );
  expect(screen.getByText(/• Scheduled$/)).toBeTruthy();
  expect(screen.queryByText('Start')).toBeNull();
});

test('offers to count a run logged some other way', () => {
  const run = {
    type: 'individual',
    id: 'entry-3',
    name: 'Running',
    duration_minutes: 40,
  } as unknown as ExerciseSessionResponse;
  render(
    <RunProgramBanner
      date={today}
      exerciseEntries={[run]}
      onStart={jest.fn()}
    />
  );
  fireEvent.press(screen.getByText('Count it'));
  // The entry is passed along so it shows as part of the program.
  expect(completeProgramWorkout).toHaveBeenCalledWith(
    'beginner5k',
    4,
    undefined,
    'entry-3'
  );
});

const daysAgo = (n: number) =>
  toLocalDateString(new Date(Date.now() - n * 86_400_000));

test('offers to ease back in after two weeks away, and applies it', async () => {
  mockedProgram.mockReturnValue(program({ doneDay: daysAgo(15) }));
  render(
    <RunProgramBanner date={today} exerciseEntries={[]} onStart={jest.fn()} />
  );
  expect(screen.getByText(/15 days since your last workout/)).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByText('Ease back in'));
  });
  expect(adjustProgramRunning).toHaveBeenCalledWith(-15, 2);
});

test('lets the person dismiss the ease-back offer', () => {
  mockedProgram.mockReturnValue(program({ doneDay: daysAgo(30) }));
  render(
    <RunProgramBanner date={today} exerciseEntries={[]} onStart={jest.fn()} />
  );
  fireEvent.press(screen.getByText('Not now'));
  expect(screen.queryByText('Ease back in')).toBeNull();
});

test('does not offer to ease back in after a short break', () => {
  mockedProgram.mockReturnValue(program({ doneDay: daysAgo(5) }));
  render(
    <RunProgramBanner date={today} exerciseEntries={[]} onStart={jest.fn()} />
  );
  expect(screen.queryByText('Ease back in')).toBeNull();
});

const spike = () =>
  jest.mocked(useTrainingLoad).mockReturnValue({
    load: { status: 'spike' } as never,
    isLoading: false,
    isError: false,
  });

test('offers to ease the next workouts after a training load spike', async () => {
  spike();
  render(
    <RunProgramBanner date={today} exerciseEntries={[]} onStart={jest.fn()} />
  );
  expect(screen.getByText(/jumped well above your usual/)).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByText('Ease back in'));
  });
  expect(adjustProgramRunning).toHaveBeenCalledWith(-15, 2);
});

test('lets a break offer take the place of the load offer', () => {
  spike();
  mockedProgram.mockReturnValue(program({ doneDay: daysAgo(20) }));
  render(
    <RunProgramBanner date={today} exerciseEntries={[]} onStart={jest.fn()} />
  );
  expect(screen.getByText(/20 days since your last workout/)).toBeTruthy();
  expect(screen.queryByText(/jumped well above/)).toBeNull();
});

test('does not repeat the load offer right after the plan was changed', () => {
  spike();
  mockedProgram.mockReturnValue(
    program({
      lastAdjustment: {
        at: new Date().toISOString(),
        summary: 'Eased',
        source: 'user',
      },
    })
  );
  render(
    <RunProgramBanner date={today} exerciseEntries={[]} onStart={jest.fn()} />
  );
  expect(screen.queryByText(/jumped well above/)).toBeNull();
});
