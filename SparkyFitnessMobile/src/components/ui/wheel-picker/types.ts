/**
 * Vendored wheel-picker component from react-native-ui-datepicker
 * Original source: https://github.com/farhoudshapouran/react-native-ui-datepicker
 * License: MIT
 * 
 * This component is vendored to:
 * 1. Allow Jest to resolve the internal module structure
 * 2. Apply iOS bug fix: prevent over-scrolling animation when value wraps (59->00)
 */

export interface PickerOption {
  value: number | string;
  text: string;
}
