import { AppState } from 'react-native';
import * as Speech from 'expo-speech';
import { act, renderHook } from '@testing-library/react-native';
import {
  __resetSpeechForTests,
  resetGuidedSpeechSession,
  setGuidedSpeechMuted,
  useGuidedCaption,
  useGuidedSpeechMuted,
  listGuidedVoices,
  speakGuided,
  stopGuidedSpeech,
} from '../../src/services/speech';
import {
  __resetSpeechVoicesForTests,
  loadSpeechVoices,
} from '../../src/services/speechVoice';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockSpeak = Speech.speak as jest.MockedFunction<typeof Speech.speak>;
const mockStop = Speech.stop as jest.MockedFunction<typeof Speech.stop>;
const mockVoices = Speech.getAvailableVoicesAsync as jest.MockedFunction<
  typeof Speech.getAvailableVoicesAsync
>;

/** Reads an empty voice list so speech dispatches synchronously. */
async function voicesReady(): Promise<void> {
  mockVoices.mockResolvedValue([]);
  await loadSpeechVoices();
}

function setAppState(state: string): void {
  Object.defineProperty(AppState, 'currentState', {
    get: () => state,
    configurable: true,
  });
}

describe('speech service', () => {
  beforeEach(() => {
    __resetAppPreferencesStoreForTests();
    __resetSpeechForTests();
    __resetSpeechVoicesForTests();
    mockSpeak.mockClear();
    mockStop.mockClear();
    mockVoices.mockReset();
    setAppState('active');
  });

  it('stays silent while guided mode is off (the default)', () => {
    speakGuided(['Push-up. 12 reps.']);
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('speaks each line with the chosen voice and rate on the app audio session', async () => {
    mockVoices.mockResolvedValue([
      {
        identifier: 'voice-1',
        name: 'One',
        language: 'en-US',
        quality: 'Default',
      },
    ] as Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>>);
    await loadSpeechVoices(true);
    useAppPreferencesStore.setState({
      guidedWorkoutEnabled: true,
      guidedVoiceId: 'voice-1',
      guidedSpeechRate: 1.25,
    });
    speakGuided(['Push-up. 12 reps.', 'Keep your core firm.'], {
      language: 'en',
    });
    expect(mockSpeak).toHaveBeenCalledTimes(2);
    expect(mockSpeak).toHaveBeenNthCalledWith(
      1,
      'Push-up. 12 reps.',
      expect.objectContaining({
        voice: 'voice-1',
        rate: 1.25,
        language: 'en',
        useApplicationAudioSession: true,
      })
    );
  });

  it('cancels what is still being read when interrupting', async () => {
    await voicesReady();
    useAppPreferencesStore.setState({ guidedWorkoutEnabled: true });
    speakGuided(['Rest. 60 seconds.'], { interrupt: true });
    expect(mockStop).toHaveBeenCalled();
    expect(mockSpeak).toHaveBeenCalledTimes(1);
  });

  it('never speaks from the background, where it would land late', () => {
    useAppPreferencesStore.setState({ guidedWorkoutEnabled: true });
    setAppState('background');
    speakGuided(['Halfway.']);
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('drops cues instead of queueing deeply', async () => {
    await voicesReady();
    useAppPreferencesStore.setState({ guidedWorkoutEnabled: true });
    speakGuided(Array.from({ length: 30 }, (_, i) => `line ${i}`));
    expect(mockSpeak).toHaveBeenCalledTimes(20);
    stopGuidedSpeech();
    speakGuided(['after stop']);
    expect(mockSpeak).toHaveBeenCalledTimes(21);
  });

  it('frees queue slots as utterances finish', async () => {
    await voicesReady();
    useAppPreferencesStore.setState({ guidedWorkoutEnabled: true });
    speakGuided(Array.from({ length: 20 }, (_, i) => `line ${i}`));
    const firstOptions = mockSpeak.mock.calls[0]?.[1];
    firstOptions?.onDone?.();
    speakGuided(['one more']);
    expect(mockSpeak).toHaveBeenCalledTimes(21);
  });

  it('holds the first cue until the voices are read, then uses the pick', async () => {
    useAppPreferencesStore.setState({
      guidedWorkoutEnabled: true,
      guidedVoiceId: 'voice-1',
    });
    mockVoices.mockResolvedValue([
      {
        identifier: 'voice-1',
        name: 'One',
        language: 'en-US',
        quality: 'Enhanced',
      },
    ] as Speech.Voice[]);
    speakGuided(['Push-up. 12 reps.'], { language: 'en-US' });
    expect(mockSpeak).not.toHaveBeenCalled();
    await loadSpeechVoices();
    await Promise.resolve();
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    expect(mockSpeak.mock.calls[0]?.[1]).toMatchObject({ voice: 'voice-1' });
  });

  it('drops a cue still waiting for the voices when narration is stopped', async () => {
    useAppPreferencesStore.setState({ guidedWorkoutEnabled: true });
    mockVoices.mockResolvedValue([]);
    speakGuided(['Push-up. 12 reps.']);
    stopGuidedSpeech();
    await loadSpeechVoices();
    await Promise.resolve();
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('lists voices sorted by language, then name', async () => {
    mockVoices.mockResolvedValue([
      { identifier: 'b', name: 'Zed', language: 'en-US', quality: 'Default' },
      { identifier: 'c', name: 'Anna', language: 'de-DE', quality: 'Default' },
      { identifier: 'a', name: 'Amy', language: 'en-US', quality: 'Default' },
    ] as Speech.Voice[]);
    await expect(listGuidedVoices()).resolves.toEqual([
      { identifier: 'c', name: 'Anna', language: 'de-DE' },
      { identifier: 'a', name: 'Amy', language: 'en-US' },
      { identifier: 'b', name: 'Zed', language: 'en-US' },
    ]);
  });

  it('returns no voices when the engine fails', async () => {
    mockVoices.mockRejectedValue(new Error('no tts'));
    await expect(listGuidedVoices()).resolves.toEqual([]);
  });

  describe('session mute and captions', () => {
    beforeEach(() => {
      useAppPreferencesStore.setState({ guidedWorkoutEnabled: true });
    });

    it('captions the first line, then each line as it starts', async () => {
      await voicesReady();
      const { result } = renderHook(() => useGuidedCaption());
      act(() =>
        speakGuided(['Push-up. 12 reps.', 'Brace.'], { interrupt: true })
      );
      expect(result.current).toBe('Push-up. 12 reps.');
      act(() => mockSpeak.mock.calls[1]?.[1]?.onStart?.());
      expect(result.current).toBe('Brace.');
    });

    it('stays silent while muted but keeps captioning', () => {
      const caption = renderHook(() => useGuidedCaption());
      const muted = renderHook(() => useGuidedSpeechMuted());
      act(() => setGuidedSpeechMuted(true));
      expect(muted.result.current).toBe(true);
      expect(mockStop).toHaveBeenCalled();
      act(() => speakGuided(['Rest. 30 seconds.'], { interrupt: true }));
      expect(mockSpeak).not.toHaveBeenCalled();
      expect(caption.result.current).toBe('Rest. 30 seconds.');
    });

    it('resets mute and caption when the guided view goes away', () => {
      const caption = renderHook(() => useGuidedCaption());
      const muted = renderHook(() => useGuidedSpeechMuted());
      act(() => {
        setGuidedSpeechMuted(true);
        speakGuided(['Halfway.']);
        resetGuidedSpeechSession();
      });
      expect(muted.result.current).toBe(false);
      expect(caption.result.current).toBeNull();
    });
  });
});
