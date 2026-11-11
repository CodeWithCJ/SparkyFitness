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

declare class SideBarMetricsModuleType extends NativeModule {
  measure(): Promise<SideBarMetrics | null>;
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

export default SideBarMetricsModule;
