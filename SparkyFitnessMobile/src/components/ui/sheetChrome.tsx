import React, { useCallback } from 'react';
import { Platform } from 'react-native';
import { BottomSheetBackdrop, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { FullWindowOverlay } from 'react-native-screens';
import { useUniwind } from 'uniwind';

// Render the sheet inside an iOS UIWindow so it sits above any native modal
// presentation. No-op on Android.
export const sheetContainer =
  Platform.OS === 'ios'
    ? ({ children }: React.PropsWithChildren) => <FullWindowOverlay>{children}</FullWindowOverlay>
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
    [isDarkMode],
  );
}
