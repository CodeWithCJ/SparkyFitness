import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { storedProgramStatus } from '@workspace/shared';
import TrainingProgramCalendar from '@/pages/Exercises/TrainingPrograms/TrainingProgramCalendar';
import { makeRunProgram } from '@/tests/mocks/runProgramFixture';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ timezone: 'UTC', firstDayOfWeek: 1 }),
}));

// 2026-10-14 is a Wednesday.
const TODAY = '2026-10-14';

const setup = (
  overrides: Parameters<typeof makeRunProgram>[0] = {},
  busy = false
) => {
  const program = makeRunProgram(overrides);
  const onCatchUp = jest.fn();
  render(
    <TrainingProgramCalendar
      program={program}
      status={storedProgramStatus(program)}
      today={TODAY}
      busy={busy}
      onCatchUp={onCatchUp}
    />
  );
  return { onCatchUp };
};

describe('TrainingProgramCalendar', () => {
  it('asks for run days before it can lay out the dates', () => {
    setup();
    expect(
      screen.getByText(/27 workouts left\. Pick your run days/)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('training-program-finish')).toBeNull();
  });

  it('shows the projected finish day', () => {
    setup({ run_days: [1, 3, 5] });
    // 27 workouts on Mon/Wed/Fri from Wed 14 Oct: the last falls on Mon 14 Dec.
    expect(screen.getByTestId('training-program-finish')).toHaveTextContent(
      'Finishes on Monday, December 14.'
    );
  });

  it('says the program is on track when it finishes before the goal date', () => {
    setup({ run_days: [1, 3, 5], end_date: '2026-12-15' });
    expect(screen.getByTestId('training-program-fit')).toHaveTextContent(
      'On track: you finish on Monday, December 14, 1 day before your goal date.'
    );
    expect(screen.queryByTestId('training-program-catch-up')).toBeNull();
  });

  it('offers a catch-up that skips the fewest workouts to make the goal', () => {
    // The last workout lands on Mon 14 Dec, three days after the goal; skipping one pulls it back to Fri 11 Dec.
    const { onCatchUp } = setup({
      run_days: [1, 3, 5],
      end_date: '2026-12-11',
    });
    expect(screen.getByTestId('training-program-fit')).toHaveTextContent(
      'At this pace you finish on Monday, December 14, 3 days after your goal date.'
    );
    const catchUp = screen.getByTestId('training-program-catch-up');
    expect(catchUp).toHaveTextContent(
      'Skip the next 1 workout to finish on Friday, December 11'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip 1 workout' }));
    expect(onCatchUp).toHaveBeenCalledWith(1);
  });

  it('only says how far behind it is when skipping cannot make up the gap', () => {
    const { onCatchUp } = setup({ run_days: [1], end_date: '2026-12-01' });
    expect(screen.getByTestId('training-program-too-far')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Skip \d+ workout/ })
    ).toBeNull();
    expect(onCatchUp).not.toHaveBeenCalled();
  });

  it('lists the first workouts and expands to all of them', () => {
    setup({ run_days: [1, 3, 5] });
    const list = screen.getByTestId('training-program-upcoming');
    expect(list.querySelectorAll('.border-b')).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 27' }));
    expect(list.querySelectorAll('.border-b')).toHaveLength(27);
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(list.querySelectorAll('.border-b')).toHaveLength(7);
  });

  it('shows what is planned for today and what was done on an earlier day', () => {
    setup({
      run_days: [1, 3, 5],
      next_index: 1,
      completion_log: [
        { index: 0, entry_id: 'e0', at: '2026-10-12T07:30:00.000Z' },
      ],
    });
    const day = screen.getByTestId('training-program-day');
    expect(day).toHaveTextContent('Wednesday, October 14');
    expect(day).toHaveTextContent('Week 1, run 2');
    expect(day).toHaveTextContent('Next');

    // Mon 12 Oct holds the workout that was done.
    fireEvent.click(
      screen.getByRole('button', { name: /^Monday, October 12/ })
    );
    expect(screen.getByTestId('training-program-day')).toHaveTextContent(
      'Done Mon, Oct 12'
    );
    expect(screen.getByTestId('training-program-day')).toHaveTextContent(
      'Week 1, run 1'
    );
  });

  it('says there is nothing on a day with no workout', () => {
    setup({ run_days: [1, 3, 5] });
    fireEvent.click(screen.getByRole('button', { name: '15' }));
    expect(screen.getByTestId('training-program-day')).toHaveTextContent(
      'No workouts on this day.'
    );
  });

  it('notes that a finished program has nothing left to schedule', () => {
    setup({ next_index: 27, run_days: [1, 3, 5] });
    expect(screen.getByText(/Every workout is done\./)).toBeInTheDocument();
  });
});
