import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initializeHydrationCardVisibility,
  setHydrationCardVisible,
  getHydrationCardVisible,
  __resetHydrationCardVisibilityForTests,
} from '../../src/services/hydrationCardVisibility';

// Behavior is covered by booleanPreference.test.ts; this verifies the wrapper is
// wired to the right storage key and default.
const STORAGE_KEY = '@HealthConnect:hydrationCardVisible';

describe('hydrationCardVisibility service', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetHydrationCardVisibilityForTests();
  });

  it('defaults to visible when nothing is persisted', async () => {
    await initializeHydrationCardVisibility();
    expect(getHydrationCardVisible()).toBe(true);
  });

  it('persists toggles under the hydration storage key', async () => {
    await setHydrationCardVisible(false);
    expect(getHydrationCardVisible()).toBe(false);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('restores the saved hidden value on init', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'false');
    await initializeHydrationCardVisibility();
    expect(getHydrationCardVisible()).toBe(false);
  });
});
