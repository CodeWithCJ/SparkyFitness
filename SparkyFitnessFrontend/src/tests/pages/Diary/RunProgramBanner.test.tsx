import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import {
  addDays,
  storedProgramStatus,
  todayInZone,
  type RunProgramResponse,
} from '@workspace/shared';
import RunProgramBanner from '@/pages/Diary/RunProgramBanner';
import {
  useCompleteRunProgramWorkoutMutation,
  useRunProgram,
} from '@/hooks/Exercises/useRunProgram';
import { makeRunProgram } from '@/tests/mocks/runProgramFixture';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/hooks/Exercises/useRunProgram', () => ({
  useRunProgram: jest.fn(),
  useCompleteRunProgramWorkoutMutation: jest.fn(),
}));

let mockActingOnBehalf = false;
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf: mockActingOnBehalf }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ timezone: 'UTC' }),
}));
let mockHiddenTabs = new Set<string>();
jest.mock('@/hooks/Settings/useHiddenWebTabs', () => ({
  useHiddenWebTabs: () => ({ hidden: mockHiddenTabs, editState: 'ready' }),
}));

const today = todayInZone('UTC');
const complete = jest.fn();

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

const setup = (program: RunProgramResponse | null, date = today) => {
  (useRunProgram as jest.Mock).mockReturnValue(state(program));
  render(
    <MemoryRouter>
      <RunProgramBanner date={date} />
    </MemoryRouter>
  );
};

describe('Diary RunProgramBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActingOnBehalf = false;
    mockHiddenTabs = new Set();
    (useCompleteRunProgramWorkoutMutation as jest.Mock).mockReturnValue({
      mutate: complete,
      isPending: false,
    });
  });

  it('offers the next workout today when no run days are chosen', () => {
    setup(makeRunProgram({ next_index: 1 }));
    expect(screen.getByText('Up next')).toBeInTheDocument();
    expect(screen.getByText('Week 1, run 2 · 30 min')).toBeInTheDocument();
    expect(
      screen.getByText(/Training program: Beginner 5K/)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open program' })).toHaveAttribute(
      'href',
      '/exercises/training-programs'
    );
  });

  it('drops the program link when the Exercises tab is hidden', () => {
    mockHiddenTabs = new Set(['exercises']);
    setup(makeRunProgram({ next_index: 1 }));
    expect(
      screen.getByText(/Training program: Beginner 5K/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Open program' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mark as done' })
    ).toBeInTheDocument();
  });

  it('marks the workout done for today', () => {
    setup(makeRunProgram({ next_index: 1 }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));
    expect(complete).toHaveBeenCalledWith({
      index: 1,
      program_id: 'beginner5k',
      day: today,
    });
  });

  it('says "Scheduled Today" on a run day and offers the workout', () => {
    const todayWeekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    setup(makeRunProgram({ run_days: [todayWeekday] }));
    expect(screen.getByText('Scheduled Today')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark as done' })).toBeEnabled();
  });

  it('shows what is coming on a later run day, without a button', () => {
    const later = addDays(today, 3);
    const laterWeekday = new Date(`${later}T00:00:00Z`).getUTCDay();
    setup(makeRunProgram({ run_days: [laterWeekday] }), later);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as done' })).toBeNull();
  });

  it('shows nothing on a day that is not a run day', () => {
    const todayWeekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    const other = (todayWeekday + 3) % 7;
    setup(makeRunProgram({ run_days: [other] }));
    expect(screen.queryByTestId('run-program-banner')).toBeNull();
  });

  it('shows nothing when the program is switched off, finished or not started', () => {
    setup(makeRunProgram({ enabled: false }));
    expect(screen.queryByTestId('run-program-banner')).toBeNull();
  });

  it('shows nothing once the program is finished', () => {
    setup(makeRunProgram({ next_index: 27 }));
    expect(screen.queryByTestId('run-program-banner')).toBeNull();
  });

  it('shows nothing before the first day', () => {
    setup(makeRunProgram({ start_date: addDays(today, 5) }));
    expect(screen.queryByTestId('run-program-banner')).toBeNull();
  });

  it('shows nothing once today’s workout is done', () => {
    setup(makeRunProgram({ last_done_date: today, next_index: 1 }));
    expect(screen.queryByTestId('run-program-banner')).toBeNull();
  });

  it('shows nothing when there is no program', () => {
    setup(null);
    expect(screen.queryByTestId('run-program-banner')).toBeNull();
  });

  it('shows nothing while acting for someone else', () => {
    mockActingOnBehalf = true;
    setup(makeRunProgram());
    expect(screen.queryByTestId('run-program-banner')).toBeNull();
    expect(useRunProgram).toHaveBeenCalledWith(false);
  });
});
