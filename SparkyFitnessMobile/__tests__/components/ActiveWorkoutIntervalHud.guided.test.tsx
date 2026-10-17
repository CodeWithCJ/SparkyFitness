import { act, render, screen } from '@testing-library/react-native';
import type { PresetSessionResponse } from '@workspace/shared';
import ActiveWorkoutIntervalHud from '../../src/components/ActiveWorkoutIntervalHud';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';
import { speakGuided } from '../../src/services/speech';
import { playIntervalCue } from '../../src/services/sounds';

jest.mock('../../src/services/speech', () => ({
  ...jest.requireActual('../../src/services/speech'),
  speakGuided: jest.fn(),
  stopGuidedSpeech: jest.fn(),
}));
jest.mock('../../src/services/sounds', () => ({
  playIntervalCue: jest.fn(),
  playRestCompleteSound: jest.fn(),
  willPlayRestCompleteSound: jest.fn(() => false),
  isRestTimerSoundEnabled: jest.fn(() => true),
}));
jest.mock('../../src/services/notifications', () => ({
  scheduleRestNotification: jest.fn(async () => 'notif'),
  cancelScheduledNotification: jest.fn(async () => undefined),
  fireRestCompleteCue: jest.fn(),
  COMPLETE_SET_ACTION: 'complete-set',
  addNotificationResponseListener: jest.fn(() => ({ remove: jest.fn() })),
  dismissDeliveredNotification: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/haptics', () => ({
  fireSuccessHaptic: jest.fn(),
  fireSelectionHaptic: jest.fn(),
  fireImpactHaptic: jest.fn(),
}));

const mockSpeak = speakGuided as jest.MockedFunction<typeof speakGuided>;
const mockCue = playIntervalCue as jest.MockedFunction<typeof playIntervalCue>;

const START = 1_700_000_000_000;

function tabataSession(): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    entry_date: '2026-09-25',
    workout_preset_id: null,
    name: 'Tabata',
    description: null,
    notes: null,
    source: 'sparky',
    total_duration_minutes: 0,
    activity_details: [],
    exercises: ['Burpee', 'Squat'].map((name, i) => ({
      id: `e${i}`,
      exercise_id: `lib${i}`,
      duration_minutes: 0,
      calories_burned: 0,
      entry_date: '2026-09-25',
      notes: null,
      distance: null,
      avg_heart_rate: null,
      source: null,
      exercise_snapshot: {
        id: `lib${i}`,
        name,
        category: 'Cardio',
        modality: 'reps_only',
        images: null,
        source: 'system',
      },
      activity_details: [],
      sets: [
        {
          id: 10 + i,
          set_number: 1,
          set_type: 'working',
          reps: null,
          weight: null,
          duration: 20,
          rest_time: 10,
          notes: null,
          rpe: null,
          completed_at: null,
        },
      ],
    })),
  } as unknown as PresetSessionResponse;
}

describe('ActiveWorkoutIntervalHud in guided mode', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(START);
    __resetActiveWorkoutStoreForTests();
    __resetAppPreferencesStoreForTests();
    mockSpeak.mockClear();
    mockCue.mockClear();
    useActiveWorkoutStore
      .getState()
      .startWorkout(tabataSession(), { workoutFormat: 'tabata' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the HUD silent and unchanged with guided mode off', () => {
    jest.setSystemTime(START + 6_000);
    render(<ActiveWorkoutIntervalHud />);
    expect(mockSpeak).not.toHaveBeenCalled();
    expect(mockCue).toHaveBeenCalledWith('work');
    expect(screen.queryByTestId('interval-guided-step')).toBeNull();
  });

  it('moves through the phases on its own clock', () => {
    jest.setSystemTime(START + 1_000);
    render(<ActiveWorkoutIntervalHud />);
    expect(mockCue).not.toHaveBeenCalledWith('work');

    // The 5s countdown runs out with no re-render from outside the HUD.
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(mockCue).toHaveBeenCalledWith('work');
  });

  it('narrates the countdown with the first exercise and shows it as next up', () => {
    useAppPreferencesStore.setState({ guidedWorkoutEnabled: true });
    jest.setSystemTime(START + 1_000);
    render(<ActiveWorkoutIntervalHud />);
    expect(mockSpeak).toHaveBeenCalledWith(['Get ready. Starting Burpee.'], {
      interrupt: true,
      language: 'en',
    });
    expect(screen.getByText('Next up')).toBeTruthy();
    expect(screen.getByText('Burpee')).toBeTruthy();
  });

  it('announces the work phase over the existing chime', () => {
    useAppPreferencesStore.setState({ guidedWorkoutEnabled: true });
    // 5s countdown, then Burpee works for 20s.
    jest.setSystemTime(START + 6_000);
    render(<ActiveWorkoutIntervalHud />);
    expect(mockCue).toHaveBeenCalledWith('work');
    expect(mockSpeak).toHaveBeenCalledWith(['Burpee. 20 seconds.'], {
      interrupt: true,
      language: 'en',
    });
    expect(screen.queryByText('Next up')).toBeNull();
    expect(screen.getByText('Burpee')).toBeTruthy();
  });

  it('says rest and what comes next', () => {
    useAppPreferencesStore.setState({ guidedWorkoutEnabled: true });
    // countdown 5s + Burpee 20s → first rest.
    jest.setSystemTime(START + 26_000);
    render(<ActiveWorkoutIntervalHud />);
    expect(mockCue).toHaveBeenCalledWith('rest');
    expect(mockSpeak).toHaveBeenCalledWith(['Rest.', 'Next: Squat.'], {
      interrupt: true,
      language: 'en',
    });
  });
});
