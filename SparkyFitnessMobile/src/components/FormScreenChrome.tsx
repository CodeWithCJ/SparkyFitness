import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';

interface FormScreenChromeProps {
  title: string;
  saveLabel: string;
  savingLabel: string;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}

const FormScreenChrome: React.FC<FormScreenChromeProps> = ({
  title,
  saveLabel,
  savingLabel,
  isSaving,
  onSave,
  onCancel,
  children,
}) => {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();

  return (
    <View
      className="flex-1 bg-background"
      // iOS keeps no top inset even without the native header: this chrome is
      // used by modal sheets, which already start below the status bar.
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      {!usesNativeHeader && (
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-subtle">
          <TouchableOpacity
            onPress={onCancel}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            disabled={isSaving}
          >
            <Text className="text-base text-text-primary">Cancel</Text>
          </TouchableOpacity>
          <Text className="text-text-primary text-lg font-semibold">{title}</Text>
          <TouchableOpacity
            onPress={onSave}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            disabled={isSaving}
          >
            <Text
              className={`text-base font-semibold ${
                isSaving ? 'text-text-muted' : 'text-accent-primary'
              }`}
            >
              {isSaving ? savingLabel : saveLabel}
            </Text>
          </TouchableOpacity>
        </View>
      )}

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
