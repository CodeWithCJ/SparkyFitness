import React, { useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import FormInput from '../components/FormInput';
import ExercisePicker, {
  type ExercisePickerRef,
} from '../components/ExercisePicker';
import { useWorkoutForm } from '../hooks/useWorkoutForm';
import { useCreateWorkout } from '../hooks/useCreateWorkout';
import { useUpdateWorkout } from '../hooks/useUpdateWorkout';
import { usePreferences } from '../hooks/usePreferences';
import { clearDraft } from '../services/workoutDraftService';
import { weightToKg } from '../utils/unitConversions';
import type { RootStackScreenProps } from '../types/navigation';
import type {
  WorkoutDraftExercise,
  WorkoutDraftSet,
} from '../hooks/useWorkoutForm';
import type {
  CreatePresetSessionRequest,
  UpdatePresetSessionRequest,
} from '@workspace/shared';

type Props = RootStackScreenProps<'WorkoutForm'>;

const WorkoutFormScreen: React.FC<Props> = ({ navigation, route }) => {
  const session = route.params?.session;
  const isEditMode = !!session;

  const insets = useSafeAreaInsets();
  const exercisePickerRef = useRef<ExercisePickerRef>(null);

  const [accentPrimary, textMuted, borderSubtle] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-border-subtle',
  ]) as [string, string, string];

  const {
    state,
    addExercise,
    removeExercise,
    addSet,
    removeSet,
    updateSetField,
    setName,
    populate,
    hasDraftData,
    exercisesModifiedRef,
  } = useWorkoutForm({ isEditMode });

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
  const isInitializingEditForm = isEditMode && !hasPopulatedRef.current;

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
      Alert.alert(
        'Add an Exercise',
        'Add at least one exercise with a set before saving.',
      );
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
              navigation.goBack();
            }
          } catch {
            // Error is handled by the mutation's onError
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

  const renderSetRow = (
    exercise: WorkoutDraftExercise,
    set: WorkoutDraftSet,
    index: number,
  ) => (
    <View key={set.clientId} className="flex-row items-center py-1.5 gap-2">
      <Text className="text-sm text-text-muted w-8 text-center">
        {index + 1}
      </Text>
      <FormInput
        style={{ width: 80, textAlign: 'center', paddingTop: 6, paddingBottom: 6, paddingLeft: 8, paddingRight: 8 }}
        value={set.weight}
        onChangeText={(v: string) =>
          updateSetField(exercise.clientId, set.clientId, 'weight', v)
        }
        placeholder={weightUnit}
        keyboardType="decimal-pad"
        returnKeyType="next"
      />
      <Text className="text-sm text-text-muted">×</Text>
      <FormInput
        style={{ width: 60, textAlign: 'center', paddingTop: 6, paddingBottom: 6, paddingLeft: 8, paddingRight: 8 }}
        value={set.reps}
        onChangeText={(v: string) =>
          updateSetField(exercise.clientId, set.clientId, 'reps', v)
        }
        placeholder="reps"
        keyboardType="number-pad"
        returnKeyType="done"
      />
      <TouchableOpacity
        onPress={() => removeSet(exercise.clientId, set.clientId)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        className="ml-auto"
      >
        <Icon name="remove-circle" size={20} color={textMuted} />
      </TouchableOpacity>
    </View>
  );

  const renderExerciseCard = (exercise: WorkoutDraftExercise) => (
    <View key={exercise.clientId} className="bg-surface rounded-xl p-4 mb-3">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-1 mr-2">
          <Text className="text-base font-semibold text-text-primary">
            {exercise.exerciseName}
          </Text>
          {exercise.exerciseCategory && (
            <Text className="text-xs text-text-muted mt-0.5">
              {exercise.exerciseCategory}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => handleRemoveExercise(exercise)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="close" size={20} color={textMuted} />
        </TouchableOpacity>
      </View>

      {/* Set header */}
      <View className="flex-row items-center py-1 gap-2 mb-1">
        <Text className="text-xs font-semibold text-text-muted w-8 text-center">
          Set
        </Text>
        <Text
          className="text-xs font-semibold text-text-muted"
          style={{ width: 80, textAlign: 'center' }}
        >
          Weight
        </Text>
        <View style={{ width: 12 }} />
        <Text
          className="text-xs font-semibold text-text-muted"
          style={{ width: 60, textAlign: 'center' }}
        >
          Reps
        </Text>
      </View>

      {exercise.sets.map((set, index) => renderSetRow(exercise, set, index))}

      <TouchableOpacity
        className="flex-row items-center justify-center py-2 mt-2"
        onPress={() => addSet(exercise.clientId)}
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
          <View className="flex-row items-center justify-between px-4 py-3">
            <TouchableOpacity
              onPress={handleCancel}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="close" size={24} color={accentPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleFinish}
              disabled={isPending || !hasDraftData}
              className="py-1.5 px-4 rounded-lg"
              style={{
                backgroundColor:
                  hasDraftData && !isPending ? accentPrimary : borderSubtle,
              }}
            >
              {isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-white font-semibold text-base">
                  {isEditMode ? 'Save Changes' : 'Finish'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            className="flex-1"
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={insets.top}
          >
            <ScrollView
              className="flex-1 px-4"
              keyboardShouldPersistTaps="handled"
            >
              {/* Workout name */}
              <FormInput
                className="text-xl font-bold text-text-primary mb-4"
                style={{ backgroundColor: 'transparent', borderWidth: 0, paddingLeft: 0 }}
                value={state.name}
                onChangeText={setName}
                placeholder="Workout"
                returnKeyType="done"
              />

              {/* Exercise cards */}
              {state.exercises.map(renderExerciseCard)}

              {/* Add Exercise button */}
              <TouchableOpacity
                className="rounded-xl py-4 mb-6 items-center"
                style={{
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: borderSubtle,
                }}
                onPress={() => exercisePickerRef.current?.present()}
                activeOpacity={0.7}
              >
                <Icon name="add-circle" size={24} color={accentPrimary} />
                <Text
                  className="text-base font-medium mt-1"
                  style={{ color: accentPrimary }}
                >
                  Add Exercise
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>

          <ExercisePicker
            ref={exercisePickerRef}
            onSelectExercise={addExercise}
          />
        </>
      )}
    </View>
  );
};

export default WorkoutFormScreen;
