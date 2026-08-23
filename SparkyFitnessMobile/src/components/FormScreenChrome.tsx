import React, { useCallback, useRef } from 'react';
import { View, Platform } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader, SAVE_LABEL, type HeaderItem } from '../hooks/useScreenHeader';
import Button from './ui/Button';

interface FooterSaveBarProps {
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  label?: string;
}

/**
 * Presses closer together than this are treated as one. Comfortably longer
 * than the gap between taps replayed from a blocked JS thread, comfortably
 * shorter than a deliberate second save.
 */
const DUPLICATE_PRESS_WINDOW_MS = 700;

/**
 * Sticky footer save bar for form screens. Screens whose Save also lives in
 * the native header (placement: 'native-only') should render this behind a
 * {!usesNativeHeader && …} guard so the two never show together.
 */
export const FooterSaveBar: React.FC<FooterSaveBarProps> = ({
  onPress,
  disabled,
  busy,
  label = SAVE_LABEL,
}) => {
  const insets = useSafeAreaInsets();

  // Synchronous re-entrancy guard. `disabled`/`busy` are React state derived
  // from a mutation's isPending, and state does not commit until the next
  // render — so when the JS thread has been blocked and several queued taps
  // are delivered back to back, every one of them runs against the stale props
  // and fires the save again. That is how one Save press became half a dozen
  // identical food entries (#2191).
  //
  // Deliberately time-based rather than a latch released on `busy`: not every
  // save reports a pending state (some handlers are local and synchronous), and
  // a latch waiting on a `busy` that never arrives would leave the button dead.
  // A queued burst is delivered within a few milliseconds, so this only ever
  // swallows the duplicates.
  const lastPressAt = useRef(0);

  const handlePress = useCallback(() => {
    const now = Date.now();
    if (now - lastPressAt.current < DUPLICATE_PRESS_WINDOW_MS) return;
    lastPressAt.current = now;
    onPress();
  }, [onPress]);

  return (
    <View
      className="px-4 py-3 border-t border-border-subtle"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      <Button
        variant="primary"
        onPress={handlePress}
        disabled={disabled}
        loading={busy}
        className="py-3"
        textClassName="text-sm text-center"
      >
        {label}
      </Button>
    </View>
  );
};

interface FormScreenChromeProps {
  title: string;
  saveLabel: string;
  savingLabel: string;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
  /** Optional secondary header action rendered left of Save (e.g. a reorder icon). */
  headerAction?: HeaderItem | null;
  /**
   * Screen-level keyboard accessory (e.g. useSetEditAccessoryBar's bar),
   * rendered as a sibling of the scroll view so its sticky positioning works.
   */
  keyboardAccessory?: React.ReactNode;
  children: React.ReactNode;
}

const FormScreenChrome: React.FC<FormScreenChromeProps> = ({
  title,
  saveLabel,
  savingLabel,
  isSaving,
  onSave,
  onCancel,
  headerAction,
  keyboardAccessory,
  children,
}) => {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();

  const saveItem: HeaderItem = {
    kind: 'primary',
    label: saveLabel,
    busyLabel: savingLabel,
    busy: isSaving,
    disabled: isSaving,
    onPress: onSave,
  };
  const header = useScreenHeader({
    title,
    left: { kind: 'dismiss', onPress: onCancel, disabled: isSaving },
    right: headerAction ? [headerAction, saveItem] : saveItem,
  });

  return (
    <View
      className="flex-1 bg-background"
      // iOS keeps no top inset even without the native header: this chrome is
      // used by modal sheets, which already start below the status bar.
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      {header}

      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-4 pb-20 gap-4"
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : undefined}
        // Set-row taps remount the focused input; stop the keyboard-hide
        // restore scroll so the refocus lands on the tapped cell (see
        // ActiveWorkoutScreen's scroll view).
        disableScrollOnKeyboardHide
      >
        {children}
      </KeyboardAwareScrollView>

      {keyboardAccessory}
    </View>
  );
};

export default FormScreenChrome;
