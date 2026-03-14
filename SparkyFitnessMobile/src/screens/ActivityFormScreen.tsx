import React, { useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import FormInput from '../components/FormInput';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { useActivityForm, isDistanceExercise } from '../hooks/useActivityForm';
import { distanceToKm } from '../utils/unitConversions';
import { useCreateExerciseEntry } from '../hooks/useCreateExerciseEntry';
import { useUpdateExerciseEntry } from '../hooks/useUpdateExerciseEntry';
import { usePreferences } from '../hooks/usePreferences';
import { clearDraft } from '../services/workoutDraftService';
import { formatDateLabel } from '../utils/dateUtils';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ActivityForm'>;

const ActivityFormScreen: React.FC<Props> = ({ navigation, route }) => {
  const entry = route.params?.entry;
  const initialDate = route.params?.date;
  const popCount = route.params?.popCount ?? 1;
  const isEditMode = !!entry;

  const insets = useSafeAreaInsets();
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
    setName,
    setDuration,
    setDistance,
    setCalories,
    setDate,
    setNotes,
    populate,
    hasDraftData,
  } = useActivityForm({
    isEditMode,
    initialDate,
    skipDraftLoad: !!route.params?.selectedExercise && !isEditMode,
  });

  const { createEntry, isPending: isCreating, invalidateCache: invalidateCreateCache } = useCreateExerciseEntry();
  const { updateEntry, isPending: isUpdating, invalidateCache: invalidateUpdateCache } = useUpdateExerciseEntry();
  const isPending = isCreating || isUpdating;

  const { preferences } = usePreferences();
  const distanceUnit = (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';

  const showDistance = isDistanceExercise(state.exerciseName);

  // Populate form once in edit mode (wait for preferences to resolve)
  const hasPopulatedRef = useRef(false);
  useEffect(() => {
    if (isEditMode && entry && preferences && !hasPopulatedRef.current) {
      hasPopulatedRef.current = true;
      populate(entry, distanceUnit);
    }
  }, [isEditMode, entry, preferences, populate, distanceUnit]);

  // Listen for exercise selection from ExerciseSearchScreen
  const lastNonceRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const selectedExercise = route.params?.selectedExercise;
    const nonce = route.params?.selectionNonce;
    if (selectedExercise && nonce && nonce !== lastNonceRef.current) {
      lastNonceRef.current = nonce;
      setExercise(selectedExercise);
    }
  }, [route.params?.selectedExercise, route.params?.selectionNonce, setExercise]);

  const canSave = state.exerciseId && state.duration && parseFloat(state.duration) > 0;

  const handleCancel = useCallback(() => {
    if (!isEditMode && !hasDraftData) {
      clearDraft();
    }
    navigation.goBack();
  }, [isEditMode, hasDraftData, navigation]);

  const handleSave = useCallback(async () => {
    const durationMinutes = parseFloat(state.duration);
    if (!state.exerciseId || isNaN(durationMinutes) || durationMinutes <= 0) return;

    const caloriesBurned = parseInt(state.calories, 10) || 0;

    let distanceKm: number | null = null;
    if (state.distance) {
      const distanceVal = parseFloat(state.distance);
      if (!isNaN(distanceVal) && distanceVal > 0) {
        distanceKm = distanceToKm(distanceVal, distanceUnit);
      }
    }

    const payload = {
      exercise_id: state.exerciseId,
      exercise_name: state.name.trim() || state.exerciseName || null,
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
        navigation.pop(popCount);
      } else {
        await createEntry(payload);
        await clearDraft();
        invalidateCreateCache(state.entryDate);
        navigation.pop(popCount);
      }
    } catch {
      // Error handled by mutation onError
    }
  }, [
    state, distanceUnit, isEditMode, entry, popCount,
    createEntry, updateEntry, invalidateCreateCache, invalidateUpdateCache, navigation,
  ]);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Button variant="ghost" onPress={handleCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} className="py-0 px-0">
          <Icon name="close" size={24} color={accentPrimary} />
        </Button>
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
          {/* Activity name */}
          <FormInput
            className="text-xl font-bold text-text-primary mb-4"
            value={state.name}
            onChangeText={setName}
            placeholder="Activity"
            returnKeyType="done"
          />

          {/* Exercise picker row */}
          <TouchableOpacity
            className="rounded-xl p-4 mb-4"
            style={{ backgroundColor: raisedBg }}
            onPress={() => navigation.navigate('ExerciseSearch', { returnKey: route.key })}
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
            <FormInput
              value={state.duration}
              onChangeText={setDuration}
              placeholder="0"
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
              <FormInput
                value={state.distance}
                onChangeText={setDistance}
                placeholder="0"
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>
          )}

          {/* Calories */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-text-secondary mb-1.5">Calories</Text>
            <FormInput
              value={state.calories}
              onChangeText={setCalories}
              placeholder="Enter calories"
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
            <FormInput
              value={state.notes}
              onChangeText={setNotes}
              placeholder="Optional notes..."
              multiline
              textAlignVertical="top"
              returnKeyType="default"
              style={{ minHeight: 80 }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <CalendarSheet
        ref={calendarSheetRef}
        selectedDate={state.entryDate}
        onSelectDate={setDate}
      />
    </View>
  );
};

export default ActivityFormScreen;
