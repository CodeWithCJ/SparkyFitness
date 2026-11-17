import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutPlaybackPage from '@/pages/Diary/WorkoutPlaybackPage';
import type { WorkoutPreset } from '@/types/workout';
import { createWorkoutPlaybackDraftFromPreset } from '@/utils/workoutPlayback';
import type { ExerciseCoachingSignal } from '@workspace/shared';

let mockLocationState: {
  returnTo?: string;
  draft?: unknown;
  ownerId?: string;
} | null = null;
const mockFetchSignals = jest.fn();

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  // Route state as the Diary builds it: a draft for the person on screen.
  useLocation: () => ({
    state: mockLocationState && { ownerId: 'user-1', ...mockLocationState },
  }),
  useSearchParams: () => [new URLSearchParams('date=2026-09-25')],
}));
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'user-1' }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    weightUnit: 'kg',
    timezone: 'UTC',
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    getEnergyUnitString: () => 'kcal',
  }),
}));
jest.mock('@/hooks/Exercises/useExerciseEntries', () => ({
  useCreatePresetSessionMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useUpdatePresetSessionMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useWorkoutLocations: () => ({ data: [] }),
  fetchExerciseProgressionStats: jest.fn(async () => null),
}));
jest.mock('@/hooks/Exercises/useWorkoutCoaching', () => ({
  fetchWorkoutCoachingSignals: (...args: unknown[]) =>
    mockFetchSignals(...args),
}));
jest.mock('@/utils/workoutSounds', () => ({ playIntervalCue: jest.fn() }));

const preset = {
  id: 'preset-1',
  user_id: 'user-1',
  name: 'Curls',
  exercises: [
    {
      exercise_id: 'curl',
      exercise_name: 'Dumbbell Curl',
      modality: 'weight_reps',
      exercise: { mechanic: 'isolation' },
      sets: [
        { set_number: 1, reps: 10, weight: 20, rest_time: 60 },
        { set_number: 2, reps: 10, weight: 20, rest_time: 60 },
      ],
    },
  ],
} as unknown as WorkoutPreset;

function signal(
  overrides: Partial<ExerciseCoachingSignal>
): ExerciseCoachingSignal {
  return {
    exercise_id: 'curl',
    last_performed_date: '2026-09-23',
    days_since_last_performed: 2,
    last_difficulty: null,
    last_pain: null,
    too_easy_streak: 0,
    too_hard_streak: 0,
    pain_streak: 0,
    avg_rpe: null,
    avg_rir: null,
    sessions_in_variation_window: 1,
    ...overrides,
  };
}

const weights = () =>
  [1, 2].map(
    (n) => (screen.getByLabelText(`Weight set ${n}`) as HTMLInputElement).value
  );

describe('WorkoutPlaybackPage adaptive suggestions', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockFetchSignals.mockReset();
    mockLocationState = {
      draft: createWorkoutPlaybackDraftFromPreset(preset, '2026-09-25'),
    };
  });

  it('lightens the day after pain, explains why, and can switch back', async () => {
    mockFetchSignals.mockResolvedValue({
      adaptive_suggestions: true,
      signals: [signal({ last_pain: 'exercise', pain_streak: 1 })],
    });
    render(<WorkoutPlaybackPage />);
    await waitFor(() => expect(weights()).toEqual(['17.5', '17.5']));
    expect(mockFetchSignals).toHaveBeenCalledWith(['curl']);
    expect(
      screen.getByText('Lighter today: you reported pain here last time.')
    ).toBeInTheDocument();
    expect(screen.getByText('See alternatives')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Use my usual'));
    expect(weights()).toEqual(['20', '20']);
    expect(
      screen.getByText('Using your usual suggestion.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Use the adjusted suggestion'));
    expect(weights()).toEqual(['17.5', '17.5']);
  });

  it('changes nothing when adaptive suggestions are off', async () => {
    mockFetchSignals.mockResolvedValue({
      adaptive_suggestions: false,
      signals: [],
    });
    render(<WorkoutPlaybackPage />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(weights()).toEqual(['20', '20']);
    expect(
      screen.queryByTestId('adaptive-suggestion-notice')
    ).not.toBeInTheDocument();
  });

  it('keeps the workout usable when the signals request fails', async () => {
    mockFetchSignals.mockRejectedValue(new Error('offline'));
    render(<WorkoutPlaybackPage />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(weights()).toEqual(['20', '20']);
  });

  it('suggests a variation for an accessory done every session', async () => {
    mockFetchSignals.mockResolvedValue({
      adaptive_suggestions: true,
      signals: [signal({ sessions_in_variation_window: 7 })],
    });
    render(<WorkoutPlaybackPage />);
    expect(
      await screen.findByText(
        "You've done this in most recent workouts. Try a variation?"
      )
    ).toBeInTheDocument();
    expect(weights()).toEqual(['20', '20']);
  });
});
