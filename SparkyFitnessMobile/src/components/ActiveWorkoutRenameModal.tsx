import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View, type TextInput } from 'react-native';
import {
  KeyboardAvoidingView,
  KeyboardProvider,
} from 'react-native-keyboard-controller';
import Button from './ui/Button';
import SafeAreaModalBackdrop from './SafeAreaModalBackdrop';
import FormInput from './FormInput';

interface ActiveWorkoutRenameModalProps {
  visible: boolean;
  initialName: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}

/**
 * Centered modal prompt for renaming the live workout. Rendered here rather
 * than reaching for `Alert.prompt` because that is iOS-only; this works on both
 * platforms and matches the app's themed controls.
 */
export default function ActiveWorkoutRenameModal({
  visible,
  initialName,
  onCancel,
  onSubmit,
}: ActiveWorkoutRenameModalProps) {
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);
  const [value, setValue] = useState(initialName);
  // Re-seed the field to the current name each time the dialog opens.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setValue(initialName);
  }
  const trimmed = value.trim();
  const submit = () => {
    if (trimmed.length > 0) onSubmit(trimmed);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      onShow={() => inputRef.current?.focus()}
    >
      {/* A native Modal renders in its own window, so the root KeyboardProvider
          doesn't reach it; mount a local one so KeyboardAvoidingView tracks the
          keyboard on both platforms (RN's own KAV is a no-op on Android). */}
      <KeyboardProvider>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <SafeAreaModalBackdrop
            onPress={onCancel}
            accessibilityLabel={t('workout.dismissRename', {
              defaultValue: 'Dismiss rename',
            })}
          >
            {/* Absorb taps on the card so only the backdrop dismisses. */}
            <Pressable
              className="bg-surface rounded-2xl p-5"
              onPress={() => {}}
              accessible={false}
            >
              <Text className="text-lg font-semibold text-text-primary mb-3">
                {t('workout.renameWorkout', { defaultValue: 'Rename workout' })}
              </Text>
              <FormInput
                ref={inputRef}
                value={value}
                onChangeText={setValue}
                placeholder={t('workout.renamePlaceholder', {
                  defaultValue: 'Workout name',
                })}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={submit}
              />
              <View className="flex-row justify-end gap-2 mt-4">
                <Button variant="ghost" onPress={onCancel}>
                  {t('common.cancel', { defaultValue: 'Cancel' })}
                </Button>
                <Button
                  variant="primary"
                  onPress={submit}
                  disabled={trimmed.length === 0}
                >
                  {t('common.save', { defaultValue: 'Save' })}
                </Button>
              </View>
            </Pressable>
          </SafeAreaModalBackdrop>
        </KeyboardAvoidingView>
      </KeyboardProvider>
    </Modal>
  );
}
