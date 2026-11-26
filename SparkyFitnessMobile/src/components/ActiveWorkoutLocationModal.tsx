import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  type TextInputInstance,
} from 'react-native';
import {
  KeyboardAvoidingView,
  KeyboardProvider,
} from 'react-native-keyboard-controller';
import Button from './ui/Button';
import SafeAreaModalBackdrop from './SafeAreaModalBackdrop';
import FormInput from './FormInput';
import { WORKOUT_LOCATION_MAX_LENGTH } from '@workspace/shared';
import { useWorkoutLocations } from '../hooks/useWorkoutLocations';

interface ActiveWorkoutLocationModalProps {
  visible: boolean;
  initialLocation?: string | null;
  onCancel: () => void;
  onSubmit: (location: string | null) => void;
}

/**
 * Centered modal prompt for setting the gym/location of a live workout.
 * Features free-text entry plus autocomplete chips from previously logged locations.
 */
export default function ActiveWorkoutLocationModal({
  visible,
  initialLocation,
  onCancel,
  onSubmit,
}: ActiveWorkoutLocationModalProps) {
  const { t } = useTranslation();
  const inputRef = useRef<TextInputInstance>(null);
  const [value, setValue] = useState(initialLocation ?? '');
  const suggestions = useWorkoutLocations({ enabled: visible });

  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setValue(initialLocation ?? '');
  }

  const trimmed = value.trim();
  const submit = () => {
    onSubmit(trimmed.length > 0 ? trimmed : null);
  };

  const handleClear = () => {
    onSubmit(null);
  };

  const filteredSuggestions = suggestions.filter((loc) =>
    trimmed
      ? loc.toLowerCase().includes(trimmed.toLowerCase()) &&
        loc.toLowerCase() !== trimmed.toLowerCase()
      : true
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      onShow={() => inputRef.current?.focus()}
    >
      <KeyboardProvider>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <SafeAreaModalBackdrop
            onPress={onCancel}
            accessibilityLabel={t('workout.dismissLocation', {
              defaultValue: 'Dismiss location',
            })}
          >
            <Pressable
              className="bg-surface rounded-2xl p-5"
              onPress={() => {}}
              accessible={false}
            >
              <Text className="text-lg font-semibold text-text-primary mb-1">
                {t('workout.gymLocation', { defaultValue: 'Gym / Location' })}
              </Text>
              <Text className="text-xs text-text-muted mb-3">
                {t('workout.gymLocationDesc', {
                  defaultValue:
                    'Tag this workout with your current gym or training facility',
                })}
              </Text>

              <FormInput
                ref={inputRef}
                value={value}
                onChangeText={setValue}
                placeholder={t('workout.locationPlaceholder', {
                  defaultValue: 'e.g. Planet Fitness - Downtown',
                })}
                maxLength={WORKOUT_LOCATION_MAX_LENGTH}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={submit}
              />

              {filteredSuggestions.length > 0 && (
                <View className="mt-3">
                  <Text className="text-xs font-medium text-text-muted mb-1.5">
                    {t('workout.recentLocations', {
                      defaultValue: 'Recent Locations',
                    })}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerClassName="gap-2 py-1"
                  >
                    {filteredSuggestions.slice(0, 5).map((loc) => (
                      <Pressable
                        key={loc}
                        onPress={() => setValue(loc)}
                        className="bg-surface-elevated border border-border rounded-full px-3 py-1.5 active:opacity-70"
                      >
                        <Text className="text-xs text-text-primary">{loc}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View className="flex-row justify-between items-center mt-5">
                {initialLocation ? (
                  <Button variant="ghost" onPress={handleClear}>
                    {t('common.clear', { defaultValue: 'Clear' })}
                  </Button>
                ) : (
                  <View />
                )}

                <View className="flex-row gap-2">
                  <Button variant="ghost" onPress={onCancel}>
                    {t('common.cancel', { defaultValue: 'Cancel' })}
                  </Button>
                  <Button variant="primary" onPress={submit}>
                    {t('common.save', { defaultValue: 'Save' })}
                  </Button>
                </View>
              </View>
            </Pressable>
          </SafeAreaModalBackdrop>
        </KeyboardAvoidingView>
      </KeyboardProvider>
    </Modal>
  );
}
