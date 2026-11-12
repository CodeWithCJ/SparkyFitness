import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutPlaybackPage from '@/pages/Diary/WorkoutPlaybackPage';
import type { WorkoutPreset } from '@/types/workout';
import { createWorkoutPlaybackDraftFromPreset } from '@/utils/workoutPlayback';

let mockLocationState: { returnTo?: string; draft?: unknown } | null = null;

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ state: mockLocationState }),
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

jest.mock('@/utils/workoutSounds', () => ({
  playIntervalCue: jest.fn(),
}));

const rampPreset = {
  id: 'preset-ramp',
  user_id: 'user-1',
  name: 'Bench',
  exercises: [
    {
      exercise_id: 'bench',
      exercise_name: 'Bench Press',
      modality: 'weight_reps',
      ramp_increment: 5,
      sets: [
        { set_number: 1, reps: 5, weight: 100, rest_time: 90 },
        { set_number: 2, reps: 5, weight: 100, rest_time: 90 },
        { set_number: 3, reps: 5, weight: 100, rest_time: 90 },
      ],
    },
  ],
} as unknown as WorkoutPreset;

const weights = () =>
  [1, 2, 3].map(
    (n) => (screen.getByLabelText(`Weight set ${n}`) as HTMLInputElement).value
  );

describe('WorkoutPlaybackPage per-set ramp', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('pre-fills working sets from the first set when a fresh workout loads', async () => {
    mockLocationState = {
      draft: createWorkoutPlaybackDraftFromPreset(rampPreset, '2026-09-25'),
    };
    render(<WorkoutPlaybackPage />);
    await waitFor(() => expect(weights()).toEqual(['100', '105', '110']));
  });

  it('leaves a reopened draft as the lifter left it', async () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      rampPreset,
      '2026-09-25'
    );
    // Reopened after the load pass ran, with a heavier set 1 typed in.
    mockLocationState = {
      draft: {
        ...draft,
        load_adjustments_applied: true,
        exercises: draft.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set, i) => ({
            ...set,
            weight: [120, 105, 110][i],
          })),
        })),
      },
    };
    render(<WorkoutPlaybackPage />);
    // Give the async load pass (were it to run) time to commit.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(weights()).toEqual(['120', '105', '110']);
  });
});
