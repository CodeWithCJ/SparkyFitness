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
import { deriveExerciseModality, isExerciseModality } from '@workspace/shared';
import type { Exercise } from '../types/exercise';
import type {
  RootStackParamList,
  RootStackScreenProps,
} from '../types/navigation';
import type { CreateExercisePayload, UpdateExercisePayload } from '../services/api/exerciseApi';
import { useTranslation } from 'react-i18next';

const CATEGORY_OPTIONS = [
  { labelKey: 'workout.categoryGeneral', value: 'general' },
  { labelKey: 'workout.categoryStrength', value: 'strength' },
  { labelKey: 'workout.categoryCardio', value: 'cardio' },
  { labelKey: 'workout.categoryYoga', value: 'yoga' },
  { labelKey: 'workout.categoryPowerlifting', value: 'powerlifting' },
  { labelKey: 'workout.categoryOlympicWeightlifting', value: 'olympic weightlifting' },
  { labelKey: 'workout.categoryStrongman', value: 'strongman' },
  { labelKey: 'workout.categoryPlyometrics', value: 'plyometrics' },
  { labelKey: 'workout.categoryStretching', value: 'stretching' },
  { labelKey: 'workout.categoryIsometric', value: 'isometric' },
] as const;

const MODALITY_OPTIONS = [
  { labelKey: 'workout.modalityWeightReps', value: 'weight_reps' },
  { labelKey: 'workout.modalityReps', value: 'reps_only' },
  { labelKey: 'workout.modalityDuration', value: 'duration' },
  { labelKey: 'workout.modalityDurationDistance', value: 'duration_distance' },
] as const;

const LEVEL_OPTIONS = [
  { labelKey: 'workout.levelBeginner', value: 'beginner' },
  { labelKey: 'workout.levelIntermediate', value: 'intermediate' },
  { labelKey: 'workout.levelExpert', value: 'expert' },
] as const;

const FORCE_OPTIONS = [
  { labelKey: 'workout.forcePull', value: 'pull' },
  { labelKey: 'workout.forcePush', value: 'push' },
  { labelKey: 'workout.forceStatic', value: 'static' },
] as const;

