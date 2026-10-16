import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type {
  ExerciseEntryResponse,
  PresetSessionResponse,
} from '@workspace/shared';
import ActiveWorkoutGuidedCard from '../../src/components/ActiveWorkoutGuidedCard';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';
import { speakGuided, stopGuidedSpeech } from '../../src/services/speech';
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
  setRestKeepAlive: jest.fn(),
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
jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(async () => undefined),
}));

const mockSpeak = speakGuided as jest.MockedFunction<typeof speakGuided>;
const mockStop = stopGuidedSpeech as jest.MockedFunction<
  typeof stopGuidedSpeech
>;
const mockCue = playIntervalCue as jest.MockedFunction<typeof playIntervalCue>;

function exercise(
  id: string,
  name: string,
  modality: 'reps_only' | 'duration',
  sets: { id: number; reps?: number; duration?: number }[],
  instructions: string[] = []
): ExerciseEntryResponse {
  return {
    id,
    exercise_id: `${id}-lib`,
    duration_minutes: 0,
    calories_burned: 0,
    entry_date: '2026-09-25',
    notes: null,
    distance: null,
    avg_heart_rate: null,
    source: null,
    exercise_snapshot: {
      id: `${id}-lib`,
      name,
      category: modality === 'duration' ? 'Stretching' : 'Strength',
      modality,
      images: null,
      instructions,
      source: 'system',
    },
    activity_details: [],
    sets: sets.map((s, i) => ({
      id: s.id,
      set_number: i + 1,
      set_type: 'working',
      reps: s.reps ?? null,
      weight: null,
      duration: s.duration ?? null,
      rest_time: 30,
      notes: null,
      rpe: null,
      completed_at: null,
    })),
  } as unknown as ExerciseEntryResponse;
}

function makeSession(): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    entry_date: '2026-09-25',
    workout_preset_id: null,
    name: 'Home',
    description: null,
    notes: null,
    source: 'sparky',
    total_duration_minutes: 0,
    activity_details: [],
    exercises: [
      exercise(
        'e1',
        'Push-up',
        'reps_only',
        [
          { id: 1, reps: 12 },
          { id: 2, reps: 10 },
        ],
        ['Keep your core firm.', 'Lower slowly.']
      ),
      exercise('e2', 'Plank', 'duration', [{ id: 3, duration: 20 }]),
    ],
  } as unknown as PresetSessionResponse;
}

function spoken(): string[][] {
  return mockSpeak.mock.calls.map(([lines]) => [...lines]);
}

function renderCard() {
  const onCompleteSet = (setId: string) =>
    useActiveWorkoutStore.getState().completeSet(setId);
  return render(
    <ActiveWorkoutGuidedCard
      getImageSource={() => null}
      onCompleteSet={onCompleteSet}
    />
  );
}

