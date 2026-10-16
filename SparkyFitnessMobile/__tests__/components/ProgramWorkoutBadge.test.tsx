import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { programStatus } from '@workspace/shared';
import ProgramWorkoutBadge from '../../src/components/recording/ProgramWorkoutBadge';
import { useProgramWorkoutForEntry } from '../../src/services/runProgramService';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/services/runProgramService', () => ({
  useProgramWorkoutForEntry: jest.fn(),
}));

const mockedWorkout = jest.mocked(useProgramWorkoutForEntry);

beforeAll(async () => {
  await initializeI18n('en');
});

test('names the program workout an activity was done as', () => {
  const status = programStatus({ programId: 'beginner5k', next: 0 })!;
  mockedWorkout.mockReturnValue({
    ...status,
    workout: status.program.workouts[4]!,
  });
  render(<ProgramWorkoutBadge entryId="entry-1" />);
  expect(mockedWorkout).toHaveBeenCalledWith('entry-1');
  expect(screen.getByText('Part of your training program')).toBeTruthy();
  expect(screen.getByText(/Week 2, run 2$/)).toBeTruthy();
});

test('shows nothing for an activity outside the program', () => {
  mockedWorkout.mockReturnValue(null);
  render(<ProgramWorkoutBadge entryId="entry-1" />);
  expect(screen.queryByTestId('program-workout-badge')).toBeNull();
});
