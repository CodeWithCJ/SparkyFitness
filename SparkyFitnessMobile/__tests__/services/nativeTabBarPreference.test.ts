import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initializeLiquidGlassTabBar,
  setLiquidGlassTabBarEnabled,
  getLiquidGlassTabBarEnabled,
  __resetLiquidGlassTabBarForTests,
} from '../../src/services/nativeTabBarPreference';

// Behavior is covered by booleanPreference.test.ts; this verifies the wrapper is
// wired to the right storage key and default.
const STORAGE_KEY = '@HealthConnect:liquidGlassTabBarEnabled';

describe('nativeTabBarPreference service', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetLiquidGlassTabBarForTests();
  });

  it('defaults to off when nothing is persisted', async () => {
    await initializeLiquidGlassTabBar();
    expect(getLiquidGlassTabBarEnabled()).toBe(false);
  });

  it('persists toggles under the liquid-glass storage key', async () => {
    await setLiquidGlassTabBarEnabled(true);
    expect(getLiquidGlassTabBarEnabled()).toBe(true);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('restores the saved enabled value on init', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'true');
    await initializeLiquidGlassTabBar();
    expect(getLiquidGlassTabBarEnabled()).toBe(true);
  });
});
