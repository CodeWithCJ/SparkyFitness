import React, { useCallback, useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { FullWindowOverlay } from 'react-native-screens';
import { useUniwind } from 'uniwind';

// Render the sheet inside an iOS UIWindow so it sits above any native modal
// presentation. No-op on Android.
export const sheetContainer =
  Platform.OS === 'ios'
    ? ({ children }: React.PropsWithChildren) => (
        <FullWindowOverlay>{children}</FullWindowOverlay>
      )
    : undefined;

/**
 * The app's standard bottom-sheet backdrop: dimmed, tap-to-dismiss, darker in
 * dark themes. Pass the result to BottomSheetModal's `backdropComponent`.
 */
export function useSheetBackdrop() {
  const { theme } = useUniwind();
  const isDarkMode = theme === 'dark' || theme === 'amoled';

  return useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        opacity={isDarkMode ? 0.7 : 0.5}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    [isDarkMode]
  );
}

/**
 * Gives an open sheet Android's hardware Back. `BottomSheetModal` does not
 * handle it, so without this the press falls through to navigation with the
 * sheet still up: it pops the screen under the sheet, switches another tab to
 * the Dashboard, or exits the app from the Dashboard. `onBack` decides what
 * Back does inside the sheet.
 *
 * Owners set `isOpen` when the sheet opens, from both `onAnimate` and
 * `onChange` (the library drops `onAnimate` when the open finishes before it
 * reaches JS), and clear it in `onDismiss`.
 */
export function useSheetHardwareBack(isOpen: boolean, onBack: () => void) {
  useEffect(() => {
    if (!isOpen || Platform.OS !== 'android') return;
    // Registered while open (after any screen handlers), so the sheet wins
    // Back and the press can't fall through and pop the screen.
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onBack();
        return true;
      }
    );
    return () => subscription.remove();
  }, [isOpen, onBack]);
}
