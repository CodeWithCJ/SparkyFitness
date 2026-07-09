import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import Toast from 'react-native-toast-message';
import { CommonActions } from '@react-navigation/native';
import FormInput from '../components/FormInput';
import FormScreenChrome from '../components/FormScreenChrome';
import WorkoutFormExerciseList, {
  type WorkoutFormExerciseListHandle,
} from '../components/WorkoutFormExerciseList';
import {
  useCreateWorkoutPreset,
  useUpdateWorkoutPreset,
  usePreferences,
} from '../hooks';
import { useExerciseSetEditing } from '../hooks/useExerciseSetEditing';
import { useSelectedExercise } from '../hooks/useSelectedExercise';
import { useWorkoutPresetForm, type PresetDraft } from '../hooks/useWorkoutPresetForm';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { SAVE_LABEL, SAVING_LABEL, type HeaderItem } from '../hooks/useScreenHeader';
import { buildPresetExercisesPayload, canReorderDraftExercises } from '../utils/workoutSession';
import type { WorkoutSetMetaPatch } from '../types/drafts';
import type { Exercise } from '../types/exercise';
import type { WorkoutPreset } from '../types/workoutPresets';
import type {
  RootStackParamList,
  RootStackScreenProps,
} from '../types/navigation';
import type {
  WorkoutPresetCreatePayload,
  WorkoutPresetUpdatePayload,
} from '../services/api/workoutPresetsApi';

type EditParams = Extract<RootStackParamList['WorkoutPresetForm'], { mode: 'edit-preset' }>;

type WorkoutPresetFormScreenProps = RootStackScreenProps<'WorkoutPresetForm'>;
type Navigation = WorkoutPresetFormScreenProps['navigation'];
type Route = WorkoutPresetFormScreenProps['route'];

interface PresetFormBodyProps {
  state: PresetDraft;
  setName: (s: string) => void;
  setDescription: (s: string) => void;
  weightUnit: 'kg' | 'lbs';
  exerciseSetEditing: ReturnType<typeof useExerciseSetEditing>;
  updateSetField: (
    exerciseClientId: string,
    setClientId: string,
    field: 'weight' | 'reps',
    value: string,
  ) => void;
  updateSetMeta: (
    exerciseClientId: string,
    setClientId: string,
    patch: WorkoutSetMetaPatch,
  ) => void;
  removeSet: (exerciseClientId: string, setClientId: string) => void;
  setExerciseRest: (exerciseClientId: string, seconds: number) => void;
  supersetWith: (currentClientId: string, pickedClientId: string) => void;
  ungroupExercise: (clientId: string) => void;
  reorderExercises: (fromItemIndex: number, toItemIndex: number) => void;
  isEligibleForPrefill: (clientId: string) => boolean;
  onAddExercisePress: () => void;
  onViewExercise: (exercise: Exercise) => void;
  listRef: React.Ref<WorkoutFormExerciseListHandle>;
}

