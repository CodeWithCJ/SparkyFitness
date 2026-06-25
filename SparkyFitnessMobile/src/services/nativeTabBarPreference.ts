import { createBooleanPreference } from './booleanPreference';
import { shouldUseNativeIOSTabs } from '../utils/nativeTabs';

// Defaults to off so the iOS 26 liquid-glass tab bar is opt-in; everyone gets
// the proven fallback tab bar (and matching header chrome) until they enable it.
const liquidGlassTabBarPref = createBooleanPreference(
  '@HealthConnect:liquidGlassTabBarEnabled',
  false,
);

export const initializeLiquidGlassTabBar = liquidGlassTabBarPref.initialize;
export const setLiquidGlassTabBarEnabled = liquidGlassTabBarPref.set;
export const getLiquidGlassTabBarEnabled = liquidGlassTabBarPref.get;
export const useLiquidGlassTabBarEnabled = liquidGlassTabBarPref.use;

/** Test-only helper — resets module-level state. */
export const __resetLiquidGlassTabBarForTests = liquidGlassTabBarPref.__reset;

/**
 * Reactive "effective" flag for the native iOS tab bar: true only when the
 * device supports the iOS 26 glass APIs AND the user has enabled the toggle.
 * The preference hook must run every render, so it is hoisted out of the `&&`
 * to satisfy `react-hooks/rules-of-hooks`.
 */
export function useNativeIOSTabsActive(): boolean {
  const enabled = useLiquidGlassTabBarEnabled();
  return shouldUseNativeIOSTabs() && enabled;
}
