import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import BottomSheetPicker from '../components/BottomSheetPicker';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import { useCreateExercise } from '../hooks';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import type { RootStackScreenProps } from '../types/navigation';

const CATEGORY_OPTIONS = [
  { label: 'General', value: 'general' },
  { label: 'Strength', value: 'strength' },
  { label: 'Cardio', value: 'cardio' },
  { label: 'Yoga', value: 'yoga' },
  { label: 'Powerlifting', value: 'powerlifting' },
  { label: 'Olympic Weightlifting', value: 'olympic weightlifting' },
  { label: 'Strongman', value: 'strongman' },
  { label: 'Plyometrics', value: 'plyometrics' },
  { label: 'Stretching', value: 'stretching' },
  { label: 'Isometric', value: 'isometric' },
] as const;

type ExerciseCategory = typeof CATEGORY_OPTIONS[number]['value'];

type ExerciseFormScreenProps = RootStackScreenProps<'ExerciseForm'>;

const ExerciseFormScreen: React.FC<ExerciseFormScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const textMuted = useCSSVariable('--color-text-muted') as string;

  const [name, setName] = useState('');
  const [category, setCategory] = useState<ExerciseCategory>('general');
  const [caloriesPerHourText, setCaloriesPerHourText] = useState('');
  const [description, setDescription] = useState('');

  const { createExerciseAsync, isPending } = useCreateExercise();

  const selectedCategoryLabel =
    CATEGORY_OPTIONS.find((opt) => opt.value === category)?.label ?? null;

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Toast.show({ type: 'error', text1: 'Missing name', text2: 'Please enter an exercise name.' });
      return;
    }

    let parsedCalories: number | undefined;
    const trimmedCaloriesText = caloriesPerHourText.trim();
    if (trimmedCaloriesText.length > 0) {
      const parsed = parseDecimalInput(trimmedCaloriesText);
      if (Number.isNaN(parsed)) {
        Toast.show({
          type: 'error',
          text1: 'Invalid calories per hour',
          text2: 'Please enter a valid number.',
        });
        return;
      }
      parsedCalories = parsed;
    }

    const trimmedDescription = description.trim();

    try {
      const created = await createExerciseAsync({
        name: trimmedName,
        category,
        ...(parsedCalories !== undefined ? { calories_per_hour: parsedCalories } : {}),
        description: trimmedDescription.length > 0 ? trimmedDescription : null,
      });
      Toast.show({ type: 'success', text1: 'Exercise created' });
      navigation.replace('ExerciseDetail', { item: created });
    } catch {
      // Error toast handled in useCreateExercise.
    }
  };

  return (
    <View
      className="flex-1 bg-background"
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={isPending}
        >
          <Text className="text-base text-accent-primary">Cancel</Text>
        </TouchableOpacity>
        <Text className="text-text-primary text-lg font-semibold">New Exercise</Text>
        <TouchableOpacity
          onPress={() => {
            void handleSave();
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={isPending}
        >
          <Text className={`text-base font-semibold ${isPending ? 'text-text-muted' : 'text-accent-primary'}`}>
            {isPending ? 'Saving…' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-4 pt-4 pb-20 gap-4"
          keyboardShouldPersistTaps="handled"
        >
          <View className="bg-surface rounded-xl p-4 gap-4 shadow-sm">
            <View className="gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">Name *</Text>
              <FormInput
                placeholder="e.g. Bulgarian Split Squat"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoCorrect={false}
                autoFocus
                returnKeyType="next"
              />
            </View>

            <View className="gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">Category</Text>
              <BottomSheetPicker<ExerciseCategory>
                value={category}
                options={CATEGORY_OPTIONS.map((opt) => ({ label: opt.label, value: opt.value }))}
                onSelect={setCategory}
                title="Select Category"
                renderTrigger={({ onPress }) => (
                  <TouchableOpacity
                    onPress={onPress}
                    activeOpacity={0.7}
                    className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 flex-row items-center justify-between"
                    style={{ height: 44 }}
                  >
                    <Text className="text-text-primary" style={{ fontSize: 16 }}>
                      {selectedCategoryLabel}
                    </Text>
                    <Icon name="chevron-down" size={16} color={textMuted} />
                  </TouchableOpacity>
                )}
              />
            </View>

            <View className="gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">
                Calories per Hour
              </Text>
              <FormInput
                placeholder="0"
                value={caloriesPerHourText}
                onChangeText={(v) => {
                  if (DECIMAL_INPUT_REGEX.test(v)) setCaloriesPerHourText(v);
                }}
                keyboardType="decimal-pad"
                returnKeyType="next"
              />
            </View>

            <View className="gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">Description</Text>
              <FormInput
                placeholder="Optional notes about the exercise"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                style={{ minHeight: 96, textAlignVertical: 'top' }}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default ExerciseFormScreen;
