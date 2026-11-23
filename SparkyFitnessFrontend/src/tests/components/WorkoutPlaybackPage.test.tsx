import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutPlaybackPage from '@/pages/Diary/WorkoutPlaybackPage';
import type { WorkoutPreset } from '@/types/workout';
import { createWorkoutPlaybackDraftFromPreset } from '@/utils/workoutPlayback';

const mockNavigate = jest.fn();
const mockCreatePresetSession = jest.fn();
const mockUpdatePresetSession = jest.fn();
const mockSearchParams = new URLSearchParams('date=2026-04-27');
let mockLocationState: {
  returnTo?: string;
  draft?: unknown;
  ownerId?: string;
} | null = null;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValue?: string,
      values?: Record<string, string | number>
    ) =>
      (defaultValue || key).replace(/\{\{(\w+)\}\}/g, (match, name) =>
        String(values?.[name] ?? match)
      ),
  }),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  // Route state as the Diary builds it: a draft for the person on screen.
  useLocation: () => ({
    state: mockLocationState && { ownerId: 'user-1', ...mockLocationState },
  }),
  useSearchParams: () => [mockSearchParams],
}));

let mockActiveUserId = 'user-1';
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: mockActiveUserId }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    weightUnit: 'kg',
    timezone: 'UTC',
    timeFormat: 'HH:mm',
  }),
}));

jest.mock('@/hooks/Exercises/useExerciseEntries', () => ({
  useCreatePresetSessionMutation: () => ({
    mutateAsync: (...args: unknown[]) => mockCreatePresetSession(...args),
    isPending: false,
  }),
  useUpdatePresetSessionMutation: () => ({
    mutateAsync: (...args: unknown[]) => mockUpdatePresetSession(...args),
    isPending: false,
  }),
  useWorkoutLocations: () => ({ data: ['Home Gym', 'Downtown'] }),
}));

const presetFixture: WorkoutPreset = {
  id: 'preset-1',
  user_id: 'user-1',
  name: 'Upper Body',
  description: 'Push + Pull',
  exercises: [
    {
      exercise_id: 'exercise-1',
      exercise_name: 'Bench Press',
      sets: [{ set_number: 1, reps: 8, weight: 80, rest_time: 90 }],
    },
    {
      exercise_id: 'exercise-2',
      exercise_name: 'Barbell Row',
      sets: [{ set_number: 1, reps: 10, weight: 60, rest_time: 90 }],
    },
  ],
} as unknown as WorkoutPreset;

