import React from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader, type HeaderItem } from '../hooks/useScreenHeader';

interface FormScreenChromeProps {
  title: string;
  saveLabel: string;
  savingLabel: string;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
  /** Optional secondary header action rendered left of Save (e.g. a reorder icon). */
  headerAction?: HeaderItem | null;
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

      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-4 pt-4 pb-20 gap-4"
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : undefined}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default FormScreenChrome;
