import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Toast from 'react-native-toast-message';
import { CommonActions } from '@react-navigation/native';
import { useCSSVariable } from 'uniwind';
import BottomSheetPicker from '../components/BottomSheetPicker';
import FormInput from '../components/FormInput';
import FormScreenChrome from '../components/FormScreenChrome';
import Icon from '../components/Icon';
import { useCreateExercise, useUpdateExercise } from '../hooks';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import type { Exercise } from '../types/exercise';
import type {
  RootStackParamList,
  RootStackScreenProps,
} from '../types/navigation';
import type { CreateExercisePayload, UpdateExercisePayload } from '../services/api/exerciseApi';
import {
  formatMobileNumber,
  isMobileRtl,
  localizeExerciseCategory,
  localizeExerciseMetadata,
  mobileT,
} from '../localization';

const categoryOption = (value: string) => ({
  label: localizeExerciseCategory(value),
  value,
});

const metadataOption = (
  kind: 'level' | 'force' | 'mechanic',
  value: string,
) => ({
  label: localizeExerciseMetadata(kind, value),
  value,
});

const CATEGORY_OPTIONS = [
  categoryOption('general'),
  categoryOption('strength'),
  categoryOption('cardio'),
  categoryOption('yoga'),
  categoryOption('powerlifting'),
  categoryOption('olympic weightlifting'),
  categoryOption('strongman'),
  categoryOption('plyometrics'),
  categoryOption('stretching'),
  categoryOption('isometric'),
];

const LEVEL_OPTIONS = [
  metadataOption('level', 'beginner'),
  metadataOption('level', 'intermediate'),
  metadataOption('level', 'expert'),
];

const FORCE_OPTIONS = [
  metadataOption('force', 'pull'),
  metadataOption('force', 'push'),
  metadataOption('force', 'static'),
];

const MECHANIC_OPTIONS = [
  metadataOption('mechanic', 'compound'),
  metadataOption('mechanic', 'isolation'),
];

type EditParams = Extract<RootStackParamList['ExerciseForm'], { mode: 'edit-exercise' }>;

type ExerciseFormScreenProps = RootStackScreenProps<'ExerciseForm'>;
type Navigation = ExerciseFormScreenProps['navigation'];

const splitCsvList = (s: string): string[] =>
  Array.from(new Set(s.split(/[,،]/).map((v) => v.trim()).filter(Boolean)));

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

const hasAdvancedContent = (state: ExerciseFormState): boolean =>
  Boolean(
    state.equipment ||
      state.primaryMuscles ||
      state.secondaryMuscles ||
      state.instructions ||
      state.level ||
      state.force ||
      state.mechanic,
  );

const SectionHeader: React.FC<{ children: string }> = ({ children }) => (
  <Text className="text-text-secondary text-sm font-semibold uppercase tracking-wider">
    {children}
  </Text>
);

const labelForOption = (
  options: readonly { label: string; value: string }[],
  value: string | null,
): string => {
  if (!value) return mobileT('exerciseForm.select');
  const match = options.find((opt) => opt.value === value);
  return match ? match.label : titleCase(value);
};

