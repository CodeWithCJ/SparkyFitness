import { Platform } from 'react-native';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { canUseLiquidGlass } from '../utils/liquidGlass';

/**
 * Reactive "effective" flag for the native iOS tab bar: true only when the
 * device supports the iOS 26 glass APIs AND the user has enabled the toggle.
 * The preference hook must run every render, so it is hoisted out of the `&&`
 * to satisfy `react-hooks/rules-of-hooks`.
 */
export function useNativeIOSTabsActive(): boolean {
  const enabled = useAppPreferencesStore((s) => s.liquidGlassTabBarEnabled);
  return canUseLiquidGlass() && enabled;
}

/**
 * Reactive "effective" flag for the native iOS stack headers. Unlike the tab
 * bar, native headers are not glass-only: iOS releases without the glass APIs
 * keep the classic native header, so the Liquid Glass toggle only matters on
 * iOS 26+, where turning it off swaps in the screen-owned fallback headers
 * (the same ones Android renders).
 */
export function useNativeIOSHeadersActive(): boolean {
  const enabled = useAppPreferencesStore((s) => s.liquidGlassTabBarEnabled);
  if (Platform.OS !== 'ios') return false;
  return !canUseLiquidGlass() || enabled;
}
