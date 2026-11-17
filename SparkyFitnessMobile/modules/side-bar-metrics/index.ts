import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/** Screen-point measurements of the iPhone Duo side bar. Keys are omitted when not found. */
export interface SideBarMetrics {
  /** Top of the header's button column. */
  columnTop?: number;
  /** Current height of that column (it changes when the buttons collapse). */
  columnHeight?: number;
  /** Top of the native Add button above the tab pill. */
  addTop?: number;
}

/**
 * The edge of the system's vertical bar, `none` for horizontal bars,
 * `unsupported` on an OS without vertical bars, `unknown` if unreadable.
 */
export type VerticalBarEdge =
  'leading' | 'trailing' | 'none' | 'unsupported' | 'unknown';

/** A rect the system reserves for its own content, in window points. */
export interface OcclusionRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the native watcher reports whenever the status regions change. */
export interface OcclusionEvent {
  regions: OcclusionRegion[] | null;
  metrics: SideBarMetrics | null;
  /** Size of the window the readings were taken in, in points. */
  windowWidth: number;
  windowHeight: number;
}

type SideBarMetricsEvents = {
  onOcclusionChange: (event: OcclusionEvent) => void;
};

declare class SideBarMetricsModuleType extends NativeModule<SideBarMetricsEvents> {
  measure(): Promise<SideBarMetrics | null>;
  verticalBarEdge(): Promise<VerticalBarEdge>;
  /**
   * Regions UIKit reserves for status content, Live Activities included.
   * `null` before iOS 27.1 or when no window is up.
   */
  occlusionRegions(): Promise<OcclusionRegion[] | null>;
  /**
   * Dissolve the header's button column from its current look into whatever the
   * next header update makes of it. Call just before updating the header items.
   */
  crossfadeHeaderColumn(durationSeconds: number): void;
  /** Start / stop the native per-frame watch behind `onOcclusionChange`. */
  startWatching(): void;
  stopWatching(): void;
}

function loadSideBarMetrics(): SideBarMetricsModuleType | null {
  if (Platform.OS !== 'ios') return null;
  // Missing in a build from before this module and in tests with no native
  // runtime; callers treat null as "assume there is room".
  try {
    return requireOptionalNativeModule<SideBarMetricsModuleType>(
      'SideBarMetrics'
    );
  } catch {
    return null;
  }
}

const SideBarMetricsModule = loadSideBarMetrics();

/** Dissolve the date buttons into their next state (no-op without the module). */
export function crossfadeHeaderColumn(durationSeconds = 0.3): void {
  try {
    SideBarMetricsModule?.crossfadeHeaderColumn(durationSeconds);
  } catch {
    // Cosmetic only.
  }
}

/**
 * Call `listener` now and on every change of the status regions (a Live
 * Activity starting or ending, a fold, a rotation). Returns the unsubscribe
 * function. No-op without the native module.
 */
export function watchOcclusion(
  listener: (event: OcclusionEvent) => void
): () => void {
  const native = SideBarMetricsModule;
  if (native == null) return () => {};
  try {
    const subscription = native.addListener('onOcclusionChange', listener);
    native.startWatching();
    return () => {
      subscription.remove();
      try {
        native.stopWatching();
      } catch {
        // Already torn down.
      }
    };
  } catch {
    return () => {};
  }
}

export default SideBarMetricsModule;
