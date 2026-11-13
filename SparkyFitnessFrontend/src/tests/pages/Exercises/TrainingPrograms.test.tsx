import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import {
  storedProgramStatus,
  todayInZone,
  addDays,
  type RunProgramResponse,
} from '@workspace/shared';
import TrainingPrograms from '@/pages/Exercises/TrainingPrograms/TrainingPrograms';
import {
  useCompleteRunProgramWorkoutMutation,
  useCustomRunPrograms,
  useRunProgram,
  useSaveRunProgramMutation,
  type RunProgramChange,
} from '@/hooks/Exercises/useRunProgram';
import {
  makeCustomProgram,
  makeRunProgram,
} from '@/tests/mocks/runProgramFixture';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/hooks/Exercises/useRunProgram', () => ({
  useRunProgram: jest.fn(),
  useCustomRunPrograms: jest.fn(),
  useSaveRunProgramMutation: jest.fn(),
  useCompleteRunProgramWorkoutMutation: jest.fn(),
}));

let mockActingOnBehalf = false;
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf: mockActingOnBehalf }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ timezone: 'UTC', firstDayOfWeek: 1 }),
}));

const mockUseRunProgram = useRunProgram as jest.MockedFunction<
  typeof useRunProgram
>;
const save = jest.fn();
const complete = jest.fn();

const today = todayInZone('UTC');

const state = (program: RunProgramResponse | null) => ({
  program,
  status: program ? storedProgramStatus(program) : null,
  enabled: program?.enabled ?? false,
  schedule: {
    days: program?.run_days ?? [],
    startDay: program?.start_date ?? null,
    endDay: program?.end_date ?? null,
  },
  doneDay: program?.last_done_date ?? null,
  isLoading: false,
  isError: false,
});

const setup = (program: RunProgramResponse | null) => {
  mockUseRunProgram.mockReturnValue(state(program));
  render(
    <MemoryRouter>
      <TrainingPrograms />
    </MemoryRouter>
  );
};

