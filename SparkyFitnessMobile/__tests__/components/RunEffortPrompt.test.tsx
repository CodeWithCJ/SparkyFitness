import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import RunEffortPrompt from '../../src/components/recording/RunEffortPrompt';
import {
  rateProgramWorkout,
  useRunProgram,
} from '../../src/services/runProgramService';

jest.mock('../../src/services/runProgramService', () => ({
  useRunProgram: jest.fn(),
  rateProgramWorkout: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mocked = jest.mocked(useRunProgram);
const withPending = (
  pendingEffort: { programId: string; index: number } | null
) =>
  mocked.mockReturnValue({ pendingEffort } as ReturnType<typeof useRunProgram>);

test('asks how hard the last workout was and saves the answer', async () => {
  withPending({ programId: 'beginner5k', index: 3 });
  render(<RunEffortPrompt date="2026-10-13" today="2026-10-13" />);
  expect(screen.getByText('How hard was that?')).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Effort 7 of 10'));
  });
  expect(rateProgramWorkout).toHaveBeenCalledWith('beginner5k', 3, 7);
});

test('stays out of the way when nothing is waiting or on another day', () => {
  withPending(null);
  const { rerender } = render(
    <RunEffortPrompt date="2026-10-13" today="2026-10-13" />
  );
  expect(screen.queryByTestId('run-effort-prompt')).toBeNull();
  withPending({ programId: 'beginner5k', index: 3 });
  rerender(<RunEffortPrompt date="2026-10-12" today="2026-10-13" />);
  expect(screen.queryByTestId('run-effort-prompt')).toBeNull();
});

test('Skip hides the card', () => {
  withPending({ programId: 'beginner5k', index: 9 });
  render(<RunEffortPrompt date="2026-10-13" today="2026-10-13" />);
  fireEvent.press(screen.getByText('Skip'));
  expect(screen.queryByTestId('run-effort-prompt')).toBeNull();
});
