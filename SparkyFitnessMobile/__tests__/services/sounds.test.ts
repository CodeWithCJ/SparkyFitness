import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, act } from '@testing-library/react-native';
import {
  initializeSounds,
  setSoundsEnabled,
  getSoundsEnabled,
  useSoundsEnabled,
  __resetSoundsStateForTests,
} from '../../src/services/sounds';

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

  it('notifies already-mounted hook subscribers when initializeSounds loads from storage', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'false');

    const { result } = renderHook(() => useSoundsEnabled());
    expect(result.current).toBe(true); // default before init resolves

    await act(async () => {
      await initializeSounds();
    });
    expect(result.current).toBe(false);
  });

  it('does not let initializeSounds overwrite an explicit user toggle made first', async () => {
    // Storage has "true" from a previous session.
    await AsyncStorage.setItem(STORAGE_KEY, 'true');

    // User toggles off before initializeSounds gets a chance to run.
    await setSoundsEnabled(false);

    // Then initializeSounds finally runs.
    await initializeSounds();

    expect(getSoundsEnabled()).toBe(false);
  });
});
