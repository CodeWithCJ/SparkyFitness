import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initializeFastingCardVisibility,
  setFastingCardVisible,
  getFastingCardVisible,
  __resetFastingCardVisibilityForTests,
} from '../../src/services/fastingCardVisibility';

// Behavior is covered by booleanPreference.test.ts; this verifies the wrapper is
// wired to the right storage key and default.
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

  it('persists toggles under the fasting storage key', async () => {
    await setFastingCardVisible(false);
    expect(getFastingCardVisible()).toBe(false);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('restores the saved hidden value on init', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'false');
    await initializeFastingCardVisibility();
    expect(getFastingCardVisible()).toBe(false);
  });
});
