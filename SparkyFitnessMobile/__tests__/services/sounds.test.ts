import { AppState } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import {
  __resetSoundsForTests,
  isRestTimerSoundEnabled,
  playRestCompleteSound,
} from '../../src/services/sounds';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';

const mockCreatePlayer = createAudioPlayer as jest.MockedFunction<typeof createAudioPlayer>;
const mockSetAudioMode = setAudioModeAsync as jest.MockedFunction<typeof setAudioModeAsync>;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setAppState(state: string): void {
  Object.defineProperty(AppState, 'currentState', {
    get: () => state,
    configurable: true,
  });
}

describe('sounds service', () => {
  beforeEach(() => {
    __resetAppPreferencesStoreForTests();
    __resetSoundsForTests();
    mockCreatePlayer.mockClear();
    mockSetAudioMode.mockClear();
    setAppState('active');
  });

  describe('isRestTimerSoundEnabled', () => {
    it('follows the restTimerSoundEnabled preference', () => {
      expect(isRestTimerSoundEnabled()).toBe(true);
      useAppPreferencesStore.getState().setRestTimerSoundEnabled(false);
      expect(isRestTimerSoundEnabled()).toBe(false);
    });

    it('is independent of the camera-shutter soundsEnabled preference', () => {
      useAppPreferencesStore.getState().setSoundsEnabled(false);
      expect(isRestTimerSoundEnabled()).toBe(true);
    });
  });

  describe('playRestCompleteSound', () => {
    it('configures a mix-with-others, silent-switch-respecting audio mode once', async () => {
      playRestCompleteSound();
      await flush();
      playRestCompleteSound();
      await flush();
      expect(mockSetAudioMode).toHaveBeenCalledTimes(1);
      expect(mockSetAudioMode).toHaveBeenCalledWith({
        playsInSilentMode: false,
        interruptionMode: 'mixWithOthers',
      });
    });

    it('creates the player once and replays from the start on later calls', async () => {
      playRestCompleteSound();
      await flush();
      playRestCompleteSound();
      await flush();
      expect(mockCreatePlayer).toHaveBeenCalledTimes(1);
      const player = mockCreatePlayer.mock.results[0].value;
      expect(player.seekTo).toHaveBeenCalledTimes(2);
      expect(player.seekTo).toHaveBeenCalledWith(0);
      expect(player.play).toHaveBeenCalledTimes(2);
    });

    it('does nothing when the preference is off', async () => {
      useAppPreferencesStore.getState().setRestTimerSoundEnabled(false);
      playRestCompleteSound();
      await flush();
      expect(mockCreatePlayer).not.toHaveBeenCalled();
    });

    it('does nothing when the app is not in the foreground', async () => {
      setAppState('background');
      playRestCompleteSound();
      await flush();
      expect(mockCreatePlayer).not.toHaveBeenCalled();
    });

    it('still plays and retries configuration when the audio mode call fails', async () => {
      mockSetAudioMode.mockRejectedValueOnce(new Error('impossible audio mode'));
      playRestCompleteSound();
      await flush();
      const player = mockCreatePlayer.mock.results[0].value;
      expect(player.play).toHaveBeenCalledTimes(1);
      playRestCompleteSound();
      await flush();
      expect(mockSetAudioMode).toHaveBeenCalledTimes(2);
      expect(player.play).toHaveBeenCalledTimes(2);
    });

    it('swallows playback errors', async () => {
      mockCreatePlayer.mockReturnValueOnce({
        play: jest.fn(),
        pause: jest.fn(),
        seekTo: jest.fn().mockRejectedValue(new Error('boom')),
        remove: jest.fn(),
      } as never);
      expect(() => playRestCompleteSound()).not.toThrow();
      await flush();
    });
  });
});
