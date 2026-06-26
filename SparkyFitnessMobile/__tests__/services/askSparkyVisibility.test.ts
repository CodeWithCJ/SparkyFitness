import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initializeAskSparkyVisibility,
  setAskSparkyVisible,
  getAskSparkyVisible,
  __resetAskSparkyVisibilityForTests,
} from '../../src/services/askSparkyVisibility';

// Behavior is covered by booleanPreference.test.ts; this verifies the wrapper is
// wired to the right storage key and default.
const STORAGE_KEY = '@HealthConnect:askSparkyVisible';

describe('askSparkyVisibility service', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetAskSparkyVisibilityForTests();
  });

  it('defaults to visible when nothing is persisted', async () => {
    await initializeAskSparkyVisibility();
    expect(getAskSparkyVisible()).toBe(true);
  });

  it('persists toggles under the ask sparky storage key', async () => {
    await setAskSparkyVisible(false);
    expect(getAskSparkyVisible()).toBe(false);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('restores the saved hidden value on init', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'false');
    await initializeAskSparkyVisibility();
    expect(getAskSparkyVisible()).toBe(false);
  });
});