const MECHANIC_OPTIONS = [
  { labelKey: 'workout.mechanicCompound', value: 'compound' },
  { labelKey: 'workout.mechanicIsolation', value: 'isolation' },
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

const translateOptionLabel = (t: (key: string) => string, key: string): string => {
  switch (key) {
    case 'workout.categoryGeneral': return t('workout.categoryGeneral');
    case 'workout.categoryStrength': return t('workout.categoryStrength');
    case 'workout.categoryCardio': return t('workout.categoryCardio');
    case 'workout.categoryYoga': return t('workout.categoryYoga');
    case 'workout.categoryPowerlifting': return t('workout.categoryPowerlifting');
    case 'workout.categoryOlympicWeightlifting': return t('workout.categoryOlympicWeightlifting');
    case 'workout.categoryStrongman': return t('workout.categoryStrongman');
    case 'workout.categoryPlyometrics': return t('workout.categoryPlyometrics');
    case 'workout.categoryStretching': return t('workout.categoryStretching');
    case 'workout.categoryIsometric': return t('workout.categoryIsometric');
    case 'workout.modalityWeightReps': return t('workout.modalityWeightReps');
    case 'workout.modalityReps': return t('workout.modalityReps');
    case 'workout.modalityDuration': return t('workout.modalityDuration');
    case 'workout.modalityDurationDistance': return t('workout.modalityDurationDistance');
    case 'workout.levelBeginner': return t('workout.levelBeginner');
    case 'workout.levelIntermediate': return t('workout.levelIntermediate');
    case 'workout.levelExpert': return t('workout.levelExpert');
    case 'workout.forcePull': return t('workout.forcePull');
    case 'workout.forcePush': return t('workout.forcePush');
    case 'workout.forceStatic': return t('workout.forceStatic');
    case 'workout.mechanicCompound': return t('workout.mechanicCompound');
    case 'workout.mechanicIsolation': return t('workout.mechanicIsolation');
    default: return titleCase(key);
  }
};

interface ExerciseFormState {
  name: string;
  category: string | null;
  modality: string | null;
  /**
   * Once the user picks a modality it is pinned; until then create mode keeps
   * it following the category's derived value (edit mode seeds this true so a
   * stored modality never silently changes with the category).
   */
  modalityManuallySet: boolean;
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

const ExerciseFormBody: React.FC<ExerciseFormBodyProps> = ({
  state,
  setState,
  showCategory,
}) => {
  const { t } = useTranslation();
  const textMuted = useCSSVariable('--color-text-muted') as string;
  const [showAdvanced, setShowAdvanced] = useState(() => hasAdvancedContent(state));

  const categoryOptions = useMemo(() => {
    if (
      state.category &&
      !CATEGORY_OPTIONS.some((opt) => opt.value === state.category)
    ) {
      return [
         ...CATEGORY_OPTIONS.map((opt) => ({ labelKey: opt.labelKey, value: opt.value })),
         { labelKey: titleCase(state.category), value: state.category },
      ];
    }
     return CATEGORY_OPTIONS.map((opt) => ({ labelKey: opt.labelKey, value: opt.value }));
  }, [state.category]);

  const modalityOptions = useMemo(() => {
    if (
      state.modality &&
      !MODALITY_OPTIONS.some((opt) => opt.value === state.modality)
    ) {
      return [
         ...MODALITY_OPTIONS.map((opt) => ({ labelKey: opt.labelKey, value: opt.value })),
         { labelKey: titleCase(state.modality), value: state.modality },
      ];
    }
     return MODALITY_OPTIONS.map((opt) => ({ labelKey: opt.labelKey, value: opt.value }));
  }, [state.modality]);

  const renderPicker = (
    label: string,
    options: readonly { labelKey: string; value: string }[],
    value: string | null,
    onSelect: (next: string) => void,
  ) => (
    <View className="gap-1.5">
      <Text className="text-text-secondary text-sm font-medium">{label}</Text>
      <BottomSheetPicker<string>
        value={value ?? ''}
        options={options.map((opt) => ({ label: translateOptionLabel(t, opt.labelKey), value: opt.value }))}
        onSelect={onSelect}
        title={t('workout.select', { label })}
        renderTrigger={({ onPress }) => (
          <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 flex-row items-center justify-between"
            style={{ height: 44 }}
          >
            <Text className="text-text-primary" style={{ fontSize: 16 }}>
              {value ? translateOptionLabel(t, options.find((opt) => opt.value === value)?.labelKey ?? value) : t('workout.selectValue')}
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
         <Text className="text-text-secondary text-sm font-medium">{t('workout.nameRequired')}</Text>
        <FormInput
          placeholder={t('workout.exerciseNamePlaceholder')}
          value={state.name}
          onChangeText={(name) => setState((prev) => ({ ...prev, name }))}
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          returnKeyType="next"
        />
      </View>

      {showCategory
         ? renderPicker(t('workout.category'), categoryOptions, state.category, (category) =>
            setState((prev) => ({
              ...prev,
              category,
              ...(prev.modalityManuallySet
                ? null
                : { modality: deriveExerciseModality(category) }),
            })),
          )
        : null}

      {renderPicker(t('workout.trackingType'), modalityOptions, state.modality, (modality) =>
        setState((prev) => ({ ...prev, modality, modalityManuallySet: true })),
      )}

      <View className="gap-1.5">
        <Text className="text-text-secondary text-sm font-medium">
          {t('workout.caloriesPerHour')}
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
         <Text className="text-text-secondary text-sm font-medium">{t('workout.description')}</Text>
        <FormInput
          placeholder={t('workout.optionalExerciseNotes')}
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
        accessibilityState={{ expanded: showAdvanced }}
        className="flex-row items-center justify-between py-2"
      >
        <Text className="text-text-primary font-medium" style={{ fontSize: 16 }}>
          {t('workout.advanced')}
        </Text>
        <Icon
          name={showAdvanced ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={textMuted}
        />
      </TouchableOpacity>

      {showAdvanced ? (
        <View className="gap-4">
           <SectionHeader>{t('workout.muscles')}</SectionHeader>

          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">
               {t('workout.primaryMuscles')}
            </Text>
            <FormInput
              placeholder={t('workout.commaSeparatedMuscles')}
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
               {t('workout.secondaryMuscles')}
            </Text>
            <FormInput
              placeholder={t('workout.commaSeparated')}
              value={state.secondaryMuscles}
              onChangeText={(secondaryMuscles) =>
                setState((prev) => ({ ...prev, secondaryMuscles }))
              }
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

           <SectionHeader>{t('workout.classification')}</SectionHeader>

           {renderPicker(t('workout.level'), LEVEL_OPTIONS, state.level, (level) =>
            setState((prev) => ({ ...prev, level })),
          )}
           {renderPicker(t('workout.force'), FORCE_OPTIONS, state.force, (force) =>
            setState((prev) => ({ ...prev, force })),
          )}
           {renderPicker(t('workout.mechanic'), MECHANIC_OPTIONS, state.mechanic, (mechanic) =>
            setState((prev) => ({ ...prev, mechanic })),
          )}

           <SectionHeader>{t('workout.details')}</SectionHeader>

          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">
               {t('workout.equipment')}
            </Text>
            <FormInput
              placeholder={t('workout.commaSeparatedEquipment')}
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
               {t('workout.instructions')}
            </Text>
            <FormInput
              placeholder={t('workout.oneStepPerLine')}
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
  t: (key: string) => string,
): { ok: true; value?: number } | { ok: false } => {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: true, value: undefined };
  const parsed = parseDecimalInput(trimmed);
  if (Number.isNaN(parsed)) {
    Toast.show({
      type: 'error',
       text1: t('workout.invalidCalories'),
       text2: t('workout.invalidNumber'),
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

  if (isExerciseModality(state.modality)) payload.modality = state.modality;

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
    modality: deriveExerciseModality('general'),
    modalityManuallySet: false,
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
  const { t } = useTranslation();
  const { createExerciseAsync, isPending } = useCreateExercise();

  const handleSave = async () => {
    const trimmedName = state.name.trim();
    if (!trimmedName) {
      Toast.show({
        type: 'error',
        text1: t('workout.missingName'),
        text2: t('workout.exerciseNameRequired'),
      });
      return;
    }

    const calories = validateAndParseCalories(state.caloriesPerHourText, t);
    if (!calories.ok) return;

    const payload = buildCreatePayload(trimmedName, state, calories.value);

    try {
      const created = await createExerciseAsync(payload);
      Toast.show({ type: 'success', text1: t('workout.exerciseCreated') });
      navigation.replace('ExerciseDetail', { item: created });
    } catch {
      // Error toast handled in useCreateExercise.
    }
  };

  return (
    <FormScreenChrome
       title={t('screens.newExercise')}
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

  // Diff against the stored-or-derived value so unrelated edits never imply a
  // modality choice (old servers would drop it anyway; new ones would pin it).
  const initialModality =
    initial.modality ?? deriveExerciseModality(initial.category);
  if (isExerciseModality(state.modality) && state.modality !== initialModality) {
    payload.modality = state.modality;
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
    modality: exercise.modality ?? deriveExerciseModality(exercise.category),
    modalityManuallySet: true,
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
  const { t } = useTranslation();
  const { updateExerciseAsync, isPending } = useUpdateExercise();

  const handleSave = async () => {
    const trimmedName = state.name.trim();
    if (!trimmedName) {
      Toast.show({
        type: 'error',
        text1: t('workout.missingName'),
        text2: t('workout.exerciseNameRequired'),
      });
      return;
    }

    const calories = validateAndParseCalories(state.caloriesPerHourText, t);
    if (!calories.ok) return;

    const payload = buildEditPayload(exercise, state, calories.value);

    if (Object.keys(payload).length === 0) {
      navigation.goBack();
      return;
    }

    try {
      const updated = await updateExerciseAsync({ id: exercise.id, payload });
      Toast.show({ type: 'success', text1: t('workout.exerciseUpdated') });
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
       title={t('screens.editExercise')}
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
