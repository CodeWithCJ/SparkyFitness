import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutPlaybackPage from '@/pages/Diary/WorkoutPlaybackPage';
import type { WorkoutPreset } from '@/types/workout';
import { createWorkoutPlaybackDraftFromPreset } from '@/utils/workoutPlayback';

let mockLocationState: {
  returnTo?: string;
  draft?: unknown;
  ownerId?: string;
} | null = null;

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
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

// GET /api/v2/exercises/:id/stats as the server sends it: camelCase set
// fields, with warm-ups normalized to `warmup`.
const mockStats = {
  bestSet: null,
  lastSet: null,
  recentSessions: [
    {
      entryDate: '2026-09-23',
      sets: [
        { setNumber: 1, setType: 'warmup', reps: 5, weight: 20 },
        { setNumber: 2, setType: 'warmup', reps: 5, weight: 40 },
        { setNumber: 3, setType: 'Working Set', reps: 5, weight: 100 },
        { setNumber: 4, setType: 'Working Set', reps: 5, weight: 100 },
        { setNumber: 5, setType: 'Working Set', reps: 5, weight: 100 },
      ],
    },
  ],
};

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
  fetchExerciseProgressionStats: jest.fn(async () => mockStats),
}));

jest.mock('@/utils/workoutSounds', () => ({
  playIntervalCue: jest.fn(),
}));

const squatPreset = {
  id: 'preset-5x5',
  user_id: 'user-1',
  name: 'Day A',
  exercises: [
    {
      exercise_id: 'squat',
      exercise_name: 'Squat',
      modality: 'weight_reps',
      progression_mode: 'fixed',
      rep_goal: 5,
      increment_type: 'weight',
      increment_value: 2.5,
      sets: [
        { set_number: 1, set_type: 'Warm-up', reps: 5, weight: 20 },
        { set_number: 2, set_type: 'Warm-up', reps: 5, weight: 40 },
        { set_number: 3, set_type: 'Working Set', reps: 5, weight: 100 },
        { set_number: 4, set_type: 'Working Set', reps: 5, weight: 100 },
        { set_number: 5, set_type: 'Working Set', reps: 5, weight: 100 },
      ],
    },
  ],
} as unknown as WorkoutPreset;

const weights = () =>
  [1, 2, 3, 4, 5].map(
    (n) => (screen.getByLabelText(`Weight set ${n}`) as HTMLInputElement).value
  );

describe('WorkoutPlaybackPage progression with warm-ups', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('progresses working sets from last time and leaves warm-ups alone', async () => {
    mockLocationState = {
      draft: createWorkoutPlaybackDraftFromPreset(squatPreset, '2026-09-25'),
    };
    render(<WorkoutPlaybackPage />);
    await waitFor(() =>
      expect(weights()).toEqual(['20', '40', '102.5', '102.5', '102.5'])
    );
  });
});
