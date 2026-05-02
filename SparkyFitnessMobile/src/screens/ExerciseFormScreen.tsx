import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import BottomSheetPicker from '../components/BottomSheetPicker';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import { useCreateExercise, useUpdateExercise } from '../hooks';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import type { Exercise } from '../types/exercise';
import type {
  RootStackParamList,
  RootStackScreenProps,
} from '../types/navigation';
import type { UpdateExercisePayload } from '../services/api/exerciseApi';

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

const LEVEL_OPTIONS = [
  { label: 'Beginner', value: 'beginner' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Expert', value: 'expert' },
] as const;

const FORCE_OPTIONS = [
  { label: 'Pull', value: 'pull' },
  { label: 'Push', value: 'push' },
  { label: 'Static', value: 'static' },
] as const;

const MECHANIC_OPTIONS = [
  { label: 'Compound', value: 'compound' },
  { label: 'Isolation', value: 'isolation' },
] as const;

type EditParams = Extract<RootStackParamList['ExerciseForm'], { mode: 'edit-exercise' }>;

type ExerciseFormScreenProps = RootStackScreenProps<'ExerciseForm'>;
type Navigation = ExerciseFormScreenProps['navigation'];

const splitCsvList = (s: string): string[] =>
  Array.from(new Set(s.split(',').map((v) => v.trim()).filter(Boolean)));

const joinCsvList = (xs?: string[] | null): string => (xs ?? []).join(', ');

const splitLines = (s: string): string[] =>
  s.split('\n').map((v) => v.trim()).filter(Boolean);

const joinLines = (xs?: string[] | null): string => (xs ?? []).join('\n');

const titleCase = (value: string): string =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

interface ExerciseFormState {
  name: string;
  category: string | null;
  caloriesPerHourText: string;
  description: string;
  equipment: string;
  primaryMuscles: string;
  secondaryMuscles: string;
  instructions: string;
  level: string | null;
  force: string | null;
  mechanic: string | null;
}

interface ExerciseFormBodyProps {
  state: ExerciseFormState;
  setState: React.Dispatch<React.SetStateAction<ExerciseFormState>>;
  showCategory: boolean;
}

const labelForOption = (
  options: readonly { label: string; value: string }[],
  value: string | null,
): string => {
  if (!value) return 'Select…';
  const match = options.find((opt) => opt.value === value);
  return match ? match.label : titleCase(value);
};

const ExerciseFormBody: React.FC<ExerciseFormBodyProps> = ({
  state,
  setState,
  showCategory,
}) => {
  const textMuted = useCSSVariable('--color-text-muted') as string;

  const categoryOptions = useMemo(() => {
    if (
      state.category &&
      !CATEGORY_OPTIONS.some((opt) => opt.value === state.category)
    ) {
      return [
        ...CATEGORY_OPTIONS.map((opt) => ({ label: opt.label, value: opt.value })),
        { label: titleCase(state.category), value: state.category },
      ];
    }
    return CATEGORY_OPTIONS.map((opt) => ({ label: opt.label, value: opt.value }));
  }, [state.category]);

  return (
    <View className="bg-surface rounded-xl p-4 gap-4 shadow-sm">
      <View className="gap-1.5">
        <Text className="text-text-secondary text-sm font-medium">Name *</Text>
        <FormInput
          placeholder="e.g. Bulgarian Split Squat"
          value={state.name}
          onChangeText={(name) => setState((prev) => ({ ...prev, name }))}
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          returnKeyType="next"
        />
      </View>

      {showCategory ? (
        <View className="gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">Category</Text>
          <BottomSheetPicker<string>
            value={state.category ?? 'general'}
            options={categoryOptions}
            onSelect={(category) => setState((prev) => ({ ...prev, category }))}
            title="Select Category"
            renderTrigger={({ onPress }) => (
              <TouchableOpacity
                onPress={onPress}
                activeOpacity={0.7}
                className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 flex-row items-center justify-between"
                style={{ height: 44 }}
              >
                <Text className="text-text-primary" style={{ fontSize: 16 }}>
                  {labelForOption(categoryOptions, state.category)}
                </Text>
                <Icon name="chevron-down" size={16} color={textMuted} />
              </TouchableOpacity>
            )}
          />
        </View>
      ) : null}

      <View className="gap-1.5">
        <Text className="text-text-secondary text-sm font-medium">
          Calories per Hour
        </Text>
        <FormInput
          placeholder="0"
          value={state.caloriesPerHourText}
          onChangeText={(v) => {
            if (DECIMAL_INPUT_REGEX.test(v)) {
              setState((prev) => ({ ...prev, caloriesPerHourText: v }));
            }
          }}
          keyboardType="decimal-pad"
          returnKeyType="next"
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-text-secondary text-sm font-medium">Equipment</Text>
        <FormInput
          placeholder="Comma-separated (e.g. dumbbell, bench)"
          value={state.equipment}
          onChangeText={(equipment) => setState((prev) => ({ ...prev, equipment }))}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-text-secondary text-sm font-medium">
          Primary muscles
        </Text>
        <FormInput
          placeholder="Comma-separated (e.g. quadriceps, glutes)"
          value={state.primaryMuscles}
          onChangeText={(primaryMuscles) =>
            setState((prev) => ({ ...prev, primaryMuscles }))
          }
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-text-secondary text-sm font-medium">
          Secondary muscles
        </Text>
        <FormInput
          placeholder="Comma-separated"
          value={state.secondaryMuscles}
          onChangeText={(secondaryMuscles) =>
            setState((prev) => ({ ...prev, secondaryMuscles }))
          }
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-text-secondary text-sm font-medium">
          Instructions
        </Text>
        <FormInput
          placeholder="One step per line"
          value={state.instructions}
          onChangeText={(instructions) =>
            setState((prev) => ({ ...prev, instructions }))
          }
          multiline
          numberOfLines={6}
          style={{ minHeight: 120, textAlignVertical: 'top' }}
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-text-secondary text-sm font-medium">Level</Text>
        <BottomSheetPicker<string>
          value={state.level ?? ''}
          options={LEVEL_OPTIONS.map((opt) => ({ label: opt.label, value: opt.value }))}
          onSelect={(level) => setState((prev) => ({ ...prev, level }))}
          title="Select Level"
          renderTrigger={({ onPress }) => (
            <TouchableOpacity
              onPress={onPress}
              activeOpacity={0.7}
              className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 flex-row items-center justify-between"
              style={{ height: 44 }}
            >
              <Text className="text-text-primary" style={{ fontSize: 16 }}>
                {labelForOption(LEVEL_OPTIONS, state.level)}
              </Text>
              <Icon name="chevron-down" size={16} color={textMuted} />
            </TouchableOpacity>
          )}
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-text-secondary text-sm font-medium">Force</Text>
        <BottomSheetPicker<string>
          value={state.force ?? ''}
          options={FORCE_OPTIONS.map((opt) => ({ label: opt.label, value: opt.value }))}
          onSelect={(force) => setState((prev) => ({ ...prev, force }))}
          title="Select Force"
          renderTrigger={({ onPress }) => (
            <TouchableOpacity
              onPress={onPress}
              activeOpacity={0.7}
              className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 flex-row items-center justify-between"
              style={{ height: 44 }}
            >
              <Text className="text-text-primary" style={{ fontSize: 16 }}>
                {labelForOption(FORCE_OPTIONS, state.force)}
              </Text>
              <Icon name="chevron-down" size={16} color={textMuted} />
            </TouchableOpacity>
          )}
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-text-secondary text-sm font-medium">Mechanic</Text>
        <BottomSheetPicker<string>
          value={state.mechanic ?? ''}
          options={MECHANIC_OPTIONS.map((opt) => ({ label: opt.label, value: opt.value }))}
          onSelect={(mechanic) => setState((prev) => ({ ...prev, mechanic }))}
          title="Select Mechanic"
          renderTrigger={({ onPress }) => (
            <TouchableOpacity
              onPress={onPress}
              activeOpacity={0.7}
              className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 flex-row items-center justify-between"
              style={{ height: 44 }}
            >
              <Text className="text-text-primary" style={{ fontSize: 16 }}>
                {labelForOption(MECHANIC_OPTIONS, state.mechanic)}
              </Text>
              <Icon name="chevron-down" size={16} color={textMuted} />
            </TouchableOpacity>
          )}
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-text-secondary text-sm font-medium">Description</Text>
        <FormInput
          placeholder="Optional notes about the exercise"
          value={state.description}
          onChangeText={(description) =>
            setState((prev) => ({ ...prev, description }))
          }
          multiline
          numberOfLines={4}
          style={{ minHeight: 96, textAlignVertical: 'top' }}
        />
      </View>
    </View>
  );
};

interface FormChromeProps {
  title: string;
  saveLabel: string;
  savingLabel: string;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}

const FormChrome: React.FC<FormChromeProps> = ({
  title,
  saveLabel,
  savingLabel,
  isSaving,
  onSave,
  onCancel,
  children,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-background"
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={onCancel}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={isSaving}
        >
          <Text className="text-base text-accent-primary">Cancel</Text>
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

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-4 pt-4 pb-20 gap-4"
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const validateAndParseCalories = (
  text: string,
): { ok: true; value?: number } | { ok: false } => {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: true, value: undefined };
  const parsed = parseDecimalInput(trimmed);
  if (Number.isNaN(parsed)) {
    Toast.show({
      type: 'error',
      text1: 'Invalid calories per hour',
      text2: 'Please enter a valid number.',
    });
    return { ok: false };
  }
  return { ok: true, value: parsed };
};

interface CreateExerciseModeProps {
  navigation: Navigation;
}

const CreateExerciseMode: React.FC<CreateExerciseModeProps> = ({ navigation }) => {
  const [state, setState] = useState<ExerciseFormState>({
    name: '',
    category: 'general',
    caloriesPerHourText: '',
    description: '',
    equipment: '',
    primaryMuscles: '',
    secondaryMuscles: '',
    instructions: '',
    level: null,
    force: null,
    mechanic: null,
  });
  const { createExerciseAsync, isPending } = useCreateExercise();

  const handleSave = async () => {
    const trimmedName = state.name.trim();
    if (!trimmedName) {
      Toast.show({
        type: 'error',
        text1: 'Missing name',
        text2: 'Please enter an exercise name.',
      });
      return;
    }

    const calories = validateAndParseCalories(state.caloriesPerHourText);
    if (!calories.ok) return;

    const trimmedDescription = state.description.trim();

    try {
      const created = await createExerciseAsync({
        name: trimmedName,
        category: state.category ?? 'general',
        ...(calories.value !== undefined ? { calories_per_hour: calories.value } : {}),
        description: trimmedDescription.length > 0 ? trimmedDescription : null,
      });
      Toast.show({ type: 'success', text1: 'Exercise created' });
      navigation.replace('ExerciseDetail', { item: created });
    } catch {
      // Error toast handled in useCreateExercise.
    }
  };

  return (
    <FormChrome
      title="New Exercise"
      saveLabel="Save"
      savingLabel="Saving…"
      isSaving={isPending}
      onSave={() => {
        void handleSave();
      }}
      onCancel={() => navigation.goBack()}
    >
      <ExerciseFormBody state={state} setState={setState} showCategory />
    </FormChrome>
  );
};

interface EditExerciseModeProps {
  navigation: Navigation;
  params: EditParams;
}

const buildEditPayload = (
  initial: Exercise,
  state: ExerciseFormState,
  caloriesValue: number | undefined,
): UpdateExercisePayload => {
  const payload: UpdateExercisePayload = {};

  const trimmedName = state.name.trim();
  if (trimmedName !== initial.name) {
    payload.name = trimmedName;
  }

  if (state.category && state.category !== initial.category) {
    payload.category = state.category;
  }

  if (
    caloriesValue !== undefined &&
    caloriesValue !== initial.calories_per_hour
  ) {
    payload.calories_per_hour = caloriesValue;
  }

  // Description is COALESCEd server-side: empty string clears, null preserves.
  const trimmedDescription = state.description.trim();
  const initialDescription = (initial.description ?? '').trim();
  if (trimmedDescription !== initialDescription) {
    payload.description = trimmedDescription;
  }

  const equipmentList = splitCsvList(state.equipment);
  if (JSON.stringify(equipmentList) !== JSON.stringify(initial.equipment ?? [])) {
    payload.equipment = equipmentList;
  }

  const primaryList = splitCsvList(state.primaryMuscles);
  if (
    JSON.stringify(primaryList) !== JSON.stringify(initial.primary_muscles ?? [])
  ) {
    payload.primary_muscles = primaryList;
  }

  const secondaryList = splitCsvList(state.secondaryMuscles);
  if (
    JSON.stringify(secondaryList) !==
    JSON.stringify(initial.secondary_muscles ?? [])
  ) {
    payload.secondary_muscles = secondaryList;
  }

  const stepsList = splitLines(state.instructions);
  if (JSON.stringify(stepsList) !== JSON.stringify(initial.instructions ?? [])) {
    payload.instructions = stepsList;
  }

  if (state.level && state.level !== (initial.level ?? null)) {
    payload.level = state.level;
  }
  if (state.force && state.force !== (initial.force ?? null)) {
    payload.force = state.force;
  }
  if (state.mechanic && state.mechanic !== (initial.mechanic ?? null)) {
    payload.mechanic = state.mechanic;
  }

  return payload;
};

const EditExerciseMode: React.FC<EditExerciseModeProps> = ({
  navigation,
  params,
}) => {
  const { exercise, returnKey } = params;
  const [state, setState] = useState<ExerciseFormState>(() => ({
    name: exercise.name,
    category: exercise.category,
    caloriesPerHourText:
      exercise.calories_per_hour > 0 ? String(exercise.calories_per_hour) : '',
    description: exercise.description ?? '',
    equipment: joinCsvList(exercise.equipment),
    primaryMuscles: joinCsvList(exercise.primary_muscles),
    secondaryMuscles: joinCsvList(exercise.secondary_muscles),
    instructions: joinLines(exercise.instructions),
    level: exercise.level ?? null,
    force: exercise.force ?? null,
    mechanic: exercise.mechanic ?? null,
  }));
  const { updateExerciseAsync, isPending } = useUpdateExercise();

  const handleSave = async () => {
    const trimmedName = state.name.trim();
    if (!trimmedName) {
      Toast.show({
        type: 'error',
        text1: 'Missing name',
        text2: 'Please enter an exercise name.',
      });
      return;
    }

    const calories = validateAndParseCalories(state.caloriesPerHourText);
    if (!calories.ok) return;

    const payload = buildEditPayload(exercise, state, calories.value);

    if (Object.keys(payload).length === 0) {
      navigation.goBack();
      return;
    }

    try {
      const updated = await updateExerciseAsync({ id: exercise.id, payload });
      Toast.show({ type: 'success', text1: 'Exercise updated' });
      navigation.dispatch({
        ...CommonActions.setParams({ updatedItem: updated }),
        source: returnKey,
      });
      navigation.goBack();
    } catch {
      // Error toast handled in useUpdateExercise.
    }
  };

  return (
    <FormChrome
      title="Edit Exercise"
      saveLabel="Save Changes"
      savingLabel="Saving…"
      isSaving={isPending}
      onSave={() => {
        void handleSave();
      }}
      onCancel={() => navigation.goBack()}
    >
      <ExerciseFormBody state={state} setState={setState} showCategory />
    </FormChrome>
  );
};

const ExerciseFormScreen: React.FC<ExerciseFormScreenProps> = ({
  navigation,
  route,
}) => {
  if (route.params.mode === 'edit-exercise') {
    return <EditExerciseMode navigation={navigation} params={route.params} />;
  }
  return <CreateExerciseMode navigation={navigation} />;
};

export default ExerciseFormScreen;

// Exposed for testing.
export { splitCsvList, joinCsvList, splitLines, joinLines, buildEditPayload };
export type { ExerciseFormState, EditParams };
