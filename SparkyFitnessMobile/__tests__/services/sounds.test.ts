import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initializeSounds,
  setSoundsEnabled,
  getSoundsEnabled,
} from '../../src/services/sounds';

const STORAGE_KEY = '@HealthConnect:soundsEnabled';

describe('sounds service', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    // Reset module-level state to default (enabled) before each test.
    await setSoundsEnabled(true);
    await AsyncStorage.clear();
  });

  it('defaults to enabled when nothing is persisted', async () => {
    await initializeSounds();
    expect(getSoundsEnabled()).toBe(true);
  });

  it('restores the saved disabled value on init', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'false');
    await initializeSounds();
    expect(getSoundsEnabled()).toBe(false);
  });

  it('persists the value when toggled', async () => {
    await setSoundsEnabled(false);
    expect(getSoundsEnabled()).toBe(false);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('false');

    await setSoundsEnabled(true);
    expect(getSoundsEnabled()).toBe(true);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('true');
  });
});
