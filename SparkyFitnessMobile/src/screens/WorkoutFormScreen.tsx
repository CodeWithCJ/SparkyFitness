import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
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
import ExercisePicker, { type ExercisePickerRef } from '../components/ExercisePicker';
import { useWorkoutForm } from '../hooks/useWorkoutForm';
import { useCreateWorkoutSession } from '../hooks/useCreateWorkoutSession';
import { usePreferences } from '../hooks/usePreferences';
import { clearSessionDraft } from '../services/workoutDraftService';
import { weightToKg } from '../utils/unitConversions';
import type { RootStackScreenProps } from '../types/navigation';
import type { WorkoutDraftExercise, WorkoutDraftSet } from '../hooks/useWorkoutForm';
import type { CreatePresetSessionRequest } from '@workspace/shared';

type Props = RootStackScreenProps<'WorkoutForm'>;

const WorkoutFormScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const exercisePickerRef = useRef<ExercisePickerRef>(null);

  const [accentPrimary, textMuted, borderSubtle, raisedBg] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-border-subtle',
    '--color-raised',
  ]) as [string, string, string, string];

  const {
    state,
    addExercise,
    removeExercise,
    addSet,
    removeSet,
    updateSetField,
    setName,
    reset,
    hasDraftData,
  } = useWorkoutForm();

  const { createSession, isPending, invalidateCache } = useCreateWorkoutSession();
  const { preferences } = usePreferences();
  const weightUnit = preferences?.default_weight_unit ?? 'kg';

  const handleCancel = useCallback(() => {
    if (hasDraftData) {
      Alert.alert('Discard Workout?', 'Your workout data will be lost.', [
        { text: 'Keep Editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            reset();
            navigation.goBack();
          },
        },
      ]);
    } else {
      clearSessionDraft();
      navigation.goBack();
    }
  }, [hasDraftData, reset, navigation]);

  const handleFinish = useCallback(() => {
    const exercisesWithSets = state.exercises.filter(e => e.sets.length > 0);
    if (exercisesWithSets.length === 0) {
      Alert.alert('Add an Exercise', 'Add at least one exercise with a set before saving.');
      return;
    }

    const name = state.name.trim() || 'Workout';

    Alert.alert('Save Workout?', `Save "${name}" with ${exercisesWithSets.length} exercise(s)?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Save',
        onPress: async () => {
          const payload: CreatePresetSessionRequest = {
            name,
            entry_date: state.entryDate,
            source: 'sparky',
            exercises: exercisesWithSets.map((exercise, index) => ({
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
            })),
          };

          try {
            await createSession(payload);
            await clearSessionDraft();
            invalidateCache(state.entryDate);
            navigation.goBack();
          } catch {
            // Error is handled by the mutation's onError
          }
        },
      },
    ]);
  }, [state, weightUnit, createSession, invalidateCache, navigation]);

  const handleAddExercise = useCallback(
    (exercise: Parameters<typeof addExercise>[0]) => {
      addExercise(exercise);
    },
    [addExercise],
  );

  const handleRemoveExercise = useCallback(
    (exercise: WorkoutDraftExercise) => {
      const hasData = exercise.sets.some(s => s.weight || s.reps);
      if (hasData) {
        Alert.alert('Remove Exercise?', `Remove "${exercise.exerciseName}" and all its sets?`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => removeExercise(exercise.clientId),
          },
        ]);
      } else {
        removeExercise(exercise.clientId);
      }
    },
    [removeExercise],
  );

  const renderSetRow = (exercise: WorkoutDraftExercise, set: WorkoutDraftSet, index: number) => (
    <View key={set.clientId} className="flex-row items-center py-1.5 gap-2">
      <Text className="text-sm text-text-muted w-8 text-center">{index + 1}</Text>
      <TextInput
        className="text-base text-text-primary py-1.5 px-2 rounded-lg text-center"
        style={{
          backgroundColor: raisedBg,
          borderWidth: 1,
          borderColor: borderSubtle,
          width: 80,
        }}
        value={set.weight}
        onChangeText={v => updateSetField(exercise.clientId, set.clientId, 'weight', v)}
        placeholder={weightUnit}
        placeholderTextColor={textMuted}
        keyboardType="decimal-pad"
        returnKeyType="next"
      />
      <Text className="text-sm text-text-muted">×</Text>
      <TextInput
        className="text-base text-text-primary py-1.5 px-2 rounded-lg text-center"
        style={{
          backgroundColor: raisedBg,
          borderWidth: 1,
          borderColor: borderSubtle,
          width: 60,
        }}
        value={set.reps}
        onChangeText={v => updateSetField(exercise.clientId, set.clientId, 'reps', v)}
        placeholder="reps"
        placeholderTextColor={textMuted}
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
    <View
      key={exercise.clientId}
      className="bg-surface rounded-xl p-4 mb-3"
    >
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-1 mr-2">
          <Text className="text-base font-semibold text-text-primary">{exercise.exerciseName}</Text>
          {exercise.exerciseCategory && (
            <Text className="text-xs text-text-muted mt-0.5">{exercise.exerciseCategory}</Text>
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
        <Text className="text-xs font-semibold text-text-muted w-8 text-center">Set</Text>
        <Text className="text-xs font-semibold text-text-muted" style={{ width: 80, textAlign: 'center' }}>
          Weight
        </Text>
        <View style={{ width: 12 }} />
        <Text className="text-xs font-semibold text-text-muted" style={{ width: 60, textAlign: 'center' }}>
          Reps
        </Text>
      </View>

      {exercise.sets.map((set, index) => renderSetRow(exercise, set, index))}

      <TouchableOpacity
        className="flex-row items-center justify-center py-2 mt-2"
        onPress={() => addSet(exercise.clientId)}
      >
        <Icon name="add-circle" size={18} color={accentPrimary} />
        <Text className="text-sm font-medium ml-1" style={{ color: accentPrimary }}>
          Add Set
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <TouchableOpacity onPress={handleCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="close" size={24} color={accentPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleFinish}
          disabled={isPending || !hasDraftData}
          className="py-1.5 px-4 rounded-lg"
          style={{
            backgroundColor: hasDraftData && !isPending ? accentPrimary : borderSubtle,
          }}
        >
          {isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text className="text-white font-semibold text-base">Finish</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}
      >
        <ScrollView className="flex-1 px-4" keyboardShouldPersistTaps="handled">
          {/* Workout name */}
          <TextInput
            className="text-xl font-bold text-text-primary py-2 mb-4"
            value={state.name}
            onChangeText={setName}
            placeholder="Workout"
            placeholderTextColor={textMuted}
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
            <Text className="text-base font-medium mt-1" style={{ color: accentPrimary }}>
              Add Exercise
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <ExercisePicker ref={exercisePickerRef} onSelectExercise={handleAddExercise} />
    </View>
  );
};

export default WorkoutFormScreen;
