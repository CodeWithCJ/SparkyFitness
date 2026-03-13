import React, { useRef, useCallback, useEffect } from 'react';
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
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { useActivityForm, isDistanceExercise, MILES_TO_KM } from '../hooks/useActivityForm';
import { useCreateExerciseEntry } from '../hooks/useCreateExerciseEntry';
import { useUpdateExerciseEntry } from '../hooks/useUpdateExerciseEntry';
import { usePreferences } from '../hooks/usePreferences';
import { clearSessionDraft } from '../services/workoutDraftService';
import { formatDateLabel } from '../utils/dateUtils';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ActivityForm'>;

const ActivityFormScreen: React.FC<Props> = ({ navigation, route }) => {
  const entry = route.params?.entry;
  const initialDate = route.params?.date;
  const isEditMode = !!entry;

  const insets = useSafeAreaInsets();
  const exercisePickerRef = useRef<ExercisePickerRef>(null);
  const calendarSheetRef = useRef<CalendarSheetRef>(null);

  const [accentPrimary, textMuted, borderSubtle, raisedBg] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-border-subtle',
    '--color-raised',
  ]) as [string, string, string, string];

  const {
    state,
    setExercise,
    setDuration,
    setDistance,
    setCalories,
    setDate,
    setNotes,
    reset,
    populate,
    hasDraftData,
  } = useActivityForm({ isEditMode, initialDate });

  const { createEntry, isPending: isCreating, invalidateCache: invalidateCreateCache } = useCreateExerciseEntry();
  const { updateEntry, isPending: isUpdating, invalidateCache: invalidateUpdateCache } = useUpdateExerciseEntry();
  const isPending = isCreating || isUpdating;

  const { preferences } = usePreferences();
  const distanceUnit = (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';

  const showDistance = isDistanceExercise(state.exerciseName);

  // Populate form in edit mode
  useEffect(() => {
    if (isEditMode && entry) {
      populate(entry, distanceUnit);
    }
  }, [isEditMode, entry, populate, distanceUnit]);

  const canSave = state.exerciseId && state.duration && parseFloat(state.duration) > 0;

  const handleCancel = useCallback(() => {
    if (hasDraftData && !isEditMode) {
      Alert.alert('Discard Activity?', 'Your activity data will be lost.', [
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
      if (!isEditMode) clearSessionDraft();
      navigation.goBack();
    }
  }, [hasDraftData, isEditMode, reset, navigation]);

  const handleSave = useCallback(async () => {
    const durationMinutes = parseFloat(state.duration);
    if (!state.exerciseId || isNaN(durationMinutes) || durationMinutes <= 0) return;

    const caloriesBurned = parseInt(state.calories, 10) || 0;

    let distanceKm: number | null = null;
    if (state.distance) {
      const distanceVal = parseFloat(state.distance);
      if (!isNaN(distanceVal) && distanceVal > 0) {
        distanceKm = distanceUnit === 'miles' ? distanceVal * MILES_TO_KM : distanceVal;
      }
    }

    const payload = {
      exercise_id: state.exerciseId,
      duration_minutes: durationMinutes,
      calories_burned: caloriesBurned,
      entry_date: state.entryDate,
      distance: distanceKm,
      notes: state.notes || null,
    };

    try {
      if (isEditMode && entry) {
        await updateEntry({ id: entry.id, payload });
        invalidateUpdateCache(state.entryDate);
      } else {
        await createEntry(payload);
        await clearSessionDraft();
        invalidateCreateCache(state.entryDate);
      }
      navigation.goBack();
    } catch {
      // Error handled by mutation onError
    }
  }, [
    state, distanceUnit, isEditMode, entry,
    createEntry, updateEntry, invalidateCreateCache, invalidateUpdateCache, navigation,
  ]);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <TouchableOpacity onPress={handleCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="close" size={24} color={accentPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSave}
          disabled={isPending || !canSave}
          className="py-1.5 px-4 rounded-lg"
          style={{
            backgroundColor: canSave && !isPending ? accentPrimary : borderSubtle,
          }}
        >
          {isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text className="text-white font-semibold text-base">
              {isEditMode ? 'Save Changes' : 'Save'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}
      >
        <ScrollView className="flex-1 px-4" keyboardShouldPersistTaps="handled">
          {/* Title */}
          <Text className="text-xl font-bold text-text-primary py-2 mb-4">
            {isEditMode ? 'Edit Activity' : 'Log Activity'}
          </Text>

          {/* Exercise picker row */}
          <TouchableOpacity
            className="rounded-xl p-4 mb-4"
            style={{ backgroundColor: raisedBg }}
            onPress={() => exercisePickerRef.current?.present()}
            activeOpacity={0.7}
          >
            {state.exerciseId ? (
              <View className="flex-row items-center">
                <Icon name="exercise" size={20} color={accentPrimary} />
                <View className="ml-3 flex-1">
                  <Text className="text-base font-semibold text-text-primary">{state.exerciseName}</Text>
                  {state.exerciseCategory && (
                    <Text className="text-sm text-text-muted mt-0.5">{state.exerciseCategory}</Text>
                  )}
                </View>
                <Icon name="chevron-forward" size={16} color={textMuted} />
              </View>
            ) : (
              <View className="flex-row items-center">
                <Icon name="add-circle" size={20} color={accentPrimary} />
                <Text className="text-base font-medium ml-3" style={{ color: accentPrimary }}>
                  Select Activity
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Duration */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-text-secondary mb-1.5">Duration (min)</Text>
            <TextInput
              className="text-base text-text-primary py-3 px-3 rounded-lg"
              style={{
                backgroundColor: raisedBg,
                borderWidth: 1,
                borderColor: borderSubtle,
              }}
              value={state.duration}
              onChangeText={setDuration}
              placeholder="0"
              placeholderTextColor={textMuted}
              keyboardType="number-pad"
              returnKeyType="done"
            />
          </View>

          {/* Distance (conditional) */}
          {showDistance && (
            <View className="mb-4">
              <Text className="text-sm font-medium text-text-secondary mb-1.5">
                Distance ({distanceUnit === 'miles' ? 'mi' : 'km'})
              </Text>
              <TextInput
                className="text-base text-text-primary py-3 px-3 rounded-lg"
                style={{
                  backgroundColor: raisedBg,
                  borderWidth: 1,
                  borderColor: borderSubtle,
                }}
                value={state.distance}
                onChangeText={setDistance}
                placeholder="0"
                placeholderTextColor={textMuted}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>
          )}

          {/* Calories */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-text-secondary mb-1.5">Calories</Text>
            <TextInput
              className="text-base text-text-primary py-3 px-3 rounded-lg"
              style={{
                backgroundColor: raisedBg,
                borderWidth: 1,
                borderColor: borderSubtle,
              }}
              value={state.calories}
              onChangeText={setCalories}
              placeholder="Enter calories"
              placeholderTextColor={textMuted}
              keyboardType="number-pad"
              returnKeyType="done"
            />
            <Text className="text-xs text-text-muted mt-1">
              {state.caloriesManuallySet ? 'Custom' : 'Auto-calculated'}
            </Text>
          </View>

          {/* Date row */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-text-secondary mb-1.5">Date</Text>
            <TouchableOpacity
              className="flex-row items-center justify-between py-3 px-3 rounded-lg"
              style={{
                backgroundColor: raisedBg,
                borderWidth: 1,
                borderColor: borderSubtle,
              }}
              onPress={() => calendarSheetRef.current?.present()}
              activeOpacity={0.7}
            >
              <Text className="text-base text-text-primary">{formatDateLabel(state.entryDate)}</Text>
              <Icon name="chevron-forward" size={16} color={textMuted} />
            </TouchableOpacity>
          </View>

          {/* Notes */}
          <View className="mb-6">
            <Text className="text-sm font-medium text-text-secondary mb-1.5">Notes</Text>
            <TextInput
              className="text-base text-text-primary py-3 px-3 rounded-lg"
              style={{
                backgroundColor: raisedBg,
                borderWidth: 1,
                borderColor: borderSubtle,
                minHeight: 80,
              }}
              value={state.notes}
              onChangeText={setNotes}
              placeholder="Optional notes..."
              placeholderTextColor={textMuted}
              multiline
              textAlignVertical="top"
              returnKeyType="default"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ExercisePicker ref={exercisePickerRef} onSelectExercise={setExercise} />
      <CalendarSheet
        ref={calendarSheetRef}
        selectedDate={state.entryDate}
        onSelectDate={setDate}
      />
    </View>
  );
};

export default ActivityFormScreen;
