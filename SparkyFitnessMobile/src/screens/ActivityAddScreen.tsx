import React, { useRef, useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import FadeView from '../components/FadeView';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import FormInput from '../components/FormInput';
import SafeImage from '../components/SafeImage';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { useActivityForm, getActivityDraftSubmission } from '../hooks/useActivityForm';
import { useSelectedExercise } from '../hooks/useSelectedExercise';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useCreateExerciseEntry, useUpdateExerciseEntry } from '../hooks/useExerciseMutations';
import { usePreferences } from '../hooks/usePreferences';
import Toast from 'react-native-toast-message';
import { addLog } from '../services/LogService';
import { formatDateLabel } from '../utils/dateUtils';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ActivityAdd'>;

const ActivityAddScreen: React.FC<Props> = ({ navigation, route }) => {
  const entry = route.params?.entry;
  const initialDate = route.params?.date;
  const popCount = route.params?.popCount ?? 1;
  const isEditMode = !!entry;

  const insets = useSafeAreaInsets();
  const calendarSheetRef = useRef<CalendarSheetRef>(null);

  const [accentPrimary, textMuted, textPrimary, borderSubtle, raisedBg] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-primary',
    '--color-border-subtle',
    '--color-raised',
  ]) as [string, string, string, string, string];

  const {
    state,
    setExercise,
    setName,
    setDuration,
    setDistance,
    setCalories,
    setAvgHeartRate,
    setDate,
    setNotes,
    populate,
    hasDraftData,
    discardDraft,
  } = useActivityForm({
    isEditMode,
    initialDate,
    skipDraftLoad: (!!route.params?.selectedExercise || !!route.params?.skipDraftLoad) && !isEditMode,
  });

  const { createEntry, isPending: isCreating, invalidateCache: invalidateCreateCache } = useCreateExerciseEntry();
  const { updateEntry, isPending: isUpdating, invalidateCache: invalidateUpdateCache } = useUpdateExerciseEntry();
  const isPending = isCreating || isUpdating;

  const { preferences } = usePreferences();
  const distanceUnit = (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const { getImageSource } = useExerciseImageSource();

  const [isNameEditing, setIsNameEditing] = useState(false);

  const dismissEditing = useCallback(() => {
    if (isNameEditing) setIsNameEditing(false);
    Keyboard.dismiss();
  }, [isNameEditing]);

  // Populate form once in edit mode (wait for preferences to resolve)
  const hasPopulatedRef = useRef(false);
  useEffect(() => {
    if (isEditMode && entry && preferences && !hasPopulatedRef.current) {
      hasPopulatedRef.current = true;
      populate(entry, distanceUnit);
    }
  }, [isEditMode, entry, preferences, populate, distanceUnit]);

  useSelectedExercise(route.params, setExercise);

  const submission = getActivityDraftSubmission(state, distanceUnit);
  const canSave = submission.canSave;

  const handleCancel = useCallback(async () => {
    if (!isEditMode && !hasDraftData) {
      await discardDraft();
    }
    navigation.goBack();
  }, [discardDraft, isEditMode, hasDraftData, navigation]);

  const handleSave = useCallback(async () => {
    if (!submission.exerciseId || !submission.canSave) return;

    const payload = {
      exercise_id: submission.exerciseId,
      exercise_name: submission.exerciseName,
      duration_minutes: submission.durationMinutes,
      calories_burned: submission.caloriesBurned,
      entry_date: submission.entryDate,
      distance: submission.distanceKm,
      avg_heart_rate: submission.avgHeartRate,
      notes: submission.notes,
    };

    try {
      if (isEditMode && entry) {
        await updateEntry({ id: entry.id, payload });
        invalidateUpdateCache(submission.entryDate);
        navigation.pop(popCount);
      } else {
        await createEntry(payload);
        await discardDraft();
        invalidateCreateCache(submission.entryDate);
        navigation.pop(popCount);
      }
    } catch (error) {
      addLog(`Failed to save activity: ${error}`, 'ERROR');
      Toast.show({ type: 'error', text1: 'Failed to save activity', text2: 'Please try again.' });
    }
  }, [
    submission, isEditMode, entry, popCount,
    createEntry, updateEntry, invalidateCreateCache, invalidateUpdateCache, discardDraft, navigation,
  ]);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
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
            {/* Activity name */}
            <View className="mb-4">
              {isNameEditing ? (
                <FadeView key="name-edit">
                  <FormInput
                    className="text-xl font-bold text-text-primary rounded-lg"
                    value={state.name}
                    onChangeText={setName}
                    placeholder="Activity"
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
                      {state.name || state.exerciseName || 'Activity'}
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

            {/* Exercise picker row */}
            <TouchableOpacity
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: raisedBg }}
              onPress={() => navigation.navigate('ExerciseSearch', { returnKey: route.key })}
              activeOpacity={0.7}
            >
              {state.exerciseId ? (
                <FadeView key="exercise-selected">
                  <View className="flex-row items-center">
                    {state.exerciseImages?.[0] ? (
                      <SafeImage
                        source={getImageSource(state.exerciseImages[0])}
                        style={{ width: 40, height: 40, borderRadius: 8, opacity: 0.8 }}
                      />
                    ) : (
                      <Icon name="exercise" size={20} color={accentPrimary} />
                    )}
                    <View className="ml-3 flex-1">
                      <Text className="text-base font-semibold text-text-primary">{state.exerciseName}</Text>
                      {state.exerciseCategory && (
                        <Text className="text-sm text-text-muted mt-0.5">{state.exerciseCategory}</Text>
                      )}
                    </View>
                    <Icon name="chevron-forward" size={16} color={textMuted} />
                  </View>
                </FadeView>
              ) : (
                <FadeView key="exercise-empty">
                  <View className="flex-row items-center">
                    <Icon name="add-circle" size={20} color={accentPrimary} />
                    <Text className="text-base font-medium ml-3" style={{ color: accentPrimary }}>
                      Select Activity
                    </Text>
                  </View>
                </FadeView>
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

            {/* Distance */}
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

            {/* Calories */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-text-secondary mb-1.5">Calories</Text>
              <FormInput
                value={state.calories}
                onChangeText={setCalories}
                placeholder="0"
                keyboardType="number-pad"
                returnKeyType="done"
              />
              <Text className="text-xs text-text-muted mt-1">
                {state.caloriesManuallySet ? 'Custom' : 'Auto-calculated'}
              </Text>
            </View>

            {/* Avg Heart Rate */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-text-secondary mb-1.5">Avg Heart Rate (bpm)</Text>
              <FormInput
                value={state.avgHeartRate}
                onChangeText={setAvgHeartRate}
                placeholder="0"
                keyboardType="number-pad"
                returnKeyType="done"
              />
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

            {/* Bottom spacer */}
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
          onPress={handleSave}
          disabled={isPending || !canSave}
          className="py-3"
        >
          {isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-sm font-semibold text-center" style={{ color: '#fff' }}>
              Save
            </Text>
          )}
        </Button>
      </View>

      <CalendarSheet
        ref={calendarSheetRef}
        selectedDate={state.entryDate}
        onSelectDate={setDate}
      />
    </View>
  );
};

export default ActivityAddScreen;