describe('TrainingPrograms page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActingOnBehalf = false;
    (useSaveRunProgramMutation as jest.Mock).mockReturnValue({
      mutate: save,
      isPending: false,
    });
    (useCompleteRunProgramWorkoutMutation as jest.Mock).mockReturnValue({
      mutate: complete,
      isPending: false,
    });
    (useCustomRunPrograms as jest.Mock).mockReturnValue({
      programs: [],
      isLoading: false,
    });
  });

  describe('with no program', () => {
    it('lists the programs and shows no program card', () => {
      setup(null);
      expect(
        screen.getByRole('heading', { name: 'Training programs' })
      ).toBeInTheDocument();
      expect(screen.getByTestId('training-program-picker')).toBeInTheDocument();
      expect(screen.queryByTestId('training-program-card')).toBeNull();
      expect(screen.queryByTestId('training-program-calendar')).toBeNull();
    });

    it('starts a program today', () => {
      setup(null);
      fireEvent.click(
        within(screen.getByTestId('training-program-beginner5k')).getByRole(
          'button',
          { name: 'Start program' }
        )
      );
      expect(
        screen.getByRole('heading', { name: 'Start Beginner 5K' })
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Start today' }));
      expect(save).toHaveBeenCalledWith({
        program_id: 'beginner5k',
        enabled: true,
        next_index: 0,
        start_date: null,
      });
    });

    it('starts a program on a picked date, only if it is after today', () => {
      setup(null);
      fireEvent.click(
        within(screen.getByTestId('training-program-beginner5k')).getByRole(
          'button',
          { name: 'Start program' }
        )
      );
      const startOnDate = screen.getByRole('button', {
        name: 'Start on that date',
      });
      expect(startOnDate).toBeDisabled();
      const input = screen.getByLabelText('Pick a date');
      expect(input).toHaveAttribute('min', today);

      fireEvent.change(input, { target: { value: today } });
      expect(startOnDate).toBeDisabled();

      const later = addDays(today, 9);
      fireEvent.change(input, { target: { value: later } });
      expect(startOnDate).toBeEnabled();
      fireEvent.click(startOnDate);
      expect(save).toHaveBeenCalledWith({
        program_id: 'beginner5k',
        enabled: true,
        next_index: 0,
        start_date: later,
      });
    });

    it('does not start anything when the dialog is cancelled', () => {
      setup(null);
      fireEvent.click(
        within(screen.getByTestId('training-program-beginner5k')).getByRole(
          'button',
          { name: 'Start program' }
        )
      );
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(save).not.toHaveBeenCalled();
    });

    it('starts one of the person’s own plans', () => {
      (useCustomRunPrograms as jest.Mock).mockReturnValue({
        programs: [makeCustomProgram()],
        isLoading: false,
      });
      setup(null);
      fireEvent.click(
        within(screen.getByTestId('training-custom-custom-1')).getByRole(
          'button',
          { name: 'Start program' }
        )
      );
      expect(
        screen.getByRole('heading', { name: 'Start My tempo plan' })
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Start today' }));
      expect(save).toHaveBeenCalledWith({
        program_id: 'custom:custom-1',
        enabled: true,
        next_index: 0,
        start_date: null,
      });
    });
  });

  describe('with a program', () => {
    it('shows the card and the calendar above the program list', () => {
      setup(makeRunProgram({ next_index: 3 }));
      expect(screen.getByTestId('training-program-card')).toBeInTheDocument();
      expect(
        screen.getByTestId('training-program-calendar')
      ).toBeInTheDocument();
      expect(screen.getByText('All programs')).toBeInTheDocument();
    });

    it('asks before switching programs, then starts the new one at week 1 keeping the schedule', () => {
      setup(makeRunProgram({ next_index: 3, run_days: [1, 3] }));
      fireEvent.click(
        within(screen.getByTestId('training-program-faster5k')).getByRole(
          'button',
          { name: 'Start program' }
        )
      );
      expect(
        screen.getByRole('heading', { name: 'Switch to Faster 5K?' })
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'You will start the new program at week 1. Your place in the current one is not kept.'
        )
      ).toBeInTheDocument();
      expect(save).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
      expect(save).toHaveBeenCalledTimes(1);
      const body = save.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(body).toEqual({
        program_id: 'faster5k',
        enabled: true,
        next_index: 0,
        start_date: undefined,
      });
      // No start_date key on the wire: JSON drops undefined, so the schedule stays.
      expect(JSON.parse(JSON.stringify(body))).toEqual({
        program_id: 'faster5k',
        enabled: true,
        next_index: 0,
      });
    });

    it('leaves the program alone when the switch is declined', () => {
      setup(makeRunProgram());
      fireEvent.click(
        within(screen.getByTestId('training-program-faster5k')).getByRole(
          'button',
          { name: 'Start program' }
        )
      );
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(save).not.toHaveBeenCalled();
    });

    it('marks the due workout done for today', () => {
      setup(makeRunProgram({ next_index: 6 }));
      fireEvent.click(
        screen.getByRole('button', { name: 'Mark workout as done' })
      );
      expect(complete).toHaveBeenCalledWith({
        index: 6,
        program_id: 'beginner5k',
        day: today,
      });
    });

    it('skips, starts over and switches off', () => {
      setup(makeRunProgram({ next_index: 6 }));
      fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
      expect(save).toHaveBeenLastCalledWith({
        program_id: 'beginner5k',
        next_index: 7,
      });
      fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
      expect(save).toHaveBeenLastCalledWith({
        program_id: 'beginner5k',
        next_index: 0,
      });
      fireEvent.click(
        screen.getByRole('switch', { name: 'Use a training program' })
      );
      expect(save).toHaveBeenLastCalledWith({
        program_id: 'beginner5k',
        enabled: false,
      });
    });

    it('flips a run day from the program as it stands when the change runs', () => {
      const program = makeRunProgram({ run_days: [1] });
      setup(program);
      fireEvent.click(screen.getByRole('button', { name: 'Wed' }));
      const change = save.mock.calls[0]?.[0] as RunProgramChange;
      expect(typeof change).toBe('function');
      if (typeof change !== 'function') return;
      // A later program (another tap landed first) is what the change builds on.
      expect(change(makeRunProgram({ run_days: [1, 5] }))).toEqual({
        program_id: 'beginner5k',
        run_days: [1, 3, 5],
      });
      expect(change(null)).toBeNull();
    });

    it('sets the goal date', () => {
      setup(
        makeRunProgram({
          run_days: [1, 3, 5],
          end_date: addDays(today, 400),
        })
      );
      fireEvent.change(screen.getByLabelText('Goal date'), {
        target: { value: addDays(today, 500) },
      });
      expect(save).toHaveBeenLastCalledWith({
        program_id: 'beginner5k',
        end_date: addDays(today, 500),
      });
    });
  });

  it('says programs are personal while acting for someone else', () => {
    mockActingOnBehalf = true;
    setup(null);
    expect(
      screen.getByText(/Training programs are personal\./)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('training-program-picker')).toBeNull();
    // Nothing is requested for the other person's account.
    expect(mockUseRunProgram).toHaveBeenCalledWith(false);
  });

  it('shows a placeholder while loading', () => {
    mockUseRunProgram.mockReturnValue({ ...state(null), isLoading: true });
    render(
      <MemoryRouter>
        <TrainingPrograms />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('training-program-picker')).toBeNull();
  });
});
