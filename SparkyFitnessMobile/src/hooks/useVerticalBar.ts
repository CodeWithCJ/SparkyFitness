import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SideBarMetricsModule from '../../modules/side-bar-metrics';

const SETTLE_DELAYS_MS = [0, 300, 1200];

/**
 * Whether the system is presenting its tab bar and header buttons as a vertical
 * bar (iPhone Duo, iOS 27.1 SDK and later). Side safe-area insets alone do not
 * mean that: a notched iPhone in landscape has them and keeps horizontal bars.
 *
 * The answer comes from the system's own `verticalBarEdge` trait through the
 * `side-bar-metrics` module, re-read when the pose changes and again once the
 * layout has settled. Until the first reading, and in builds or tests without
 * the native module, side insets stand in for it.
 */
export function useVerticalBar(): boolean {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const insetGuess = Platform.OS === 'ios' && insets.left + insets.right > 0;
  const [measured, setMeasured] = useState<boolean | null>(null);

  useEffect(() => {
    const native = SideBarMetricsModule;
    if (native == null) return;
    let cancelled = false;
    const read = async () => {
      try {
        const edge = await native.verticalBarEdge();
        if (!cancelled && edge !== 'unknown') setMeasured(edge !== 'none');
      } catch {
        // Keep the last answer.
      }
    };
    const timers = SETTLE_DELAYS_MS.map((ms) => setTimeout(read, ms));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [insets.left, insets.right, width, height]);

  if (SideBarMetricsModule == null) return insetGuess;
  return measured ?? insetGuess;
}