describe('ActiveWorkoutGuidedCard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1_700_000_000_000);
    __resetActiveWorkoutStoreForTests();
    __resetAppPreferencesStoreForTests();
    useAppPreferencesStore.setState({
      guidedWorkoutEnabled: true,
      guidedCountdownSec: 3,
    });
    mockSpeak.mockClear();
    mockStop.mockClear();
    mockCue.mockClear();
    useActiveWorkoutStore.getState().startWorkout(makeSession());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs a whole session: get ready, reps, rest, timed set, complete', () => {
    renderCard();

    // Session start: get ready, with a countdown and no DONE — NEXT yet.
    act(() => jest.advanceTimersByTime(250));
    expect(spoken()).toEqual([['Get ready. Starting Push-up.']]);
    expect(screen.getByText('Get ready')).toBeTruthy();
    expect(screen.queryByText('DONE — NEXT')).toBeNull();

    // Countdown beeps at 3-2-1, then the set is announced with every
    // instruction line (first set of the exercise).
    act(() => jest.advanceTimersByTime(3000));
    expect(mockCue).toHaveBeenCalledWith('countdown');
    expect(spoken().at(-1)).toEqual([
      'Push-up. 12 reps.',
      'Keep your core firm.',
      'Lower slowly.',
    ]);

    // DONE — NEXT logs the set and starts the rest, announcing what is next.
    fireEvent.press(screen.getByText('DONE — NEXT'));
    const store = useActiveWorkoutStore.getState();
    expect(store.completedSetIds['1']).toBeDefined();
    expect(store.rest.state).toBe('resting');
    expect(spoken().at(-1)).toEqual(['Rest. 30 seconds.', 'Next: Push-up.']);
    expect(screen.getByText('Next up')).toBeTruthy();

    // Rest over: set 2 is announced without repeating the instructions.
    act(() => useActiveWorkoutStore.getState().dismissRest());
    act(() => jest.advanceTimersByTime(250));
    expect(spoken().at(-1)).toEqual(['Push-up. 10 reps.']);

    fireEvent.press(screen.getByText('DONE — NEXT'));
    expect(spoken().at(-1)).toEqual(['Rest. 30 seconds.', 'Next: Plank.']);
    act(() => useActiveWorkoutStore.getState().dismissRest());

    // Timed set: a get-ready countdown, then the timer starts on its own.
    act(() => jest.advanceTimersByTime(250));
    expect(screen.getByText('Get ready')).toBeTruthy();
    act(() => jest.advanceTimersByTime(3000));
    expect(spoken().at(-1)).toEqual(['Plank. 20 seconds.']);
    expect(
      useActiveWorkoutStore.getState().setTimerStartedAt['3']
    ).toBeDefined();
    expect(screen.queryByText('DONE — NEXT')).toBeNull();

    act(() => jest.advanceTimersByTime(10_000));
    expect(spoken().at(-1)).toEqual(['Halfway.']);

    // At zero the set logs its target duration and the workout completes.
    act(() => jest.advanceTimersByTime(10_250));
    const done = useActiveWorkoutStore.getState();
    expect(done.completedSetIds['3']).toBeDefined();
    expect(done.activeSetId).toBeNull();
    const plankSet = done.session?.exercises[1]?.sets[0];
    expect(plankSet?.duration).toBe(20);
    expect(spoken().at(-1)).toEqual(['Workout complete.']);
    expect(
      screen.getByText('All sets done. End the workout to save it.')
    ).toBeTruthy();
  });

  it('resumes a running timed set silently after a remount', () => {
    const store = useActiveWorkoutStore.getState();
    store.completeSet('1');
    store.dismissRest();
    useActiveWorkoutStore.getState().completeSet('2');
    useActiveWorkoutStore.getState().dismissRest();
    useActiveWorkoutStore.getState().startSetTimer('3');
    mockSpeak.mockClear();

    renderCard();
    act(() => jest.advanceTimersByTime(250));
    expect(mockSpeak).not.toHaveBeenCalled();
    expect(screen.getByText('Set 1 of 1')).toBeTruthy();
  });

  it("flips between an exercise's library images", () => {
    const session = makeSession();
    const snapshot = session.exercises[0]!.exercise_snapshot as unknown as {
      images: string[] | null;
    };
    snapshot.images = ['push_0.jpg', 'push_1.jpg'];
    __resetActiveWorkoutStoreForTests();
    useActiveWorkoutStore.getState().startWorkout(session);

    const getImageSource = jest.fn((path: string) => ({
      uri: path,
      headers: {},
    }));
    render(
      <ActiveWorkoutGuidedCard
        getImageSource={getImageSource}
        onCompleteSet={jest.fn()}
      />
    );
    expect(getImageSource).toHaveBeenLastCalledWith('push_0.jpg');
    act(() => jest.advanceTimersByTime(1000));
    expect(getImageSource).toHaveBeenLastCalledWith('push_1.jpg');
    act(() => jest.advanceTimersByTime(1000));
    expect(getImageSource).toHaveBeenLastCalledWith('push_0.jpg');
  });

  it('pause freezes the timed set and resume carries on from there', () => {
    const store = useActiveWorkoutStore.getState();
    store.completeSet('1');
    useActiveWorkoutStore.getState().dismissRest();
    useActiveWorkoutStore.getState().completeSet('2');
    useActiveWorkoutStore.getState().dismissRest();
    renderCard();

    // get-ready (3 s), then the 20 s plank starts.
    act(() => jest.advanceTimersByTime(250));
    act(() => jest.advanceTimersByTime(3000));
    act(() => jest.advanceTimersByTime(5000));
    expect(screen.getByText('Set 1 of 1')).toBeTruthy();

    mockStop.mockClear();
    fireEvent.press(screen.getByLabelText('Pause'));
    expect(mockStop).toHaveBeenCalled();
    expect(screen.getByText('Paused')).toBeTruthy();

    // A minute paused changes nothing.
    act(() => jest.advanceTimersByTime(60_000));
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(
      useActiveWorkoutStore.getState().completedSetIds['3']
    ).toBeUndefined();

    fireEvent.press(screen.getByLabelText('Resume'));
    act(() => jest.advanceTimersByTime(5000));
    expect(screen.getByText('Set 1 of 1')).toBeTruthy();
    act(() => jest.advanceTimersByTime(10_500));
    const done = useActiveWorkoutStore.getState();
    expect(done.completedSetIds['3']).toBeDefined();
    expect(done.session?.exercises[1]?.sets[0]?.duration).toBe(20);
  });

  it('pause also holds a running rest, and resume restarts it', () => {
    renderCard();
    act(() => jest.advanceTimersByTime(3250));
    fireEvent.press(screen.getByText('DONE — NEXT'));
    expect(useActiveWorkoutStore.getState().rest.state).toBe('resting');

    fireEvent.press(screen.getByLabelText('Pause'));
    expect(useActiveWorkoutStore.getState().rest.state).toBe('paused');
    fireEvent.press(screen.getByLabelText('Resume'));
    expect(useActiveWorkoutStore.getState().rest.state).toBe('resting');
  });

  it('mutes the voice for the workout but keeps the caption', async () => {
    const actual = jest.requireActual('../../src/services/speech');
    // Cues wait for the installed voices, so read them first.
    await jest
      .requireActual('../../src/services/speechVoice')
      .loadSpeechVoices();
    const { AppState } = require('react-native');
    Object.defineProperty(AppState, 'currentState', {
      get: () => 'active',
      configurable: true,
    });
    mockSpeak.mockImplementation((lines, options) =>
      actual.speakGuided(lines, options)
    );
    const Speech = require('expo-speech');
    Speech.speak.mockClear();

    renderCard();
    act(() => jest.advanceTimersByTime(250));
    expect(screen.getByTestId('guided-caption')).toHaveTextContent(
      'Get ready. Starting Push-up.'
    );
    expect(Speech.speak).toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Mute voice'));
    Speech.speak.mockClear();
    act(() => jest.advanceTimersByTime(3000));
    expect(Speech.speak).not.toHaveBeenCalled();
    expect(screen.getByTestId('guided-caption')).toHaveTextContent(
      'Push-up. 12 reps.'
    );
    // Instructions appear in the caption only, not as a list.
    expect(screen.queryByText('1. Keep your core firm.')).toBeNull();
    expect(screen.getByLabelText('Unmute voice')).toBeTruthy();
    mockSpeak.mockReset();
  });

  it('replays the current set and all its instructions', () => {
    renderCard();
    act(() => jest.advanceTimersByTime(3250));
    fireEvent.press(screen.getByText('DONE — NEXT'));
    act(() => useActiveWorkoutStore.getState().dismissRest());
    act(() => jest.advanceTimersByTime(250));
    expect(spoken().at(-1)).toEqual(['Push-up. 10 reps.']);

    fireEvent.press(screen.getByLabelText('Replay instructions'));
    expect(spoken().at(-1)).toEqual([
      'Push-up. 10 reps.',
      'Keep your core firm.',
      'Lower slowly.',
    ]);
  });

  it('stops speaking when unmounted', () => {
    const { unmount } = renderCard();
    unmount();
    expect(mockStop).toHaveBeenCalled();
  });
});