const PresetFormBody: React.FC<PresetFormBodyProps> = ({
  state,
  setName,
  setDescription,
  weightUnit,
  exerciseSetEditing,
  updateSetField,
  updateSetMeta,
  removeSet,
  setExerciseRest,
  supersetWith,
  ungroupExercise,
  reorderExercises,
  isEligibleForPrefill,
  onAddExercisePress,
  onViewExercise,
  listRef,
}) => {
  const { getImageSource } = useExerciseImageSource();

  return (
    <View className="gap-4">
      <View className="bg-surface rounded-xl p-4 gap-4 shadow-sm">
        <View className="gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">Name *</Text>
          <FormInput
            placeholder="e.g. Push Day"
            value={state.name}
            onChangeText={setName}
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            returnKeyType="next"
          />
        </View>

        <View className="gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">Description</Text>
          <FormInput
            placeholder="Optional notes about this routine"
            value={state.description}
            onChangeText={setDescription}
            multiline
            numberOfLines={2}
            style={{ minHeight: 48, textAlignVertical: 'top' }}
          />
        </View>
      </View>

      <WorkoutFormExerciseList
        ref={listRef}
        exercises={state.exercises}
        weightUnit={weightUnit}
        getImageSource={getImageSource}
        activeSetKey={exerciseSetEditing.activeSetKey}
        activeSetField={exerciseSetEditing.activeSetField}
        onActivateSet={exerciseSetEditing.activateSet}
        onDeactivateSet={exerciseSetEditing.deactivateSet}
        updateSetField={updateSetField}
        updateSetMeta={updateSetMeta}
        removeSet={removeSet}
        onAddSet={exerciseSetEditing.handleAddSet}
        onRemoveExercise={exerciseSetEditing.handleRemoveExercise}
        setExerciseRest={setExerciseRest}
        supersetWith={supersetWith}
        ungroupExercise={ungroupExercise}
        onReorderExercises={reorderExercises}
        onAddExercisePress={onAddExercisePress}
        onViewExercise={onViewExercise}
        isEligibleForPrefill={isEligibleForPrefill}
        rpeEditable={false}
      />
    </View>
  );
};

function getWeightUnit(value: string | undefined | null): 'kg' | 'lbs' {
  // Workout screens only know how to display kg or lbs. Coerce st_lbs to lbs so
  // we never quietly hand an unsupported unit to weightToKg.
  return value === 'kg' ? 'kg' : 'lbs';
}

interface CreatePresetModeProps {
  navigation: Navigation;
  route: Route;
}

const CreatePresetMode: React.FC<CreatePresetModeProps> = ({ navigation, route }) => {
  const { preferences } = usePreferences();
  const weightUnit = getWeightUnit(preferences?.default_weight_unit);

  const {
    state,
    setName,
    setDescription,
    addExercise,
    removeExercise,
    addSet,
    removeSet,
    updateSetField,
    updateSetMeta,
    setExerciseRest,
    supersetWith,
    ungroupExercise,
    reorderExercises,
  } = useWorkoutPresetForm();

  const [eligibleIds, setEligibleIds] = useState<Set<string>>(() => new Set());
  const wrappedAddExercise = useCallback(
    (exercise: Parameters<typeof addExercise>[0]) => {
      const result = addExercise(exercise);
      setEligibleIds(prev => {
        const next = new Set(prev);
        next.add(result.exerciseClientId);
        return next;
      });
      return result;
    },
    [addExercise],
  );
  const isEligibleForPrefill = useCallback(
    (clientId: string) => eligibleIds.has(clientId),
    [eligibleIds],
  );

  const exerciseSetEditing = useExerciseSetEditing({
    addExercise: wrappedAddExercise,
    removeExercise,
    addSet,
  });
  useSelectedExercise(route.params, exerciseSetEditing.handleAddExercise);

  const { createPresetAsync, isPending } = useCreateWorkoutPreset();

  const exerciseListRef = useRef<WorkoutFormExerciseListHandle>(null);
  const reorderAction: HeaderItem | null = canReorderDraftExercises(state.exercises)
    ? {
        kind: 'icon',
        sfSymbol: 'arrow.up.arrow.down',
        ionicon: 'swap-vertical',
        role: 'secondary',
        onPress: () => exerciseListRef.current?.openReorder(),
        accessibilityLabel: 'Reorder exercises',
        identifier: 'preset-create-reorder',
      }
    : null;

  const openExerciseSearch = () => {
    navigation.navigate('ExerciseSearch', { returnKey: route.key });
  };

  const handleSave = async () => {
    const trimmedName = state.name.trim();
    if (!trimmedName) {
      Toast.show({
        type: 'error',
        text1: 'Missing name',
        text2: 'Please enter a name for this preset.',
      });
      return;
    }

    const exercisesWithSets = state.exercises.filter(e => e.sets.length > 0);
    if (exercisesWithSets.length === 0) {
      Toast.show({
        type: 'error',
        text1: 'Add an exercise',
        text2: 'Add at least one exercise with a set before saving.',
      });
      return;
    }

    const trimmedDescription = state.description.trim();
    const payload: WorkoutPresetCreatePayload = {
      name: trimmedName,
      description: trimmedDescription.length > 0 ? trimmedDescription : null,
      is_public: false,
      exercises: buildPresetExercisesPayload(state.exercises, weightUnit),
    };

    try {
      const created = await createPresetAsync(payload);
      Toast.show({ type: 'success', text1: 'Workout preset created' });
      navigation.replace('WorkoutPresetDetail', { preset: created });
    } catch {
      // Error toast handled in useCreateWorkoutPreset.
    }
  };
  return (
    <FormScreenChrome
      title="New Preset"
      saveLabel={SAVE_LABEL}
      savingLabel={SAVING_LABEL}
      isSaving={isPending}
      headerAction={reorderAction}
      onSave={() => {
        void handleSave();
      }}
      onCancel={() => navigation.goBack()}
    >
      <PresetFormBody
        state={state}
        setName={setName}
        setDescription={setDescription}
        weightUnit={weightUnit}
        exerciseSetEditing={exerciseSetEditing}
        updateSetField={updateSetField}
        updateSetMeta={updateSetMeta}
        removeSet={removeSet}
        setExerciseRest={setExerciseRest}
        supersetWith={supersetWith}
        ungroupExercise={ungroupExercise}
        reorderExercises={reorderExercises}
        isEligibleForPrefill={isEligibleForPrefill}
        onAddExercisePress={openExerciseSearch}
        onViewExercise={(exercise) =>
          navigation.navigate('ExerciseDetail', { item: exercise, hideWorkoutActions: true })
        }
        listRef={exerciseListRef}
      />
    </FormScreenChrome>
  );
};

