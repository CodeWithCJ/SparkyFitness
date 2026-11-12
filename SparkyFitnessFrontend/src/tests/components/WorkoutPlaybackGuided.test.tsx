import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutPlaybackPage from '@/pages/Diary/WorkoutPlaybackPage';
import type { WorkoutPreset } from '@/types/workout';
import { createWorkoutPlaybackDraftFromPreset } from '@/utils/workoutPlayback';
import {
  __resetGuidedWorkoutPreferencesForTests,
  setGuidedWorkoutPreferences,
} from '@/utils/guidedWorkoutPreferences';
import { speakGuided } from '@/utils/guidedWorkoutSpeech';
import { playIntervalCue } from '@/utils/workoutSounds';

const mockNavigate = jest.fn();
const mockCreatePresetSession = jest.fn();
const mockUpdatePresetSession = jest.fn();
const mockSearchParams = new URLSearchParams('date=2026-09-25');
let mockLocationState: { returnTo?: string; draft?: unknown } | null = null;

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: mockLocationState }),
  useSearchParams: () => [mockSearchParams],
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
    mutateAsync: (...args: unknown[]) => mockCreatePresetSession(...args),
    isPending: false,
  }),
  useUpdatePresetSessionMutation: () => ({
    mutateAsync: (...args: unknown[]) => mockUpdatePresetSession(...args),
    isPending: false,
  }),
  useWorkoutLocations: () => ({ data: [] }),
  fetchExerciseProgressionStats: jest.fn(async () => null),
}));

jest.mock('@/utils/guidedWorkoutSpeech', () => ({
  ...jest.requireActual('@/utils/guidedWorkoutSpeech'),
  speakGuided: jest.fn(),
  stopGuidedSpeech: jest.fn(),
}));

jest.mock('@/utils/workoutSounds', () => ({
  playIntervalCue: jest.fn(),
}));

const mockSpeak = speakGuided as jest.MockedFunction<typeof speakGuided>;
const mockCue = playIntervalCue as jest.MockedFunction<typeof playIntervalCue>;

const preset = {
  id: 'preset-1',
  user_id: 'user-1',
  name: 'Home',
  exercises: [
    {
      exercise_id: 'push',
      exercise_name: 'Push-up',
      modality: 'reps_only',
      exercise: { instructions: ['Keep your core firm.', '  '] },
      sets: [
        { set_number: 1, reps: 12, rest_time: 30 },
        { set_number: 2, reps: 10, rest_time: 30 },
      ],
    },
    {
      exercise_id: 'plank',
      exercise_name: 'Plank',
      modality: 'duration',
      sets: [{ set_number: 1, duration: 20, rest_time: 30 }],
    },
  ],
} as unknown as WorkoutPreset;

function spoken(): string[][] {
  return mockSpeak.mock.calls.map(([lines]) => [...lines]);
}

