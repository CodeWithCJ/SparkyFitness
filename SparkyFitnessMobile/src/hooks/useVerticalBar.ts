import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SideBarMetricsModule from '../../modules/side-bar-metrics';

const SETTLE_DELAYS_MS = [0, 300, 1200];

/** Vertical bars arrived with iOS 27.1; earlier systems never show them. */
function osSupportsVerticalBars(): boolean {
  if (Platform.OS !== 'ios') return false;
  const [major = 0, minor = 0] = String(Platform.Version)
    .split('.')
    .map((part) => parseInt(part, 10) || 0);
  return major > 27 || (major === 27 && minor >= 1);
}

/**
 * Whether the system is presenting its tab bar and header buttons as a vertical
 * bar (iPhone Duo, iOS 27.1 and later). Side safe-area insets alone do not mean
 * that: a notched iPhone in landscape has them and keeps horizontal bars.
 *
 * The answer comes from the system's own `verticalBarEdge` trait through the
 * `side-bar-metrics` module, re-read when the pose changes and again once the
 * layout has settled. Before the first reading, and in builds or tests without
 * the native module, side insets stand in for it, but only on an OS that has
 * vertical bars at all: older iOS and other platforms are always `false`.
 */
function useVerticalBarState(): { guess: boolean; confirmed: boolean | null } {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const supported = osSupportsVerticalBars();
  const insetGuess = supported && insets.left + insets.right > 0;
  const [measured, setMeasured] = useState<boolean | null>(null);

  useEffect(() => {
    const native = SideBarMetricsModule;
    if (native == null || !supported) return;
    let cancelled = false;
    const read = async () => {
      try {
        const edge = await native.verticalBarEdge();
        if (cancelled || edge === 'unknown') return;
        setMeasured(edge !== 'none' && edge !== 'unsupported');
      } catch {
        // Keep the last answer.
      }
    };
    const timers = SETTLE_DELAYS_MS.map((ms) => setTimeout(read, ms));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [supported, insets.left, insets.right, width, height]);

  if (!supported) return { guess: false, confirmed: false };
  if (SideBarMetricsModule == null)
    return { guess: insetGuess, confirmed: null };
  return { guess: measured ?? insetGuess, confirmed: measured };
}

/**
 * Best current answer, for layout that is cheap to correct a moment later
 * (spacing, rails, button placement): the native reading once there is one,
 * the side-inset guess until then.
 */
export function useVerticalBar(): boolean {
  return useVerticalBarState().guess;
}

/**
 * Only a confirmed native reading counts, never the inset guess. Use it for
 * anything that removes a control: while the system has not said (module
 * missing, trait unreadable, first reading still pending) this is `false`, so
 * the control stays visible.
 */
export function useConfirmedVerticalBar(): boolean {
  return useVerticalBarState().confirmed === true;
}
