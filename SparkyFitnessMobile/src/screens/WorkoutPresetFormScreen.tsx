import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import Toast from 'react-native-toast-message';
import { CommonActions } from '@react-navigation/native';
import FormInput from '../components/FormInput';
import FormScreenChrome from '../components/FormScreenChrome';
import WorkoutFormExerciseList, {
  type WorkoutFormExerciseListHandle,
} from '../components/WorkoutFormExerciseList';
import { useSetEditAccessoryBar, type SetRowAccessoryHandle } from '../components/SetRowChrome';
import {
  useCreateWorkoutPreset,
  useUpdateWorkoutPreset,
  usePreferences,
} from '../hooks';
import { useExerciseSetEditing } from '../hooks/useExerciseSetEditing';
import { useSelectedExercise } from '../hooks/useSelectedExercise';
import { useWorkoutPresetForm, type PresetDraft } from '../hooks/useWorkoutPresetForm';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { type HeaderItem } from '../hooks/useScreenHeader';
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

type CreateParams = Extract<RootStackParamList['WorkoutPresetForm'], { mode: 'create-preset' }>;
type EditParams = Extract<RootStackParamList['WorkoutPresetForm'], { mode: 'edit-preset' }>;

type WorkoutPresetFormScreenProps = RootStackScreenProps<'WorkoutPresetForm'>;
type Navigation = WorkoutPresetFormScreenProps['navigation'];
type Route = WorkoutPresetFormScreenProps['route'];

