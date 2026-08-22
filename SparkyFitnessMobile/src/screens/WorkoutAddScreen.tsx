import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Keyboard,
  Alert,
} from 'react-native';
import FadeView from '../components/FadeView';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import FormInput from '../components/FormInput';
import StatusView from '../components/StatusView';
import WorkoutFormExerciseList, {
  type WorkoutFormExerciseListHandle,
} from '../components/WorkoutFormExerciseList';
import { useSetEditAccessoryBar } from '../components/SetRowChrome';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import DateSelectRow from '../components/DateSelectRow';
import { FooterSaveBar } from '../components/FormScreenChrome';
import { useWorkoutForm, getWorkoutDraftSubmission } from '../hooks/useWorkoutForm';
import { useSelectedExercise } from '../hooks/useSelectedExercise';
import { useExerciseSetEditing } from '../hooks/useExerciseSetEditing';
import { addDays, getTodayDate } from '../utils/dateUtils';
import { useDiaryDateStore } from '../stores/diaryDateStore';
import { useCreateWorkout, useUpdateWorkout } from '../hooks/useExerciseMutations';
import { usePreferences } from '../hooks/usePreferences';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useScreenHeader, SAVE_LABEL, SAVING_LABEL, type HeaderItem } from '../hooks/useScreenHeader';
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
  const { t } = useTranslation();
  const session = route.params?.session;
  const preset = route.params?.preset;
  const initialDate = route.params?.date ?? useDiaryDateStore.getState().selectedDate;
  const popCount = route.params?.popCount ?? 1;
  const isEditMode = !!session;
  const skipDraftLoad =
    !!preset ||
    !!route.params?.skipDraftLoad ||
    (!!route.params?.selectedExercise && !isEditMode);

  const insets = useSafeAreaInsets();
  const calendarSheetRef = useRef<CalendarSheetRef>(null);
  const exerciseListRef = useRef<WorkoutFormExerciseListHandle>(null);

  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];
  const usesNativeHeader = useNativeIOSHeadersActive();

  const [isNameEditing, setIsNameEditing] = useState(false);

  const {
    state,
    addExercise,
    removeExercise,
    replaceExercise,
    clearExerciseCompletions,
    addSet,
    removeSet,
    updateSetField,
    updateSetMeta,
    setExerciseRest,
    setExerciseNotes,
    supersetWith,
    ungroupExercise,
    reorderExercises,
    setName,
    setDate: setFormDate,
    populate,
    populateFromPreset,
    hasDraftData,
    discardDraft,
    exercisesModifiedRef,
  } = useWorkoutForm({ isEditMode, skipDraftLoad, initialDate });
  // Logging always targets the Dashboard/Diary date; changing it here should
  // carry back so the other views stay on the same day, not just inherit it.
  const setDate = useCallback((date: string) => {
    setFormDate(date);
    useDiaryDateStore.getState().setSelectedDate(date);
  }, [setFormDate]);

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

  const {
    activeSetKey,
    activeSetField,
    handleAddExercise,
    handleRemoveExercise,
    handleAddSet,
    activateSet,
    deactivateSet,
    setReplaceTarget,
  } = useExerciseSetEditing({
    addExercise: wrappedAddExercise,
    removeExercise,
    addSet,
    replaceExercise: wrappedReplaceExercise,
  });

  // Sticky Done/Next bar for the focused set cell, on both platforms.
  const { onRegisterAccessoryHandle, accessoryBar } = useSetEditAccessoryBar({
    activeSetKey,
    activeSetField,
    onDeactivateSet: deactivateSet,
  });

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
  const distanceUnit = (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const { getImageSource } = useExerciseImageSource();
  const submission = getWorkoutDraftSubmission(state, weightUnit as 'kg' | 'lbs', distanceUnit);

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
    setHasPopulatedEdit(true);
    populate(session, weightUnit as 'kg' | 'lbs', distanceUnit);
  }, [isEditMode, session, isPreferencesLoading, populate, weightUnit, distanceUnit, hasPopulatedEdit]);

  // Populate from preset once after preferences load
  const hasPopulatedPresetRef = useRef(false);
  useEffect(() => {
    if (!preset || isEditMode || hasPopulatedPresetRef.current || isPreferencesLoading) return;
    hasPopulatedPresetRef.current = true;
    const populatedIds = populateFromPreset(
      preset,
      weightUnit as 'kg' | 'lbs',
      distanceUnit,
      initialDate,
    );
    // One-time initialization from the async-loaded preset; setting state
    // synchronously here is intentional and mirrors the populateFromPreset side effect.
    setEligibleIds(prev => {
      const next = new Set(prev);
      populatedIds.forEach(id => next.add(id));
      return next;
    });
  }, [preset, isEditMode, isPreferencesLoading, populateFromPreset, weightUnit, distanceUnit, initialDate]);

  const isInitializingEditForm = isEditMode && !hasPopulatedEdit;

  useSelectedExercise(route.params, handleAddExercise);

  const openExerciseSearch = useCallback(() => {
    // Plain Add: drop any pending replace target so a cancelled replace can't
    // misroute this add.
    setReplaceTarget(null);
    navigation.navigate('ExerciseSearch', { returnKey: route.key });
  }, [setReplaceTarget, navigation, route.key]);

  // ⋮ "Replace exercise": the next ExerciseSearch return swaps this entry in
  // place instead of appending.
  const handleReplaceExercise = useCallback(
    (clientId: string) => {
      setReplaceTarget(clientId);
      navigation.navigate('ExerciseSearch', { returnKey: route.key });
    },
    [setReplaceTarget, navigation, route.key],
  );

  const handleCancel = useCallback(async () => {
    if (!isEditMode && !hasDraftData) {
      await discardDraft();
    }
    navigation.goBack();
  }, [discardDraft, isEditMode, hasDraftData, navigation]);

  const canReorder = canReorderDraftExercises(state.exercises);

  const handleFinish = useCallback(() => {
    if (!submission.canSave) {
      Toast.show({ type: 'error', text1: t('workoutAdd.addExercise', { defaultValue: 'Add an Exercise' }), text2: t('workoutAdd.addExerciseMessage', { defaultValue: 'Add at least one exercise with a set before saving.' }) });
      return;
    }

    const alertTitle = isEditMode ? t('workoutAdd.saveChangesTitle', { defaultValue: 'Save Changes?' }) : t('workoutAdd.saveWorkoutTitle', { defaultValue: 'Save Workout?' });
    const alertMessage = `Save "${submission.name}" with ${submission.exerciseCount} exercise(s)?`;

    Alert.alert(alertTitle, alertMessage, [
      { text: t('workoutAdd.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
      {
        text: t('workoutAdd.save', { defaultValue: 'Save' }),
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
            Toast.show({ type: 'error', text1: t('workoutAdd.saveFailed', { defaultValue: 'Failed to save workout' }), text2: t('workoutAdd.tryAgain', { defaultValue: 'Please try again.' }) });
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
    t,
  ]);

  const saveItem: HeaderItem = {
    kind: 'primary',
    label: SAVE_LABEL,
    busyLabel: SAVING_LABEL,
    busy: isPending,
    disabled: isPending || !hasDraftData,
    placement: 'native-only',
    onPress: handleFinish,
    identifier: 'workout-add-save',
  };
  const header = useScreenHeader({
    left: {
      kind: 'dismiss',
      onPress: () => void handleCancel(),
      disabled: isPending,
      identifier: 'workout-add-cancel',
    },
    right: canReorder
      ? [
          {
            kind: 'icon',
            sfSymbol: 'arrow.up.arrow.down',
            ionicon: 'swap-vertical',
            role: 'secondary',
            onPress: () => exerciseListRef.current?.openReorder(),
            accessibilityLabel: t('workoutAdd.reorderExercises', { defaultValue: 'Reorder exercises' }),
            identifier: 'workout-add-reorder',
          },
          saveItem,
        ]
      : saveItem,
  });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      {isInitializingEditForm ? (
        <StatusView loading />
      ) : (
        <>
          <KeyboardAwareScrollView
            contentContainerClassName="px-4"
            bottomOffset={80}
            keyboardShouldPersistTaps="handled"
            // Set-row taps remount the focused input; stop the keyboard-hide
            // restore scroll so the refocus lands on the tapped cell (see
            // ActiveWorkoutScreen's scroll view).
            disableScrollOnKeyboardHide
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
                        placeholder={t('workoutAdd.workoutPlaceholder', { defaultValue: 'Workout' })}
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
                          {state.name || t('workoutAdd.workoutPlaceholder', { defaultValue: 'Workout' })}
                        </Text>
                        <Icon name="pencil" size={20} color={textMuted} />
                      </TouchableOpacity>
                    </FadeView>
                  )}
                </View>

                {/* Date row */}
                <View className="flex-row items-center mb-4">
                  <DateSelectRow
                    date={state.entryDate}
                    onPress={() => calendarSheetRef.current?.present()}
                  />

                  {state.entryDate === getTodayDate() ? (
                    <TouchableOpacity activeOpacity={0.7}
                      className="flex-row items-center mx-4"
                      onPress={() => setDate(addDays(getTodayDate(), -1))}
                    >
                      <Text className="text-text-link text-sm font-medium mx-1.5">{t('workoutAdd.useYesterday', { defaultValue: 'Use Yesterday' })}</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity activeOpacity={0.7}
                      className="flex-row items-center mx-4"
                      onPress={() => setDate(getTodayDate())}
                    >
                      <Text className="text-text-link text-sm font-medium mx-1.5">{t('workoutAdd.useToday', { defaultValue: 'Use Today' })}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Pull back part of the scroll container's px-4 so the cards
                    sit at the same 12px inset as the active workout screen
                    (px-3). */}
                <View className="-mx-1">
                  <WorkoutFormExerciseList
                    ref={exerciseListRef}
                    exercises={state.exercises}
                    weightUnit={weightUnit as 'kg' | 'lbs'}
                    distanceUnit={distanceUnit}
                    getImageSource={getImageSource}
                    excludePresetEntryId={session?.id}
                    activeSetKey={activeSetKey}
                    activeSetField={activeSetField}
                    onActivateSet={activateSet}
                    onDeactivateSet={deactivateSet}
                    onRegisterAccessoryHandle={onRegisterAccessoryHandle}
                    updateSetField={updateSetField}
                    updateSetMeta={updateSetMeta}
                    removeSet={removeSet}
                    onAddSet={handleAddSet}
                    onRemoveExercise={handleRemoveExercise}
                    setExerciseRest={setExerciseRest}
                    setExerciseNotes={setExerciseNotes}
                    onReplaceExercise={handleReplaceExercise}
                    clearExerciseCompletions={clearExerciseCompletions}
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
                    showCompletion
                    removeExerciseOnLastSetDelete
                  />
                </View>

                {/* Bottom spacer so content isn't hidden behind footer */}
                <View style={{ height: 80 }} />
              </Pressable>
          </KeyboardAwareScrollView>

          {/* Sticky footer; the native-header path shows Save in the nav bar */}
          {!usesNativeHeader && (
            <FooterSaveBar
              onPress={handleFinish}
              disabled={isPending || !hasDraftData}
              busy={isPending}
            />
          )}

          {accessoryBar}
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
