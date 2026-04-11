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
import WorkoutEditableExerciseList from '../components/WorkoutEditableExerciseList';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { useWorkoutForm, getWorkoutDraftSubmission } from '../hooks/useWorkoutForm';
import { useSelectedExercise } from '../hooks/useSelectedExercise';
import { useExerciseSetEditing } from '../hooks/useExerciseSetEditing';
import { formatDateLabel } from '../utils/dateUtils';
import { useCreateWorkout, useUpdateWorkout } from '../hooks/useExerciseMutations';
import { usePreferences } from '../hooks/usePreferences';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { addLog } from '../services/LogService';
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

  const [accentPrimary, textMuted, textPrimary, borderSubtle] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-primary',
    '--color-border-subtle',
  ]) as [string, string, string, string];

  const [isNameEditing, setIsNameEditing] = useState(false);

  const {
    state,
    addExercise,
    removeExercise,
    addSet,
    removeSet,
    updateSetField,
    setExerciseRest,
    setName,
    setDate,
    populate,
    populateFromPreset,
    hasDraftData,
    discardDraft,
    exercisesModifiedRef,
  } = useWorkoutForm({ isEditMode, skipDraftLoad, initialDate });

  const {
    activeSetKey,
    activeSetField,
    handleAddExercise,
    handleRemoveExercise,
    handleAddSet,
    activateSet,
    deactivateSet,
  } = useExerciseSetEditing({ addExercise, removeExercise, addSet });

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
  const hasPopulatedRef = useRef(false);
  useEffect(() => {
    if (
      !isEditMode ||
      !session ||
      hasPopulatedRef.current ||
      isPreferencesLoading
    ) {
      return;
    }

    hasPopulatedRef.current = true;
    populate(session, weightUnit as 'kg' | 'lbs');
  }, [isEditMode, session, isPreferencesLoading, populate, weightUnit]);

  // Populate from preset once after preferences load
  const hasPopulatedPresetRef = useRef(false);
  useEffect(() => {
    if (!preset || isEditMode || hasPopulatedPresetRef.current || isPreferencesLoading) return;
    hasPopulatedPresetRef.current = true;
    populateFromPreset(preset, weightUnit as 'kg' | 'lbs', initialDate);
  }, [preset, isEditMode, isPreferencesLoading, populateFromPreset, weightUnit, initialDate]);

  const isInitializingEditForm = isEditMode && !hasPopulatedRef.current;

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
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {isInitializingEditForm ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={accentPrimary} />
        </View>
      ) : (
        <>
          {/* Header */}
          <View className="flex-row items-center px-3 py-3">
            <Button
              variant="ghost"
              onPress={handleCancel}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="py-0 px-0"
            >
              <Icon name="close" size={24} color={accentPrimary} />
            </Button>
          </View>

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

                <WorkoutEditableExerciseList
                  exercises={state.exercises}
                  getImageSource={getImageSource}
                  weightUnit={weightUnit as 'kg' | 'lbs'}
                  activeSetKey={activeSetKey}
                  activeSetField={activeSetField}
                  onActivateSet={activateSet}
                  onDeactivateSet={deactivateSet}
                  onUpdateSetField={updateSetField}
                  onRemoveSet={removeSet}
                  onAddSet={handleAddSet}
                  onRemoveExercise={handleRemoveExercise}
                  onAddExercisePress={openExerciseSearch}
                  onChangeRest={setExerciseRest}
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
                  {isEditMode ? 'Save' : 'Finish'}
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