interface EditPresetModeProps {
  navigation: Navigation;
  route: Route;
  params: EditParams;
}

export function buildPresetEditPayload(args: {
  state: PresetDraft;
  initialPreset: WorkoutPreset;
  initialDescription: string;
  exercisesModified: boolean;
  weightUnit: 'kg' | 'lbs';
}): WorkoutPresetUpdatePayload {
  const { state, initialPreset, initialDescription, exercisesModified, weightUnit } = args;
  const payload: WorkoutPresetUpdatePayload = {};

  const trimmedName = state.name.trim();
  if (trimmedName !== initialPreset.name) {
    payload.name = trimmedName;
  }

  const trimmedDesc = state.description.trim();
  if (trimmedDesc !== initialDescription.trim()) {
    payload.description = trimmedDesc;
  }

  // is_public is intentionally never sent — the form has no UI; sending false
  // would unshare a previously-public preset (server uses COALESCE).

  if (exercisesModified) {
    payload.exercises = buildPresetExercisesPayload(state.exercises, weightUnit);
  }

  return payload;
}

const EditPresetMode: React.FC<EditPresetModeProps> = ({ navigation, route, params }) => {
  const { preset, returnKey } = params;
  const { preferences, isLoading: isPreferencesLoading } = usePreferences();
  const weightUnit = getWeightUnit(preferences?.default_weight_unit);

  const {
    state,
    setName,
    setDescription,
    addExercise,
    removeExercise,
    addSet,
    removeSet,
    updateSetField,
    updateSetMeta,
    setExerciseRest,
    supersetWith,
    ungroupExercise,
    reorderExercises,
    populateFromPreset,
    exercisesModifiedRef,
    initialDescriptionRef,
  } = useWorkoutPresetForm();

  const [eligibleIds, setEligibleIds] = useState<Set<string>>(() => new Set());
  const wrappedAddExercise = useCallback(
    (exercise: Parameters<typeof addExercise>[0]) => {
      const result = addExercise(exercise);
      setEligibleIds(prev => {
        const next = new Set(prev);
        next.add(result.exerciseClientId);
        return next;
      });
      return result;
    },
    [addExercise],
  );
  const isEligibleForPrefill = useCallback(
    (clientId: string) => eligibleIds.has(clientId),
    [eligibleIds],
  );

  const exerciseSetEditing = useExerciseSetEditing({
    addExercise: wrappedAddExercise,
    removeExercise,
    addSet,
  });
  useSelectedExercise(route.params, exerciseSetEditing.handleAddExercise);

  const hasPopulatedRef = useRef(false);
  useEffect(() => {
    if (hasPopulatedRef.current || isPreferencesLoading) return;
    hasPopulatedRef.current = true;
    populateFromPreset(preset, weightUnit);
  }, [isPreferencesLoading, populateFromPreset, preset, weightUnit]);

  const { updatePresetAsync, isPending } = useUpdateWorkoutPreset();

  const exerciseListRef = useRef<WorkoutFormExerciseListHandle>(null);
  const reorderAction: HeaderItem | null = canReorderDraftExercises(state.exercises)
    ? {
        kind: 'icon',
        sfSymbol: 'arrow.up.arrow.down',
        ionicon: 'swap-vertical',
        role: 'secondary',
        onPress: () => exerciseListRef.current?.openReorder(),
        accessibilityLabel: 'Reorder exercises',
        identifier: 'preset-edit-reorder',
      }
    : null;

  const openExerciseSearch = () => {
    navigation.navigate('ExerciseSearch', { returnKey: route.key });
  };

  const handleSave = async () => {
    const trimmedName = state.name.trim();
    if (!trimmedName) {
      Toast.show({
        type: 'error',
        text1: 'Missing name',
        text2: 'Please enter a name for this preset.',
      });
      return;
    }

    // Edit mode intentionally skips the "at least one set" check that create
    // mode enforces — the server allows preset exercises with no sets, and a
    // user editing only the name/description should not be forced to add one.

    const payload = buildPresetEditPayload({
      state,
      initialPreset: preset,
      initialDescription: initialDescriptionRef.current,
      exercisesModified: exercisesModifiedRef.current,
      weightUnit,
    });

    if (Object.keys(payload).length === 0) {
      navigation.goBack();
      return;
    }

    try {
      const updated = await updatePresetAsync({ id: preset.id, payload });
      Toast.show({ type: 'success', text1: 'Workout preset updated' });
      navigation.dispatch({
        ...CommonActions.setParams({ updatedPreset: updated }),
        source: returnKey,
      });
      navigation.goBack();
    } catch {
      // Error toast handled in useUpdateWorkoutPreset.
    }
  };
  return (
    <FormScreenChrome
      title="Edit Preset"
      saveLabel={SAVE_LABEL}
      savingLabel={SAVING_LABEL}
      isSaving={isPending}
      headerAction={reorderAction}
      onSave={() => {
        void handleSave();
      }}
      onCancel={() => navigation.goBack()}
    >
      <PresetFormBody
        state={state}
        setName={setName}
        setDescription={setDescription}
        weightUnit={weightUnit}
        exerciseSetEditing={exerciseSetEditing}
        updateSetField={updateSetField}
        updateSetMeta={updateSetMeta}
        removeSet={removeSet}
        setExerciseRest={setExerciseRest}
        supersetWith={supersetWith}
        ungroupExercise={ungroupExercise}
        reorderExercises={reorderExercises}
        isEligibleForPrefill={isEligibleForPrefill}
        onAddExercisePress={openExerciseSearch}
        onViewExercise={(exercise) =>
          navigation.navigate('ExerciseDetail', { item: exercise, hideWorkoutActions: true })
        }
        listRef={exerciseListRef}
      />
    </FormScreenChrome>
  );
};

const WorkoutPresetFormScreen: React.FC<WorkoutPresetFormScreenProps> = ({
  navigation,
  route,
}) => {
  if (route.params.mode === 'edit-preset') {
    return <EditPresetMode navigation={navigation} route={route} params={route.params} />;
  }
  return <CreatePresetMode navigation={navigation} route={route} />;
};

export default WorkoutPresetFormScreen;
