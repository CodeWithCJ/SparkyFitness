import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { storedProgramStatus } from '@workspace/shared';
import TrainingProgramCard from '@/pages/Exercises/TrainingPrograms/TrainingProgramCard';
import { makeRunProgram } from '@/tests/mocks/runProgramFixture';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

const NOW = Date.parse('2026-10-14T12:00:00.000Z');

const setup = (
  overrides: Parameters<typeof makeRunProgram>[0] = {},
  busy = false
) => {
  const program = makeRunProgram(overrides);
  const handlers = {
    onToggleEnabled: jest.fn(),
    onMarkDone: jest.fn(),
    onSkip: jest.fn(),
    onRestart: jest.fn(),
    onPickWorkout: jest.fn(),
    onToggleDay: jest.fn(),
    onStartDay: jest.fn(),
    onEndDay: jest.fn(),
  };
  render(
    <TrainingProgramCard
      program={program}
      status={storedProgramStatus(program)}
      today="2026-10-14"
      now={NOW}
      busy={busy}
      {...handlers}
    />
  );
  return handlers;
};

describe('TrainingProgramCard', () => {
  it("shows today's workout and the place in the plan", () => {
    setup({ next_index: 4 });
    expect(screen.getByText('Beginner 5K · Week 2, run 2')).toBeInTheDocument();
    expect(
      screen.getByText(/Workout 4 of 27 done · \d+ min today/)
    ).toBeInTheDocument();
  });

  it('marks the workout done, skips and starts over', () => {
    const handlers = setup({ next_index: 2 });
    fireEvent.click(
      screen.getByRole('button', { name: 'Mark workout as done' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(handlers.onMarkDone).toHaveBeenCalledTimes(1);
    expect(handlers.onSkip).toHaveBeenCalledTimes(1);
    expect(handlers.onRestart).toHaveBeenCalledTimes(1);
  });

  it('switches the program on and off', () => {
    const handlers = setup();
    fireEvent.click(
      screen.getByRole('switch', { name: 'Use a training program' })
    );
    expect(handlers.onToggleEnabled).toHaveBeenCalledWith(false);
  });

  it('shows the place and no workout actions while switched off', () => {
    const handlers = setup({ enabled: false, next_index: 5 });
    expect(
      screen.getByText(
        'Beginner 5K is paused at 5 of 27 workouts. Switch it on to carry on.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    fireEvent.click(
      screen.getByRole('switch', { name: 'Use a training program' })
    );
    expect(handlers.onToggleEnabled).toHaveBeenCalledWith(true);
  });

  it('toggles run days and reflects the chosen ones', () => {
    const handlers = setup({ run_days: [1, 3] });
    const pressed = screen
      .getAllByRole('button', { pressed: true })
      .map((b) => b.textContent);
    expect(pressed).toEqual(['Mon', 'Wed']);
    fireEvent.click(screen.getByRole('button', { name: 'Fri' }));
    expect(handlers.onToggleDay).toHaveBeenCalledWith(5);
  });

  it('sets, clears and bounds the start date and goal date', () => {
    const handlers = setup({
      start_date: '2026-10-20',
      end_date: '2026-12-06',
    });
    expect(
      screen.getByText(/Starts Tue, Oct 20\. Nothing shows in the Diary/)
    ).toBeInTheDocument();
    const start = screen.getByLabelText('First workout');
    const goal = screen.getByLabelText('Goal date');
    expect(start).toHaveValue('2026-10-20');
    expect(start).toHaveAttribute('max', '2026-12-06');
    expect(goal).toHaveAttribute('min', '2026-10-20');

    fireEvent.change(start, { target: { value: '2026-10-22' } });
    expect(handlers.onStartDay).toHaveBeenCalledWith('2026-10-22');
    fireEvent.click(screen.getByRole('button', { name: 'Start today' }));
    expect(handlers.onStartDay).toHaveBeenCalledWith(null);
    fireEvent.change(goal, { target: { value: '' } });
    expect(handlers.onEndDay).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(handlers.onEndDay).toHaveBeenLastCalledWith(null);
  });

  it('says the program starts today when no first day is set', () => {
    setup();
    expect(screen.getByText(/Starts today, Wed, Oct 14\./)).toBeInTheDocument();
  });

  it('offers to start again once every workout is done', () => {
    const handlers = setup({ next_index: 27 });
    expect(screen.getByText('Beginner 5K complete')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }));
    expect(handlers.onRestart).toHaveBeenCalledTimes(1);
  });

  it('shows a recent plan change and hides an old one', () => {
    setup({
      adjustment_log: [
        {
          at: '2026-10-10T08:00:00.000Z',
          summary: 'Eased the next 2 workouts by 15%',
          source: 'assistant',
        },
      ],
    });
    expect(
      screen.getByText(
        'Sparky changed your plan on Oct 10: Eased the next 2 workouts by 15%'
      )
    ).toBeInTheDocument();
  });

  it('does not show a plan change older than two weeks', () => {
    setup({
      adjustment_log: [
        {
          at: '2026-09-01T08:00:00.000Z',
          summary: 'Old change',
          source: 'user',
        },
      ],
    });
    expect(screen.queryByText(/Old change/)).toBeNull();
  });

  it('disables the actions while a change is being saved', () => {
    setup({}, true);
    expect(
      screen.getByRole('button', { name: 'Mark workout as done' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeDisabled();
  });
});