describe('WorkoutPlaybackPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockCreatePresetSession.mockReset();
    window.localStorage.clear();
    mockActiveUserId = 'user-1';
    mockLocationState = { returnTo: '/?date=2026-04-27' };
  });

  it('shows elapsed timer and collapses completed exercises', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      presetFixture,
      '2026-04-27'
    );
    if (draft.exercises[0]?.sets[0]) {
      draft.exercises[0].sets[0].completed = true;
    }
    draft.active_exercise_index = 1;
    draft.active_set_index = 0;
    mockLocationState = { returnTo: '/?date=2026-04-27', draft };

    render(<WorkoutPlaybackPage />);

    expect(screen.getAllByText('Duration').length).toBeGreaterThan(0);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThanOrEqual(1);
  });

  it('renders duration instead of reps and weight for a timed set', () => {
    const timedPreset = {
      ...presetFixture,
      exercises: [
        {
          exercise_id: 'exercise-treadmill',
          exercise_name: 'Treadmill Warm Up',
          category: 'cardio',
          sets: [
            {
              set_number: 1,
              set_type: 'Warm-up',
              duration: 600,
              reps: null,
              weight: null,
              rest_time: 60,
            },
          ],
        },
      ],
    } as unknown as WorkoutPreset;
    const draft = createWorkoutPlaybackDraftFromPreset(
      timedPreset,
      '2026-04-27'
    );
    expect(draft.exercises[0]?.modality).toBe('duration_distance');
    // Pre-modality local drafts must retain their time-based rendering.
    delete (draft.exercises[0] as { modality?: unknown }).modality;
    mockLocationState = { returnTo: '/?date=2026-04-27', draft };

    render(<WorkoutPlaybackPage />);

    expect(screen.getByText('Duration (s)')).toBeInTheDocument();
    const durationInput = screen.getByLabelText(
      'Duration set 1'
    ) as HTMLInputElement;
    expect(durationInput).toHaveValue(600);
    fireEvent.change(durationInput, { target: { value: '300' } });
    expect(durationInput).toHaveValue(300);
    expect(screen.queryByLabelText('Reps set 1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Weight set 1')).not.toBeInTheDocument();
  });

  it('keeps blank rows duration-based in legacy timed drafts', () => {
    const timedPreset = {
      ...presetFixture,
      exercises: [
        {
          exercise_id: 'exercise-treadmill',
          exercise_name: 'Treadmill Warm Up',
          category: 'cardio',
          sets: [
            {
              set_number: 1,
              duration: 600,
              reps: null,
              weight: 0,
              rest_time: 60,
            },
          ],
        },
      ],
    } as unknown as WorkoutPreset;
    const draft = createWorkoutPlaybackDraftFromPreset(
      timedPreset,
      '2026-04-27'
    );
    delete (draft.exercises[0] as { modality?: unknown }).modality;
    draft.exercises[0]?.sets.push({
      set_number: 2,
      duration: null,
      reps: null,
      weight: null,
      rest_time: 60,
      completed: false,
      completed_at: null,
    });
    mockLocationState = { returnTo: '/?date=2026-04-27', draft };

    render(<WorkoutPlaybackPage />);

    expect(screen.getByText('Duration (s)')).toBeInTheDocument();
    expect(screen.getByLabelText('Duration set 1')).toHaveValue(600);
    expect(screen.getByLabelText('Duration set 2')).toHaveValue(null);
    expect(screen.queryByLabelText('Reps set 2')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Weight set 2')).not.toBeInTheDocument();
  });

  it('trusts exercise modality over stale set data', () => {
    const mixedPreset = {
      ...presetFixture,
      exercises: [
        {
          exercise_id: 'exercise-plank',
          exercise_name: 'Plank',
          category: 'isometric',
          sets: [
            {
              set_number: 1,
              duration: null,
              reps: null,
              weight: null,
              rest_time: 60,
            },
          ],
        },
        {
          exercise_id: 'exercise-bench',
          exercise_name: 'Bench Press',
          sets: [
            {
              set_number: 1,
              duration: 600,
              reps: null,
              weight: 80,
              rest_time: 90,
            },
          ],
        },
      ],
    } as unknown as WorkoutPreset;
    const draft = createWorkoutPlaybackDraftFromPreset(
      mixedPreset,
      '2026-04-27'
    );
    expect(draft.exercises[0]?.modality).toBe('duration');
    expect(draft.exercises[1]?.modality).toBe('weight_reps');
    mockLocationState = { returnTo: '/?date=2026-04-27', draft };

    render(<WorkoutPlaybackPage />);

    // Plank is timed by modality even with no duration values yet.
    expect(screen.getByLabelText('Duration set 1')).toHaveValue(null);
    // Bench keeps reps/weight despite a stale duration on its set.
    expect(screen.getByLabelText('Reps set 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Weight set 1')).toBeInTheDocument();
  });

  it('restores a draft from localStorage on reload', async () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      presetFixture,
      '2026-04-27'
    );
    window.localStorage.setItem(
      'sparky.workoutPlaybackDraft.v2:user-1:2026-04-27',
      JSON.stringify(draft)
    );
    mockLocationState = { returnTo: '/?date=2026-04-27' };

    render(<WorkoutPlaybackPage />);

    await waitFor(() => {
      expect(screen.getByText('Upper Body')).toBeInTheDocument();
    });
    expect(screen.getAllByLabelText('Reps set 1')[0]).toBeInTheDocument();
  });

  it('does not take a draft handed over for someone else', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      presetFixture,
      '2026-04-27'
    );
    // A resume made for user-2 that finished after user-1 took over.
    mockLocationState = {
      returnTo: '/?date=2026-04-27',
      draft,
      ownerId: 'user-2',
    };

    render(<WorkoutPlaybackPage />);

    expect(screen.queryByText('Upper Body')).not.toBeInTheDocument();
    expect(
      window.localStorage.getItem(
        'sparky.workoutPlaybackDraft.v2:user-1:2026-04-27'
      )
    ).toBeNull();
  });

  it("does not show one person's stored draft to someone else", async () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      presetFixture,
      '2026-04-27'
    );
    window.localStorage.setItem(
      'sparky.workoutPlaybackDraft.v2:user-1:2026-04-27',
      JSON.stringify(draft)
    );
    mockLocationState = { returnTo: '/?date=2026-04-27' };

    const { rerender } = render(<WorkoutPlaybackPage />);
    await waitFor(() => {
      expect(screen.getByText('Upper Body')).toBeInTheDocument();
    });

    // Another account (or profile) takes over the page.
    mockActiveUserId = 'user-2';
    rerender(<WorkoutPlaybackPage />);
    expect(screen.queryByText('Upper Body')).not.toBeInTheDocument();
  });

  it('starts rest countdown when current set is completed', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      presetFixture,
      '2026-04-27'
    );
    mockLocationState = { returnTo: '/?date=2026-04-27', draft };

    render(<WorkoutPlaybackPage />);

    fireEvent.click(screen.getAllByLabelText('Complete set 1')[0]!);

    expect(
      screen.getAllByRole('button', { name: 'Pause' }).length
    ).toBeGreaterThan(0);
    expect(screen.getByLabelText('Pause')).toBeInTheDocument();
    expect(screen.getByText('640')).toBeInTheDocument();
  });

  it('allows editing set values and adding/removing sets', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      presetFixture,
      '2026-04-27'
    );
    mockLocationState = { returnTo: '/?date=2026-04-27', draft };

    render(<WorkoutPlaybackPage />);

    const repsInput = screen.getAllByLabelText(
      'Reps set 1'
    )[0] as HTMLInputElement;
    fireEvent.change(repsInput, { target: { value: '12' } });
    expect(repsInput.value).toBe('12');

    fireEvent.click(screen.getByLabelText('Add set for Bench Press'));
    expect(screen.getAllByLabelText('Reps set 2').length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getAllByLabelText('Remove set 2 for Bench Press')[0]!
    );
    expect(screen.queryByLabelText('Reps set 2')).not.toBeInTheDocument();

    const sessionNotes = screen.getAllByPlaceholderText(
      'Any notes about this session...'
    )[0] as HTMLTextAreaElement;
    fireEvent.change(sessionNotes, { target: { value: 'Felt strong today' } });
    expect(sessionNotes.value).toBe('Felt strong today');

    expect(screen.queryByLabelText('Set notes 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByLabelText('Toggle notes for set 1')[0]!);
    expect(screen.getByLabelText('Set notes 1')).toBeInTheDocument();
  });

  it('clears the start time when the clear button is clicked', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      presetFixture,
      '2026-04-27'
    );
    draft.started_at = '2026-04-27T14:30:00.000Z';
    mockLocationState = { returnTo: '/?date=2026-04-27', draft };

    render(<WorkoutPlaybackPage />);

    const startTimeSegments = () =>
      within(screen.getByRole('group', { name: 'Start Time' })).getAllByRole(
        'spinbutton'
      );
    expect(startTimeSegments().map((s) => s.textContent)).toEqual(['14', '30']);

    fireEvent.click(screen.getByText('Clear'));
    for (const segment of startTimeSegments()) {
      expect(segment).toHaveAttribute('data-placeholder');
    }
  });

  it('allows extending a finished exercise after expanding it', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      presetFixture,
      '2026-04-27'
    );
    if (draft.exercises[0]?.sets[0]) {
      draft.exercises[0].sets[0].completed = true;
    }
    mockLocationState = { returnTo: '/?date=2026-04-27', draft };

    render(<WorkoutPlaybackPage />);

    fireEvent.click(screen.getByLabelText('Expand Bench Press'));
    fireEvent.click(screen.getByLabelText('Add set for Bench Press'));

    expect(screen.getAllByLabelText('Reps set 2').length).toBeGreaterThan(0);
  });

  it('edits rest via rest chip presets', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      presetFixture,
      '2026-04-27'
    );
    mockLocationState = { returnTo: '/?date=2026-04-27', draft };

    render(<WorkoutPlaybackPage />);

    fireEvent.click(screen.getAllByLabelText('Edit rest for set 1')[0]!);
    fireEvent.click(screen.getByRole('button', { name: '2:00' }));

    fireEvent.click(screen.getAllByLabelText('Edit rest for set 1')[0]!);
    expect(screen.getByLabelText('Custom (seconds)')).toHaveValue(120);
  });

  it('keeps rest indicator anchored to next set even when selecting others', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      presetFixture,
      '2026-04-27'
    );
    if (draft.exercises[0]?.sets[0]) {
      draft.exercises[0].sets.push({
        ...draft.exercises[0].sets[0],
        set_number: 2,
      });
    }
    mockLocationState = { returnTo: '/?date=2026-04-27', draft };

    render(<WorkoutPlaybackPage />);

    fireEvent.click(screen.getAllByLabelText('Complete set 1')[0]!);
    expect(screen.getByLabelText('Pause')).toBeInTheDocument();

    fireEvent.click(
      screen.getAllByLabelText('Select set 2 for Bench Press')[0]!
    );

    expect(screen.getByLabelText('Pause')).toBeInTheDocument();
  });
});