// One act per call: React only commits state (and so the draft the guided
// ticker reads) when an act ends, so waits that cross a state change are
// split into a long tick plus a short one.
function tick(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

describe('WorkoutPlaybackPage guided mode', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-25T10:00:00Z'));
    window.localStorage.clear();
    __resetGuidedWorkoutPreferencesForTests();
    mockNavigate.mockReset();
    mockCreatePresetSession.mockReset();
    mockSpeak.mockClear();
    mockCue.mockClear();
    mockLocationState = {
      returnTo: '/?date=2026-09-25',
      draft: createWorkoutPlaybackDraftFromPreset(preset, '2026-09-25'),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is absent and silent with guided mode off', () => {
    render(<WorkoutPlaybackPage />);
    tick(2000);
    expect(screen.queryByTestId('guided-workout-card')).not.toBeInTheDocument();
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it("flips between an exercise's library images", () => {
    setGuidedWorkoutPreferences({ enabled: true });
    const withImages = {
      ...preset,
      exercises: [
        {
          ...preset.exercises[0],
          exercise: { images: ['push_0.jpg', 'push_1.jpg'] },
        },
      ],
    } as unknown as WorkoutPreset;
    mockLocationState = {
      returnTo: '/?date=2026-09-25',
      draft: createWorkoutPlaybackDraftFromPreset(withImages, '2026-09-25'),
    };
    render(<WorkoutPlaybackPage />);
    const card = screen.getByTestId('guided-workout-card');
    const src = () => card.querySelector('img')?.getAttribute('src') ?? '';
    expect(src()).toContain('push_0.jpg');
    tick(1000);
    expect(src()).toContain('push_1.jpg');
    tick(1000);
    expect(src()).toContain('push_0.jpg');
  });

  it('pause freezes a timed set and resume carries on from there', () => {
    setGuidedWorkoutPreferences({ enabled: true, countdownSec: 3 });
    const plankOnly = {
      ...preset,
      exercises: [preset.exercises[1]],
    } as unknown as WorkoutPreset;
    mockLocationState = {
      returnTo: '/?date=2026-09-25',
      draft: createWorkoutPlaybackDraftFromPreset(plankOnly, '2026-09-25'),
    };
    render(<WorkoutPlaybackPage />);
    tick(250);
    tick(3000);
    tick(250);
    tick(5000);
    const card = screen.getByTestId('guided-workout-card');
    expect(card).toHaveTextContent('Plank');

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(card).toHaveTextContent('Paused');
    tick(60_000);
    expect(card).toHaveTextContent('Paused');

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    tick(250);
    tick(5000);
    expect(card).toHaveTextContent('Set 1 of 1');
    tick(10_500);
    tick(250);
    expect(spoken().at(-1)).toEqual(['Workout complete.']);
  });

  it('pause also holds a running rest', () => {
    setGuidedWorkoutPreferences({ enabled: true, countdownSec: 3 });
    render(<WorkoutPlaybackPage />);
    tick(3250);
    fireEvent.click(screen.getByRole('button', { name: 'DONE — NEXT' }));
    tick(250);
    const card = screen.getByTestId('guided-workout-card');
    expect(card).toHaveTextContent('Rest');
    // The player's own rest bar has a Pause too; use the guided one.
    fireEvent.click(within(card).getByRole('button', { name: 'Pause' }));
    expect(card).toHaveTextContent('Paused');
    tick(20_000);
    expect(card).toHaveTextContent('Paused');
    fireEvent.click(within(card).getByRole('button', { name: 'Resume' }));
    expect(card).toHaveTextContent('Rest');
  });

  it('mutes the voice but keeps the caption', () => {
    const actual = jest.requireActual('@/utils/guidedWorkoutSpeech');
    mockSpeak.mockImplementation((lines, options) =>
      actual.speakGuided(lines, options)
    );
    setGuidedWorkoutPreferences({ enabled: true, countdownSec: 3 });
    render(<WorkoutPlaybackPage />);
    tick(250);
    expect(screen.getByTestId('guided-caption')).toHaveTextContent(
      'Get ready. Starting Push-up.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mute voice' }));
    tick(3000);
    expect(screen.getByTestId('guided-caption')).toHaveTextContent(
      'Push-up. 12 reps.'
    );
    // Instructions appear in the caption only, not as a list.
    expect(screen.queryByTestId('guided-instructions')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Unmute voice' })
    ).toBeInTheDocument();
    mockSpeak.mockReset();
  });

  it('replays the current set and all its instructions', () => {
    setGuidedWorkoutPreferences({ enabled: true, countdownSec: 3 });
    render(<WorkoutPlaybackPage />);
    tick(3250);
    fireEvent.click(screen.getByRole('button', { name: 'DONE — NEXT' }));
    tick(31_000);
    tick(250);
    // Set 2 skips the instructions; Replay reads them anyway.
    expect(spoken().at(-1)).toEqual(['Push-up. 10 reps.']);
    fireEvent.click(
      screen.getByRole('button', { name: 'Replay instructions' })
    );
    expect(spoken().at(-1)).toEqual([
      'Push-up. 10 reps.',
      'Keep your core firm.',
    ]);

    // Disabled while paused.
    const card = screen.getByTestId('guided-workout-card');
    fireEvent.click(within(card).getByRole('button', { name: 'Pause' }));
    expect(
      screen.getByRole('button', { name: 'Replay instructions' })
    ).toBeDisabled();
  });

  it('guides a whole session and ends on the summary', async () => {
    setGuidedWorkoutPreferences({ enabled: true, countdownSec: 3 });
    render(<WorkoutPlaybackPage />);

    tick(250);
    expect(spoken()).toEqual([['Get ready. Starting Push-up.']]);
    expect(screen.getByText('Get ready')).toBeInTheDocument();

    tick(3000);
    expect(mockCue).toHaveBeenCalledWith('countdown');
    expect(spoken().at(-1)).toEqual([
      'Push-up. 12 reps.',
      'Keep your core firm.',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'DONE — NEXT' }));
    tick(250);
    expect(spoken().at(-1)).toEqual(['Rest. 30 seconds.', 'Next: Push-up.']);
    expect(screen.getByText('Next up')).toBeInTheDocument();

    // The runner's own clock ends the rest; set 2 skips the instructions.
    tick(31_000);
    tick(250);
    expect(spoken().at(-1)).toEqual(['Push-up. 10 reps.']);

    fireEvent.click(screen.getByRole('button', { name: 'DONE — NEXT' }));
    tick(250);
    expect(spoken().at(-1)).toEqual(['Rest. 30 seconds.', 'Next: Plank.']);
    tick(31_000);
    tick(250);

    // Timed set: get ready, then it runs and finishes on its own.
    expect(screen.getByText('Get ready')).toBeInTheDocument();
    tick(3000);
    tick(250);
    expect(spoken().at(-1)).toEqual(['Plank. 20 seconds.']);
    expect(
      screen.queryByRole('button', { name: 'DONE — NEXT' })
    ).not.toBeInTheDocument();
    tick(10_000);
    expect(spoken().at(-1)).toEqual(['Halfway.']);
    tick(10_500);
    tick(250);
    expect(spoken().at(-1)).toEqual(['Workout complete.']);
    expect(
      screen.getByText('All sets done. Finish the workout to save it.')
    ).toBeInTheDocument();

    // The saved session's calories come back in the summary.
    mockCreatePresetSession.mockResolvedValue({
      exercises: [{ calories_burned: 40 }, { calories_burned: 12.4 }],
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Finish Workout' }));
    });
    const payload = mockCreatePresetSession.mock.calls[0]?.[0];
    expect(payload.exercises[1].sets[0].duration).toBe(20);
    expect(screen.getByText('Workout complete')).toBeInTheDocument();
    expect(screen.getByText('52 kcal')).toBeInTheDocument();
    expect(screen.getByText('3/3')).toBeInTheDocument();
    // Still on the summary: not yet sent back to the diary.
    expect(mockNavigate).not.toHaveBeenCalledWith(
      '/?date=2026-09-25',
      expect.anything()
    );

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(mockNavigate).toHaveBeenCalledWith('/?date=2026-09-25', {
      replace: true,
    });
  });
});
