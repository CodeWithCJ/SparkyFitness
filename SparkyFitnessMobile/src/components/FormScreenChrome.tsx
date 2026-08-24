import React, { useCallback, useRef } from 'react';
import { View, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createDuplicatePressGuard } from '../utils/duplicatePress';
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
 * Sticky footer save bar for form screens. Screens whose Save also lives in
 * the native header (placement: 'native-only') should render this behind a
 * {!usesNativeHeader && …} guard so the two never show together.
 */
export const FooterSaveBar: React.FC<FooterSaveBarProps> = ({
  onPress,
  disabled,
  busy,
  label,
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  // Localize the canonical SAVE_LABEL marker (and the default) so the sticky
  // footer button follows the active app language (PL "Zapisz"), not English.
  const resolvedLabel =
    label && label !== SAVE_LABEL ? label : t('common.save', 'Save');
  const resolvedBusyLabel = t('common.saving', 'Saving…');

  // Synchronous re-entrancy guard; see createDuplicatePressGuard for why the
  // `disabled`/`busy` props cannot do this job. The same guard covers the
  // header Save actions in useScreenHeader.
  const allowPress = useRef(createDuplicatePressGuard()).current;

  const handlePress = useCallback(() => {
    if (!allowPress('footer-save')) return;
    onPress();
  }, [allowPress, onPress]);

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
        {busy ? resolvedBusyLabel : resolvedLabel}
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
