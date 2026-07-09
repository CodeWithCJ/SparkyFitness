import React, { useRef, useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Keyboard,
  Alert,
  ActivityIndicator,
} from 'react-native';
import FadeView from '../components/FadeView';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import FormInput from '../components/FormInput';
import WorkoutFormExerciseList, {
  type WorkoutFormExerciseListHandle,
} from '../components/WorkoutFormExerciseList';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { useWorkoutForm, getWorkoutDraftSubmission } from '../hooks/useWorkoutForm';
import { useSelectedExercise } from '../hooks/useSelectedExercise';
import { useExerciseSetEditing } from '../hooks/useExerciseSetEditing';
import { formatDateLabel } from '../utils/dateUtils';
import { useCreateWorkout, useUpdateWorkout } from '../hooks/useExerciseMutations';
import { usePreferences } from '../hooks/usePreferences';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useScreenHeader, SAVE_LABEL } from '../hooks/useScreenHeader';
import { canReorderDraftExercises } from '../utils/workoutSession';
import { addLog } from '../services/LogService';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';
import type {
  CreatePresetSessionRequest,
  UpdatePresetSessionRequest,
} from '@workspace/shared';

type Props = RootStackScreenProps<'WorkoutAdd'>;

const WorkoutAddScreen: React.FC<Props> = ({ navigation, route }) => {
  const session = route.params?.session;
  const preset = route.params?.preset;
  const initialDate = route.params?.date;
  const popCount = route.params?.popCount ?? 1;
  const isEditMode = !!session;
  const skipDraftLoad =
    !!preset ||
    !!route.params?.skipDraftLoad ||
    (!!route.params?.selectedExercise && !isEditMode);

  const insets = useSafeAreaInsets();
  const calendarSheetRef = useRef<CalendarSheetRef>(null);
  const exerciseListRef = useRef<WorkoutFormExerciseListHandle>(null);

  const [accentPrimary, textMuted, textPrimary, borderSubtle] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-primary',
    '--color-border-subtle',
  ]) as [string, string, string, string];
  const usesNativeHeader = useNativeIOSHeadersActive();

  const [isNameEditing, setIsNameEditing] = useState(false);

  const {
    state,
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
    setName,
    setDate,
    populate,
    populateFromPreset,
    hasDraftData,
    discardDraft,
    exercisesModifiedRef,
  } = useWorkoutForm({ isEditMode, skipDraftLoad, initialDate });

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

  const {
    activeSetKey,
    activeSetField,
    handleAddExercise,
    handleRemoveExercise,
    handleAddSet,
    activateSet,
    deactivateSet,
  } = useExerciseSetEditing({ addExercise: wrappedAddExercise, removeExercise, addSet });

  const isEligibleForPrefill = useCallback(
    (clientId: string) => eligibleIds.has(clientId),
    [eligibleIds],
  );

  const {
    createSession,
    isPending: isCreating,
    invalidateCache: invalidateCreateCache,
  } = useCreateWorkout();
  const {
    updateSession,
    isPending: isUpdating,
    invalidateCache: invalidateUpdateCache,
  } = useUpdateWorkout();
  const isPending = isCreating || isUpdating;
  const { preferences, isLoading: isPreferencesLoading } = usePreferences();
  const weightUnit = preferences?.default_weight_unit ?? 'kg';
  const { getImageSource } = useExerciseImageSource();
  const submission = getWorkoutDraftSubmission(state, weightUnit as 'kg' | 'lbs');

  // Populate the edit form once after the preferences query settles so
  // the initial unit conversion is correct without overwriting later edits.
  // Tracked in state (not a ref) so the loading gate below re-renders
  // deterministically once population completes.
  const [hasPopulatedEdit, setHasPopulatedEdit] = useState(false);
  useEffect(() => {
    if (
      !isEditMode ||
      !session ||
      hasPopulatedEdit ||
      isPreferencesLoading
    ) {
      return;
    }

    // One-time initialization from the async-loaded session; setting state
    // synchronously here is intentional and mirrors the populate() side effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasPopulatedEdit(true);
    populate(session, weightUnit as 'kg' | 'lbs');
  }, [isEditMode, session, isPreferencesLoading, populate, weightUnit, hasPopulatedEdit]);

  // Populate from preset once after preferences load
  const hasPopulatedPresetRef = useRef(false);
  useEffect(() => {
    if (!preset || isEditMode || hasPopulatedPresetRef.current || isPreferencesLoading) return;
    hasPopulatedPresetRef.current = true;
    const populatedIds = populateFromPreset(preset, weightUnit as 'kg' | 'lbs', initialDate);
    // One-time initialization from the async-loaded preset; setting state
    // synchronously here is intentional and mirrors the populateFromPreset side effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEligibleIds(prev => {
      const next = new Set(prev);
      populatedIds.forEach(id => next.add(id));
      return next;
    });
  }, [preset, isEditMode, isPreferencesLoading, populateFromPreset, weightUnit, initialDate]);

  const isInitializingEditForm = isEditMode && !hasPopulatedEdit;

  useSelectedExercise(route.params, handleAddExercise);

  const openExerciseSearch = useCallback(() => {
    navigation.navigate('ExerciseSearch', { returnKey: route.key });
  }, [navigation, route.key]);

  const handleCancel = useCallback(async () => {
    if (!isEditMode && !hasDraftData) {
      await discardDraft();
    }
    navigation.goBack();
  }, [discardDraft, isEditMode, hasDraftData, navigation]);

  const canReorder = canReorderDraftExercises(state.exercises);

  // Footer-save form: Save lives in the always-on sticky footer, so the header
  // carries only the dismiss (a header Save would double the footer's) plus the
  // secondary reorder icon when there are 2+ draggable items.
  const header = useScreenHeader({
    left: {
      kind: 'dismiss',
      onPress: () => void handleCancel(),
      disabled: isPending,
      identifier: 'workout-add-cancel',
    },
    right: canReorder
      ? {
          kind: 'icon',
          sfSymbol: 'arrow.up.arrow.down',
          ionicon: 'swap-vertical',
          role: 'secondary',
          onPress: () => exerciseListRef.current?.openReorder(),
          accessibilityLabel: 'Reorder exercises',
          identifier: 'workout-add-reorder',
        }
      : null,
  });

  const handleFinish = useCallback(() => {
    if (!submission.canSave) {
      Toast.show({ type: 'error', text1: 'Add an Exercise', text2: 'Add at least one exercise with a set before saving.' });
      return;
    }

    const alertTitle = isEditMode ? 'Save Changes?' : 'Save Workout?';
    const alertMessage = `Save "${submission.name}" with ${submission.exerciseCount} exercise(s)?`;

    Alert.alert(alertTitle, alertMessage, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Save',
        onPress: async () => {
          try {
            if (isEditMode && session) {
              const payload: UpdatePresetSessionRequest = {
                name: submission.name,
                entry_date: submission.entryDate,
                ...(exercisesModifiedRef.current
                  ? { exercises: submission.payloadExercises }
                  : {}),
              };
              await updateSession({ id: session.id, payload });
              invalidateUpdateCache(submission.entryDate);
              navigation.pop(2);
            } else {
              const payload: CreatePresetSessionRequest = {
                name: submission.name,
                entry_date: submission.entryDate,
                source: 'sparky',
                exercises: submission.payloadExercises,
              };
              await createSession(payload);
              await discardDraft();
              invalidateCreateCache(submission.entryDate);
              navigation.pop(popCount);
            }
          } catch (error) {
            addLog(`Failed to save workout: ${error}`, 'ERROR');
            Toast.show({ type: 'error', text1: 'Failed to save workout', text2: 'Please try again.' });
          }
        },
      },
    ]);
  }, [
    submission,
    isEditMode,
    session,
    exercisesModifiedRef,
    createSession,
    updateSession,
    invalidateCreateCache,
    invalidateUpdateCache,
    discardDraft,
    navigation,
    popCount,
  ]);

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {isInitializingEditForm ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={accentPrimary} />
        </View>
      ) : (
        <>
          {header}

          <KeyboardAwareScrollView
            contentContainerClassName="px-4"
            bottomOffset={80}
            keyboardShouldPersistTaps="handled"
          >
              <Pressable onPress={() => { deactivateSet(); Keyboard.dismiss(); }}>
                {/* Workout name */}
                <View className="mb-4">
                  {isNameEditing ? (
                    <FadeView key="name-edit">
                      <FormInput
                        className="text-xl font-bold text-text-primary rounded-lg"
                        value={state.name}
                        onChangeText={setName}
                        placeholder="Workout"
                        returnKeyType="done"
                        autoFocus
                        selectTextOnFocus
                        onBlur={() => setIsNameEditing(false)}
                        onSubmitEditing={() => setIsNameEditing(false)}
                      />
                    </FadeView>
                  ) : (
                    <FadeView key="name-view">
                      <TouchableOpacity
                        className="flex-row items-center self-start gap-2"
                        onPress={() => setIsNameEditing(true)}
                        activeOpacity={0.6}
                      >
                        <Text className="text-xl font-bold text-text-primary">
                          {state.name || 'Workout'}
                        </Text>
                        <Icon name="pencil" size={20} color={textMuted} />
                      </TouchableOpacity>
                    </FadeView>
                  )}
                </View>

                {/* Date row */}
                <TouchableOpacity
                  onPress={() => calendarSheetRef.current?.present()}
                  activeOpacity={0.7}
                  className="flex-row items-center mb-4"
                >
                  <Text className="text-text-secondary text-base">Date</Text>
                  <Text className="text-text-primary text-base font-medium mx-1.5">
                    {formatDateLabel(state.entryDate)}
                  </Text>
                  <Icon name="chevron-down" size={12} color={textPrimary} weight="medium" />
                </TouchableOpacity>

                <WorkoutFormExerciseList
                  ref={exerciseListRef}
                  exercises={state.exercises}
                  weightUnit={weightUnit as 'kg' | 'lbs'}
                  getImageSource={getImageSource}
                  activeSetKey={activeSetKey}
                  activeSetField={activeSetField}
                  onActivateSet={activateSet}
                  onDeactivateSet={deactivateSet}
                  updateSetField={updateSetField}
                  updateSetMeta={updateSetMeta}
                  removeSet={removeSet}
                  onAddSet={handleAddSet}
                  onRemoveExercise={handleRemoveExercise}
                  setExerciseRest={setExerciseRest}
                  supersetWith={supersetWith}
                  ungroupExercise={ungroupExercise}
                  onReorderExercises={reorderExercises}
                  onAddExercisePress={openExerciseSearch}
                  onViewExercise={(exercise) =>
                    navigation.navigate('ExerciseDetail', {
                      item: exercise,
                      hideWorkoutActions: true,
                    })
                  }
                  isEligibleForPrefill={isEligibleForPrefill}
                  removeExerciseOnLastSetDelete
                />

                {/* Bottom spacer so content isn't hidden behind footer */}
                <View style={{ height: 80 }} />
              </Pressable>
          </KeyboardAwareScrollView>

          {/* Sticky footer */}
          <View
            className="px-4 py-3"
            style={{
              paddingBottom: Math.max(insets.bottom, 12),
              borderTopWidth: 1,
              borderTopColor: borderSubtle,
            }}
          >
            <Button
              variant="primary"
              onPress={handleFinish}
              disabled={isPending || !hasDraftData}
              className="py-3"
            >
              {isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-sm font-semibold text-center" style={{ color: '#fff' }}>
                  {SAVE_LABEL}
                </Text>
              )}
            </Button>
          </View>

        </>
      )}

      <CalendarSheet
        ref={calendarSheetRef}
        selectedDate={state.entryDate}
        onSelectDate={setDate}
      />
    </View>
  );
};

export default WorkoutAddScreen;
