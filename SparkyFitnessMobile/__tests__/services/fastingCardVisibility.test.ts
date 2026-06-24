import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, act } from '@testing-library/react-native';
import {
  initializeFastingCardVisibility,
  setFastingCardVisible,
  getFastingCardVisible,
  useFastingCardVisible,
  __resetFastingCardVisibilityForTests,
} from '../../src/services/fastingCardVisibility';

const STORAGE_KEY = '@HealthConnect:fastingCardVisible';

describe('fastingCardVisibility service', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetFastingCardVisibilityForTests();
  });

  it('defaults to visible when nothing is persisted', async () => {
    await initializeFastingCardVisibility();
    expect(getFastingCardVisible()).toBe(true);
  });

  it('restores the saved hidden value on init', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'false');
    await initializeFastingCardVisibility();
    expect(getFastingCardVisible()).toBe(false);
  });

  it('persists the value when toggled', async () => {
    await setFastingCardVisible(false);
    expect(getFastingCardVisible()).toBe(false);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('false');

    await setFastingCardVisible(true);
    expect(getFastingCardVisible()).toBe(true);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('notifies already-mounted hook subscribers when init loads from storage', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'false');

    const { result } = renderHook(() => useFastingCardVisible());
    expect(result.current).toBe(true); // default before init resolves

    await act(async () => {
      await initializeFastingCardVisibility();
    });
    expect(result.current).toBe(false);
  });

  it('does not let init overwrite an explicit user toggle made first', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'true');

    await setFastingCardVisible(false);
    await initializeFastingCardVisibility();

    expect(getFastingCardVisible()).toBe(false);
  });

  it('does not let init overwrite a user toggle that lands mid-flight', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'true');
    const initPromise = initializeFastingCardVisibility();

    await setFastingCardVisible(false);

    await initPromise;
    expect(getFastingCardVisible()).toBe(false);
  });
});
