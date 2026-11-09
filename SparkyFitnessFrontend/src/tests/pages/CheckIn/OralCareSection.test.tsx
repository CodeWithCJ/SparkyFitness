import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { OralCareSection } from '@/pages/CheckIn/OralCareSection';

const createSession = jest.fn();
const deleteSession = jest.fn();
let actingOnBehalf = false;

const session = (overrides: Record<string, unknown>) => ({
  id: 's1',
  user_id: 'user-1',
  entry_date: '2026-11-08',
  start_time: '2026-11-08T08:00:00.000Z',
  end_time: '2026-11-08T08:02:00.000Z',
  duration_seconds: 120,
  care_type: 'brushing',
  custom_label: null,
  provider: 'manual',
  external_id: null,
  notes: null,
  covered_by_sync: false,
  created_at: '2026-11-08T08:00:00.000Z',
  updated_at: '2026-11-08T08:00:00.000Z',
  ...overrides,
});

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    timezone: 'UTC',
    formatTime: () => '08:00',
  }),
}));

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf: actingOnBehalf }),
}));

jest.mock('@/hooks/CheckIn/useOralCare', () => ({
  useOralCareDaySummary: () => ({
    isLoading: false,
    data: {
      entry_date: '2026-11-08',
      settings: { daily_target: 2, target_seconds: 120 },
      brushing_count: 1,
      brushing_seconds: 130,
      brushes_at_target: 1,
      goal_met: false,
      counts_by_type: {
        brushing: 1,
        flossing: 1,
        mouthwash: 0,
        tongue_cleaning: 0,
        other: 0,
      },
      streak: 3,
      sessions: [
        session({ id: 'manual-1', covered_by_sync: true }),
        session({
          id: 'synced-1',
          provider: 'HealthKit',
          duration_seconds: 130,
        }),
        session({
          id: 'floss-1',
          care_type: 'flossing',
          duration_seconds: null,
        }),
      ],
    },
  }),
  useOralCareHistory: () => ({
    data: {
      settings: { daily_target: 2, target_seconds: 120 },
      days: [],
      streak: 3,
      best_streak: 7,
      recent_custom_labels: ['Water flosser'],
    },
  }),
  useCreateOralCareSessionMutation: () => ({
    mutateAsync: createSession,
    isPending: false,
  }),
  useUpdateOralCareSessionMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useDeleteOralCareSessionMutation: () => ({
    mutate: deleteSession,
    isPending: false,
  }),
  useSaveOralCareSettingsMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

describe('OralCareSection', () => {
  beforeEach(() => {
    createSession.mockReset();
    deleteSession.mockReset();
    actingOnBehalf = false;
  });

  it('shows progress against the goal, the streak and the best streak', () => {
    render(<OralCareSection selectedDate="2026-11-08" />);
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByText('3 days')).toBeInTheDocument();
    expect(screen.getByText('Best: 7 days')).toBeInTheDocument();
  });

  it('marks a manual brush that a synced brush also recorded', () => {
    render(<OralCareSection selectedDate="2026-11-08" />);
    expect(
      screen.getByText('Also recorded by Apple Health · counted once')
    ).toBeInTheDocument();
    expect(screen.getByText('Apple Health')).toBeInTheDocument();
  });

  it('lets only Sparky-logged sessions be edited', () => {
    render(<OralCareSection selectedDate="2026-11-08" />);
    // Two Sparky-logged sessions (manual brush, floss); the synced one is read-only.
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(3);
  });

  it('logs a brush with its duration and time on the selected day', async () => {
    render(<OralCareSection selectedDate="2026-11-08" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Brushing' })[0]!);
    fireEvent.change(screen.getByLabelText('Minutes'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(createSession).toHaveBeenCalled());
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        entry_date: '2026-11-08',
        care_type: 'brushing',
        provider: 'manual',
        duration_seconds: 120,
        custom_label: null,
      })
    );
  });

  it('needs a name before an "other" session can be saved', () => {
    render(<OralCareSection selectedDate="2026-11-08" />);
    fireEvent.click(screen.getByRole('button', { name: 'Other' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Water flosser' },
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('hides the goal button while acting for someone else', () => {
    actingOnBehalf = true;
    render(<OralCareSection selectedDate="2026-11-08" />);
    expect(
      screen.queryByRole('button', { name: 'Goal' })
    ).not.toBeInTheDocument();
  });
});