const ExerciseFormBody: React.FC<ExerciseFormBodyProps> = ({
  state,
  setState,
  showCategory,
}) => {
  const textMuted = useCSSVariable('--color-text-muted') as string;
  const [showAdvanced, setShowAdvanced] = useState(() => hasAdvancedContent(state));
  const collapsedAdvancedIcon = isMobileRtl ? 'chevron-back' : 'chevron-forward';

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

  const renderPicker = (
    label: string,
    options: readonly { label: string; value: string }[],
    value: string | null,
    onSelect: (next: string) => void,
  ) => (
    <View className="gap-1.5">
      <Text className="text-text-secondary text-sm font-medium">{label}</Text>
      <BottomSheetPicker<string>
        value={value ?? ''}
        options={options.map((opt) => ({ label: opt.label, value: opt.value }))}
        onSelect={onSelect}
        title={mobileT('exerciseForm.selectField', { field: label })}
        renderTrigger={({ onPress }) => (
          <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={mobileT('exerciseForm.selectField', { field: label })}
            className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 flex-row items-center justify-between"
            style={{ height: 44 }}
          >
            <Text className="text-text-primary" style={{ fontSize: 16 }}>
              {labelForOption(options, value)}
            </Text>
            <Icon name="chevron-down" size={16} color={textMuted} />
          </TouchableOpacity>
        )}
      />
    </View>
  );

  return (
    <View className="bg-surface rounded-xl p-4 gap-4 shadow-sm">
      <View className="gap-1.5">
        <Text className="text-text-secondary text-sm font-medium">
          {mobileT('exerciseForm.name')}
        </Text>
        <FormInput
          placeholder={mobileT('exerciseForm.namePlaceholder')}
          value={state.name}
          onChangeText={(name) => setState((prev) => ({ ...prev, name }))}
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          returnKeyType="next"
        />
      </View>

      {showCategory
        ? renderPicker(
            mobileT('exerciseForm.category'),
            categoryOptions,
            state.category,
            (category) => setState((prev) => ({ ...prev, category })),
          )
        : null}

      <View className="gap-1.5">
        <Text className="text-text-secondary text-sm font-medium">
          {mobileT('exerciseForm.caloriesPerHour')}
        </Text>
        <FormInput
          placeholder={formatMobileNumber(0)}
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
        <Text className="text-text-secondary text-sm font-medium">
          {mobileT('exerciseForm.description')}
        </Text>
        <FormInput
          placeholder={mobileT('exerciseForm.descriptionPlaceholder')}
          value={state.description}
          onChangeText={(description) =>
            setState((prev) => ({ ...prev, description }))
          }
          multiline
          numberOfLines={4}
          style={{ minHeight: 96, textAlignVertical: 'top' }}
        />
      </View>

      <TouchableOpacity
        onPress={() => setShowAdvanced((prev) => !prev)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={mobileT('exerciseForm.advanced')}
        accessibilityState={{ expanded: showAdvanced }}
        className="flex-row items-center justify-between py-2"
      >
        <Text className="text-text-primary font-medium" style={{ fontSize: 16 }}>
          {mobileT('exerciseForm.advanced')}
        </Text>
        <Icon
          name={showAdvanced ? 'chevron-down' : collapsedAdvancedIcon}
          size={16}
          color={textMuted}
        />
      </TouchableOpacity>

      {showAdvanced ? (
        <View className="gap-4">
          <SectionHeader>{mobileT('exerciseForm.muscles')}</SectionHeader>

          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">
              {mobileT('exerciseForm.primaryMuscles')}
            </Text>
            <FormInput
              placeholder={mobileT('exerciseForm.primaryMusclesPlaceholder')}
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
              {mobileT('exerciseForm.secondaryMuscles')}
            </Text>
            <FormInput
              placeholder={mobileT('exerciseForm.listPlaceholder')}
              value={state.secondaryMuscles}
              onChangeText={(secondaryMuscles) =>
                setState((prev) => ({ ...prev, secondaryMuscles }))
              }
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <SectionHeader>{mobileT('exerciseForm.classification')}</SectionHeader>

          {renderPicker(
            mobileT('exerciseForm.level'),
            LEVEL_OPTIONS,
            state.level,
            (level) => setState((prev) => ({ ...prev, level })),
          )}
          {renderPicker(
            mobileT('exerciseForm.force'),
            FORCE_OPTIONS,
            state.force,
            (force) => setState((prev) => ({ ...prev, force })),
          )}
          {renderPicker(
            mobileT('exerciseForm.mechanic'),
            MECHANIC_OPTIONS,
            state.mechanic,
            (mechanic) => setState((prev) => ({ ...prev, mechanic })),
          )}

          <SectionHeader>{mobileT('exerciseForm.details')}</SectionHeader>

          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">
              {mobileT('exerciseForm.equipment')}
            </Text>
            <FormInput
              placeholder={mobileT('exerciseForm.equipmentPlaceholder')}
              value={state.equipment}
              onChangeText={(equipment) =>
                setState((prev) => ({ ...prev, equipment }))
              }
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">
              {mobileT('exerciseForm.instructions')}
            </Text>
            <FormInput
              placeholder={mobileT('exerciseForm.instructionsPlaceholder')}
              value={state.instructions}
              onChangeText={(instructions) =>
                setState((prev) => ({ ...prev, instructions }))
              }
              multiline
              numberOfLines={6}
              style={{ minHeight: 120, textAlignVertical: 'top' }}
            />
          </View>
        </View>
      ) : null}
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
      text1: mobileT('exerciseForm.invalidCalories'),
      text2: mobileT('exerciseForm.validNumberPrompt'),
    });
    return { ok: false };
  }
  return { ok: true, value: parsed };
};

