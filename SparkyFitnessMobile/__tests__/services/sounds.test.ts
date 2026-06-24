import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initializeSounds,
  setSoundsEnabled,
  getSoundsEnabled,
  __resetSoundsStateForTests,
} from '../../src/services/sounds';

// Behavior is covered by booleanPreference.test.ts; this verifies the wrapper is
// wired to the right storage key and default.
const STORAGE_KEY = '@HealthConnect:soundsEnabled';

describe('sounds service', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetSoundsStateForTests();
  });

  it('defaults to enabled when nothing is persisted', async () => {
    await initializeSounds();
    expect(getSoundsEnabled()).toBe(true);
  });

  it('persists toggles under the sounds storage key', async () => {
    await setSoundsEnabled(false);
    expect(getSoundsEnabled()).toBe(false);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('restores the saved disabled value on init', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'false');
    await initializeSounds();
    expect(getSoundsEnabled()).toBe(false);
  });
});
