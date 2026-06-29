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