const buildCreatePayload = (
  trimmedName: string,
  state: ExerciseFormState,
  caloriesValue: number | undefined,
): CreateExercisePayload => {
  const trimmedDescription = state.description.trim();
  const equipmentList = splitCsvList(state.equipment);
  const primaryList = splitCsvList(state.primaryMuscles);
  const secondaryList = splitCsvList(state.secondaryMuscles);
  const stepsList = splitLines(state.instructions);

  const payload: CreateExercisePayload = {
    name: trimmedName,
    category: state.category ?? 'general',
    description: trimmedDescription.length > 0 ? trimmedDescription : null,
  };

  if (caloriesValue !== undefined) payload.calories_per_hour = caloriesValue;
  if (equipmentList.length > 0) payload.equipment = equipmentList;
  if (primaryList.length > 0) payload.primary_muscles = primaryList;
  if (secondaryList.length > 0) payload.secondary_muscles = secondaryList;
  if (stepsList.length > 0) payload.instructions = stepsList;
  if (state.level) payload.level = state.level;
  if (state.force) payload.force = state.force;
  if (state.mechanic) payload.mechanic = state.mechanic;

  return payload;
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
        text1: mobileT('exerciseForm.missingName'),
        text2: mobileT('exerciseForm.nameRequired'),
      });
      return;
    }

    const calories = validateAndParseCalories(state.caloriesPerHourText);
    if (!calories.ok) return;

    const payload = buildCreatePayload(trimmedName, state, calories.value);

    try {
      const created = await createExerciseAsync(payload);
      Toast.show({ type: 'success', text1: mobileT('exerciseForm.created') });
      navigation.replace('ExerciseDetail', { item: created });
    } catch {
      // Error toast handled in useCreateExercise.
    }
  };

  return (
    <FormScreenChrome
      title={mobileT('exerciseForm.newTitle')}
      saveLabel={mobileT('common.save')}
      savingLabel={mobileT('common.saving')}
      isSaving={isPending}
      onSave={() => {
        void handleSave();
      }}
      onCancel={() => navigation.goBack()}
    >
      <ExerciseFormBody state={state} setState={setState} showCategory />
    </FormScreenChrome>
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
      exercise.calories_per_hour > 0
        ? formatMobileNumber(exercise.calories_per_hour, {
            maximumFractionDigits: 2,
            useGrouping: false,
          })
        : '',
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
        text1: mobileT('exerciseForm.missingName'),
        text2: mobileT('exerciseForm.nameRequired'),
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
      Toast.show({ type: 'success', text1: mobileT('exerciseForm.updated') });
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
    <FormScreenChrome
      title={mobileT('exerciseForm.editTitle')}
      saveLabel={mobileT('common.save')}
      savingLabel={mobileT('common.saving')}
      isSaving={isPending}
      onSave={() => {
        void handleSave();
      }}
      onCancel={() => navigation.goBack()}
    >
      <ExerciseFormBody state={state} setState={setState} showCategory />
    </FormScreenChrome>
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
export {
  splitCsvList,
  joinCsvList,
  splitLines,
  joinLines,
  buildCreatePayload,
  buildEditPayload,
};
export type { ExerciseFormState, EditParams };
