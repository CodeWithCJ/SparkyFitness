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
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import FormInput from '../components/FormInput';
import SafeImage from '../components/SafeImage';
import EditableSetRow from '../components/EditableSetRow';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { useWorkoutForm } from '../hooks/useWorkoutForm';
import { useSelectedExercise } from '../hooks/useSelectedExercise';
import { formatDateLabel } from '../utils/dateUtils';
import { useCreateWorkout, useUpdateWorkout } from '../hooks/useExerciseMutations';
import { usePreferences } from '../hooks/usePreferences';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { clearDraft } from '../services/workoutDraftService';
import { weightToKg } from '../utils/unitConversions';
import { addLog } from '../services/LogService';
import type { RootStackScreenProps } from '../types/navigation';
import type {
  WorkoutDraftExercise,
} from '../hooks/useWorkoutForm';
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

  // Track which set is currently being edited: "exerciseClientId:setClientId"
  const [activeSetKey, setActiveSetKey] = useState<string | null>(null);
  const [activeSetField, setActiveSetField] = useState<'weight' | 'reps'>('weight');
  const [isNameEditing, setIsNameEditing] = useState(false);

  const dismissEditing = useCallback(() => {
    if (activeSetKey) setActiveSetKey(null);
    Keyboard.dismiss();
  }, [activeSetKey]);

  const {
    state,
    addExercise,
    removeExercise,
    addSet,
    removeSet,
    updateSetField,
    setName,
    setDate,
    populate,
    populateFromPreset,
    hasDraftData,
    exercisesModifiedRef,
  } = useWorkoutForm({ isEditMode, skipDraftLoad, initialDate });

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

  const handleAddExercise = useCallback((exercise: Parameters<typeof addExercise>[0]) => {
    const { exerciseClientId, setClientId } = addExercise(exercise);
    setActiveSetKey(`${exerciseClientId}:${setClientId}`);
  }, [addExercise]);

  useSelectedExercise(route.params, handleAddExercise);

  const handleCancel = useCallback(() => {
    if (!isEditMode && !hasDraftData) {
      clearDraft();
    }
    navigation.goBack();
  }, [isEditMode, hasDraftData, navigation]);

  const buildExercisesPayload = useCallback(
    (exercisesWithSets: WorkoutDraftExercise[]) => {
      return exercisesWithSets.map((exercise, index) => ({
        exercise_id: exercise.exerciseId,
        sort_order: index,
        duration_minutes: 0,
        sets: exercise.sets.map((set, setIndex) => {
          const weight = parseFloat(set.weight);
          const reps = parseInt(set.reps, 10);
          return {
            set_number: setIndex + 1,
            weight: isNaN(weight) ? null : weightToKg(weight, weightUnit),
            reps: isNaN(reps) ? null : reps,
          };
        }),
      }));
    },
    [weightUnit],
  );

  const handleFinish = useCallback(() => {
    const exercisesWithSets = state.exercises.filter(e => e.sets.length > 0);
    if (exercisesWithSets.length === 0) {
      Toast.show({ type: 'error', text1: 'Add an Exercise', text2: 'Add at least one exercise with a set before saving.' });
      return;
    }

    const name = state.name.trim() || 'Workout';
    const alertTitle = isEditMode ? 'Save Changes?' : 'Save Workout?';
    const alertMessage = `Save "${name}" with ${exercisesWithSets.length} exercise(s)?`;

    Alert.alert(alertTitle, alertMessage, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Save',
        onPress: async () => {
          try {
            if (isEditMode && session) {
              const payload: UpdatePresetSessionRequest = {
                name,
                entry_date: state.entryDate,
                ...(exercisesModifiedRef.current
                  ? { exercises: buildExercisesPayload(exercisesWithSets) }
                  : {}),
              };
              await updateSession({ id: session.id, payload });
              invalidateUpdateCache(state.entryDate);
              navigation.pop(2);
            } else {
              const payload: CreatePresetSessionRequest = {
                name,
                entry_date: state.entryDate,
                source: 'sparky',
                exercises: buildExercisesPayload(exercisesWithSets),
              };
              await createSession(payload);
              await clearDraft();
              invalidateCreateCache(state.entryDate);
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
    state,
    isEditMode,
    session,
    exercisesModifiedRef,
    buildExercisesPayload,
    createSession,
    updateSession,
    invalidateCreateCache,
    invalidateUpdateCache,
    navigation,
    popCount,
  ]);

  const handleRemoveExercise = useCallback(
    (exercise: WorkoutDraftExercise) => {
      const hasData = exercise.sets.some(s => s.weight || s.reps);
      if (hasData) {
        Alert.alert(
          'Remove Exercise?',
          `Remove "${exercise.exerciseName}" and all its sets?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: () => removeExercise(exercise.clientId),
            },
          ],
        );
      } else {
        removeExercise(exercise.clientId);
      }
    },
    [removeExercise],
  );

  const handleAddSet = useCallback(
    (exerciseClientId: string) => {
      const newSetId = addSet(exerciseClientId);
      if (newSetId) {
        setActiveSetKey(`${exerciseClientId}:${newSetId}`);
      }
    },
    [addSet],
  );

  const renderExerciseSection = (exercise: WorkoutDraftExercise) => (
    <View key={exercise.clientId} className="mb-4">
      <View className="flex-row items-start justify-between mb-1">
        <SafeImage
          source={exercise.images?.[0] ? getImageSource(exercise.images[0]) : null}
          style={{ width: 48, height: 48, borderRadius: 8, marginRight: 12, marginTop: 2, opacity: 0.8 }}
        />
        <View className="flex-1 mr-2">
          <Text className="text-base font-semibold text-text-primary">
            {exercise.exerciseName}
          </Text>
          <Text className="text-xs text-text-muted mt-0.5">
            {[exercise.exerciseCategory, weightUnit].filter(Boolean).join(' \u00b7 ')}
          </Text>
        </View>
        <Button
          variant="ghost"
          onPress={() => handleRemoveExercise(exercise)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="py-0 px-0"
        >
          <Icon name="close" size={20} color={textMuted} />
        </Button>
      </View>

      {exercise.sets.length > 0 && (
        <View className="mt-1">
          <View className="flex-row items-center py-1 mb-1">
            <Text className="text-xs font-semibold text-text-muted w-10 text-center">Set</Text>
            <Text className="text-xs font-semibold text-text-muted flex-1 text-center">Weight</Text>
            <Text className="text-xs font-semibold text-text-muted flex-1 text-center">Reps</Text>
            <View style={{ width: 18 }} />
          </View>
          {exercise.sets.map((set, index) => {
            const setKey = `${exercise.clientId}:${set.clientId}`;
            const isLastSet = index === exercise.sets.length - 1;
            return (
              <EditableSetRow
                key={set.clientId}
                set={set}
                setNumber={index + 1}
                isActive={activeSetKey === setKey}
                initialFocusField={activeSetField}
                weightUnit={weightUnit}
                onActivate={(field) => {
                  setActiveSetField(field ?? 'weight');
                  setActiveSetKey(setKey);
                }}
                onDeactivate={() => setActiveSetKey(null)}
                onUpdateField={(field, value) => updateSetField(exercise.clientId, set.clientId, field, value)}
                onRemove={() => removeSet(exercise.clientId, set.clientId)}
                onAdvance={isLastSet ? () => handleAddSet(exercise.clientId) : undefined}
              />
            );
          })}
        </View>
      )}

      <TouchableOpacity
        className="flex-row items-center self-start py-2 px-3 mt-1 rounded-lg"
        onPress={() => handleAddSet(exercise.clientId)}
        activeOpacity={0.6}
      >
        <Icon name="add-circle" size={18} color={accentPrimary} />
        <Text
          className="text-sm font-medium ml-1"
          style={{ color: accentPrimary }}
        >
          Add Set
        </Text>
      </TouchableOpacity>
    </View>
  );

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
              <Pressable onPress={dismissEditing}>
                {/* Workout name */}
                <View className="mb-4">
                  {isNameEditing ? (
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
                  ) : (
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

                {/* Exercises */}
                {state.exercises.map(renderExerciseSection)}

                {/* Add Exercise */}
                <View className="py-4 mb-4">
                  <TouchableOpacity
                    className="flex-row items-center self-center py-2 px-3 rounded-lg"
                    onPress={() => navigation.navigate('ExerciseSearch', { returnKey: route.key })}
                    activeOpacity={0.6}
                  >
                    <Icon name="add-circle" size={20} color={accentPrimary} />
                    <Text className="text-base font-medium ml-2" style={{ color: accentPrimary }}>
                      Add Exercise
                    </Text>
                  </TouchableOpacity>
                </View>

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