interface PresetFormBodyProps {
  state: PresetDraft;
  setName: (s: string) => void;
  setDescription: (s: string) => void;
  weightUnit: 'kg' | 'lbs';
  distanceUnit: 'km' | 'miles';
  exerciseSetEditing: ReturnType<typeof useExerciseSetEditing>;
  updateSetField: (
    exerciseClientId: string,
    setClientId: string,
    field: 'weight' | 'reps' | 'duration' | 'distance',
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
  onReplaceExercise: (clientId: string) => void;
  onDuplicateExercise: (clientId: string) => void;
  onRegisterAccessoryHandle: (key: string, handle: SetRowAccessoryHandle | null) => void;
  onViewExercise: (exercise: Exercise) => void;
  listRef: React.Ref<WorkoutFormExerciseListHandle>;
}

const PresetFormBody: React.FC<PresetFormBodyProps> = ({
  state,
  setName,
  setDescription,
  weightUnit,
  distanceUnit,
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
  onReplaceExercise,
  onDuplicateExercise,
  onRegisterAccessoryHandle,
  onViewExercise,
  listRef,
}) => {
  const { t } = useTranslation();
  const { getImageSource } = useExerciseImageSource();

  return (
    <View className="gap-4">
      <View className="gap-1.5">
        <Text className="text-text-secondary text-sm font-medium">{t('workoutPresetForm.nameRequired', { defaultValue: 'Name *' })}</Text>
        <FormInput
          placeholder={t('workoutPresetForm.namePlaceholder', { defaultValue: 'e.g. Push Day' })}
          value={state.name}
          onChangeText={setName}
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          returnKeyType="next"
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-text-secondary text-sm font-medium">{t('workoutPresetForm.description', { defaultValue: 'Description' })}</Text>
        <FormInput
          placeholder={t('workoutPresetForm.descriptionPlaceholder', { defaultValue: 'Optional notes about this routine' })}
          value={state.description}
          onChangeText={setDescription}
          multiline
          numberOfLines={2}
          style={{ minHeight: 48, textAlignVertical: 'top' }}
        />
      </View>

      {/* Pull back part of FormScreenChrome's px-4 so the cards sit at the
          same 12px inset as the active workout screen (px-3). */}
      <View className="-mx-1">
        <WorkoutFormExerciseList
          ref={listRef}
          exercises={state.exercises}
          weightUnit={weightUnit}
          distanceUnit={distanceUnit}
          getImageSource={getImageSource}
          activeSetKey={exerciseSetEditing.activeSetKey}
          activeSetField={exerciseSetEditing.activeSetField}
          onActivateSet={exerciseSetEditing.activateSet}
          onDeactivateSet={exerciseSetEditing.deactivateSet}
          onRegisterAccessoryHandle={onRegisterAccessoryHandle}
          updateSetField={updateSetField}
          updateSetMeta={updateSetMeta}
          removeSet={removeSet}
          onAddSet={exerciseSetEditing.handleAddSet}
          onRemoveExercise={exerciseSetEditing.handleRemoveExercise}
          setExerciseRest={setExerciseRest}
          onReplaceExercise={onReplaceExercise}
          onDuplicateExercise={onDuplicateExercise}
          supersetWith={supersetWith}
          ungroupExercise={ungroupExercise}
          onReorderExercises={reorderExercises}
          onAddExercisePress={onAddExercisePress}
          onViewExercise={onViewExercise}
          isEligibleForPrefill={isEligibleForPrefill}
          rpeEditable={false}
        />
      </View>
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
  params: CreateParams;
}

const CreatePresetMode: React.FC<CreatePresetModeProps> = ({ navigation, route, params }) => {
  const { t } = useTranslation();
  const { sourceSession } = params;
  const { preferences, isLoading: isPreferencesLoading } = usePreferences();
  const weightUnit = getWeightUnit(preferences?.default_weight_unit);
  const distanceUnit = (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';

  const {
    state,
    setName,
    setDescription,
    addExercise,
    removeExercise,
    replaceExercise,
    duplicateExercise,
    addSet,
    removeSet,
    updateSetField,
    updateSetMeta,
    setExerciseRest,
    supersetWith,
    ungroupExercise,
    reorderExercises,
    populateFromSession,
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
  // A replaced exercise is effectively freshly added: mark it prefill-eligible
  // so its empty set seeds from the new exercise's history.
  const wrappedReplaceExercise = useCallback(
    (clientId: string, exercise: Parameters<typeof replaceExercise>[1]) => {
      const result = replaceExercise(clientId, exercise);
      setEligibleIds(prev => {
        const next = new Set(prev);
        next.add(clientId);
        return next;
      });
      return result;
    },
    [replaceExercise],
  );
  const isEligibleForPrefill = useCallback(
    (clientId: string) => eligibleIds.has(clientId),
    [eligibleIds],
  );

  const exerciseSetEditing = useExerciseSetEditing({
    addExercise: wrappedAddExercise,
    removeExercise,
    addSet,
    replaceExercise: wrappedReplaceExercise,
  });
  useSelectedExercise(route.params, exerciseSetEditing.handleAddExercise);

  // Sticky Done/Next bar for the focused set cell, on both platforms.
  const { onRegisterAccessoryHandle, accessoryBar } = useSetEditAccessoryBar({
    activeSetKey: exerciseSetEditing.activeSetKey,
    activeSetField: exerciseSetEditing.activeSetField,
    onDeactivateSet: exerciseSetEditing.deactivateSet,
    rpeEnabled: false,
  });

  // "Save as preset" from a logged workout: seed the form from the session
  // once preferences resolve (the weight unit drives the kg→display mapping).
  const hasPopulatedRef = useRef(false);
  useEffect(() => {
    if (sourceSession == null || hasPopulatedRef.current || isPreferencesLoading) return;
    hasPopulatedRef.current = true;
    populateFromSession(sourceSession, weightUnit, distanceUnit);
  }, [sourceSession, isPreferencesLoading, populateFromSession, weightUnit, distanceUnit]);

  const { createPresetAsync, isPending } = useCreateWorkoutPreset();

  const exerciseListRef = useRef<WorkoutFormExerciseListHandle>(null);
  const reorderAction: HeaderItem | null = canReorderDraftExercises(state.exercises)
    ? {
        kind: 'icon',
        sfSymbol: 'arrow.up.arrow.down',
        ionicon: 'swap-vertical',
        role: 'secondary',
        onPress: () => exerciseListRef.current?.openReorder(),
        accessibilityLabel: t('workoutPresetForm.reorderExercises', { defaultValue: 'Reorder exercises' }),
        identifier: 'preset-create-reorder',
      }
    : null;

  const openExerciseSearch = () => {
    // Plain Add: drop any pending replace target so a cancelled replace can't
    // misroute this add.
    exerciseSetEditing.setReplaceTarget(null);
    navigation.navigate('ExerciseSearch', { returnKey: route.key });
  };

  // ⋮ "Replace exercise": the next ExerciseSearch return swaps this entry in
  // place instead of appending.
  const handleReplaceExercise = (clientId: string) => {
    exerciseSetEditing.setReplaceTarget(clientId);
    navigation.navigate('ExerciseSearch', { returnKey: route.key });
  };

  const handleSave = async () => {
    const trimmedName = state.name.trim();
    if (!trimmedName) {
      Toast.show({
        type: 'error',
        text1: t('workoutPresetForm.errors.missingName', { defaultValue: 'Missing name' }),
        text2: t('workoutPresetForm.errors.nameRequired', { defaultValue: 'Please enter a name for this preset.' }),
      });
      return;
    }

    const exercisesWithSets = state.exercises.filter(e => e.sets.length > 0);
    if (exercisesWithSets.length === 0) {
      Toast.show({
        type: 'error',
        text1: t('workoutPresetForm.errors.addExercise', { defaultValue: 'Add an exercise' }),
        text2: t('workoutPresetForm.errors.addExerciseSet', { defaultValue: 'Add at least one exercise with a set before saving.' }),
      });
      return;
    }

    const trimmedDescription = state.description.trim();
    const payload: WorkoutPresetCreatePayload = {
      name: trimmedName,
      description: trimmedDescription.length > 0 ? trimmedDescription : null,
      is_public: false,
      exercises: buildPresetExercisesPayload(state.exercises, weightUnit, distanceUnit),
    };

    try {
      const created = await createPresetAsync(payload);
      Toast.show({ type: 'success', text1: t('workoutPresetForm.created', { defaultValue: 'Workout preset created' }) });
      navigation.replace('WorkoutPresetDetail', { preset: created });
    } catch {
      // Error toast handled in useCreateWorkoutPreset.
    }
  };
  return (
    <FormScreenChrome
      title={t('workoutPresetForm.newTitle', { defaultValue: 'New Preset' })}
      saveLabel={t('common.save', { defaultValue: 'Save' })}
      savingLabel={t('common.saving', { defaultValue: 'Saving…' })}
      isSaving={isPending}
      headerAction={reorderAction}
      keyboardAccessory={accessoryBar}
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
        distanceUnit={distanceUnit}
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
        onReplaceExercise={handleReplaceExercise}
        onDuplicateExercise={duplicateExercise}
        onRegisterAccessoryHandle={onRegisterAccessoryHandle}
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
  distanceUnit: 'km' | 'miles';
}): WorkoutPresetUpdatePayload {
  const { state, initialPreset, initialDescription, exercisesModified, weightUnit, distanceUnit } =
    args;
  const payload: WorkoutPresetUpdatePayload = {};

  const trimmedName = state.name.trim();
  if (trimmedName !== initialPreset.name) {
    payload.name = trimmedName;
  }

  const trimmedDesc = state.description.trim();
  if (trimmedDesc !== initialDescription.trim()) {
    payload.description = trimmedDesc;
  }

  // is_public is intentionally never sent: the form has no UI, and sending false
  // would unshare a previously-public preset (server uses COALESCE).

  if (exercisesModified) {
    payload.exercises = buildPresetExercisesPayload(state.exercises, weightUnit, distanceUnit);
  }

  return payload;
}

const EditPresetMode: React.FC<EditPresetModeProps> = ({ navigation, route, params }) => {
  const { t } = useTranslation();
  const { preset, returnKey } = params;
  const { preferences, isLoading: isPreferencesLoading } = usePreferences();
  const weightUnit = getWeightUnit(preferences?.default_weight_unit);
  const distanceUnit = (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';

  const {
    state,
    setName,
    setDescription,
    addExercise,
    removeExercise,
    replaceExercise,
    duplicateExercise,
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
  // A replaced exercise is effectively freshly added: mark it prefill-eligible
  // so its empty set seeds from the new exercise's history.
  const wrappedReplaceExercise = useCallback(
    (clientId: string, exercise: Parameters<typeof replaceExercise>[1]) => {
      const result = replaceExercise(clientId, exercise);
      setEligibleIds(prev => {
        const next = new Set(prev);
        next.add(clientId);
        return next;
      });
      return result;
    },
    [replaceExercise],
  );
  const isEligibleForPrefill = useCallback(
    (clientId: string) => eligibleIds.has(clientId),
    [eligibleIds],
  );

  const exerciseSetEditing = useExerciseSetEditing({
    addExercise: wrappedAddExercise,
    removeExercise,
    addSet,
    replaceExercise: wrappedReplaceExercise,
  });
  useSelectedExercise(route.params, exerciseSetEditing.handleAddExercise);

  // Sticky Done/Next bar for the focused set cell, on both platforms.
  const { onRegisterAccessoryHandle, accessoryBar } = useSetEditAccessoryBar({
    activeSetKey: exerciseSetEditing.activeSetKey,
    activeSetField: exerciseSetEditing.activeSetField,
    onDeactivateSet: exerciseSetEditing.deactivateSet,
    rpeEnabled: false,
  });

  const hasPopulatedRef = useRef(false);
  useEffect(() => {
    if (hasPopulatedRef.current || isPreferencesLoading) return;
    hasPopulatedRef.current = true;
    populateFromPreset(preset, weightUnit, distanceUnit);
  }, [isPreferencesLoading, populateFromPreset, preset, weightUnit, distanceUnit]);

  const { updatePresetAsync, isPending } = useUpdateWorkoutPreset();

  const exerciseListRef = useRef<WorkoutFormExerciseListHandle>(null);
  const reorderAction: HeaderItem | null = canReorderDraftExercises(state.exercises)
    ? {
        kind: 'icon',
        sfSymbol: 'arrow.up.arrow.down',
        ionicon: 'swap-vertical',
        role: 'secondary',
        onPress: () => exerciseListRef.current?.openReorder(),
        accessibilityLabel: t('workoutPresetForm.reorderExercises', { defaultValue: 'Reorder exercises' }),
        identifier: 'preset-edit-reorder',
      }
    : null;

  const openExerciseSearch = () => {
    // Plain Add: drop any pending replace target so a cancelled replace can't
    // misroute this add.
    exerciseSetEditing.setReplaceTarget(null);
    navigation.navigate('ExerciseSearch', { returnKey: route.key });
  };

  // ⋮ "Replace exercise": the next ExerciseSearch return swaps this entry in
  // place instead of appending.
  const handleReplaceExercise = (clientId: string) => {
    exerciseSetEditing.setReplaceTarget(clientId);
    navigation.navigate('ExerciseSearch', { returnKey: route.key });
  };

  const handleSave = async () => {
    const trimmedName = state.name.trim();
    if (!trimmedName) {
      Toast.show({
        type: 'error',
        text1: t('workoutPresetForm.errors.missingName', { defaultValue: 'Missing name' }),
        text2: t('workoutPresetForm.errors.nameRequired', { defaultValue: 'Please enter a name for this preset.' }),
      });
      return;
    }

    // Edit mode intentionally skips the "at least one set" check that create
    // mode enforces: the server allows preset exercises with no sets, and a
    // user editing only the name/description should not be forced to add one.

    const payload = buildPresetEditPayload({
      state,
      initialPreset: preset,
      initialDescription: initialDescriptionRef.current,
      exercisesModified: exercisesModifiedRef.current,
      weightUnit,
      distanceUnit,
    });

    if (Object.keys(payload).length === 0) {
      navigation.goBack();
      return;
    }

    try {
      const updated = await updatePresetAsync({ id: preset.id, payload });
      Toast.show({ type: 'success', text1: t('workoutPresetForm.updated', { defaultValue: 'Workout preset updated' }) });
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
      title={t('workoutPresetForm.editTitle', { defaultValue: 'Edit Preset' })}
      saveLabel={t('common.save', { defaultValue: 'Save' })}
      savingLabel={t('common.saving', { defaultValue: 'Saving…' })}
      isSaving={isPending}
      headerAction={reorderAction}
      keyboardAccessory={accessoryBar}
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
        distanceUnit={distanceUnit}
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
        onReplaceExercise={handleReplaceExercise}
        onDuplicateExercise={duplicateExercise}
        onRegisterAccessoryHandle={onRegisterAccessoryHandle}
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
  return <CreatePresetMode navigation={navigation} route={route} params={route.params} />;
};

export default WorkoutPresetFormScreen;
