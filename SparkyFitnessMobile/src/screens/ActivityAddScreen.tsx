import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Keyboard,
} from 'react-native';
import FadeView from '../components/FadeView';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import FormInput from '../components/FormInput';
import SafeImage from '../components/SafeImage';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import DateSelectRow from '../components/DateSelectRow';
import { FooterSaveBar } from '../components/FormScreenChrome';
import { useActivityForm, getActivityDraftSubmission } from '../hooks/useActivityForm';
import { useSelectedExercise } from '../hooks/useSelectedExercise';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useCreateExerciseEntry, useUpdateExerciseEntry } from '../hooks/useExerciseMutations';
import { usePreferences } from '../hooks/usePreferences';
import Toast from 'react-native-toast-message';
import { addLog } from '../services/LogService';
import { addDays, getTodayDate } from '../utils/dateUtils';
import { buildActivitySetsPayload, isCardioModality } from '../utils/workoutSession';
import { resolveExerciseModality } from '@workspace/shared';
import { useDiaryDateStore } from '../stores/diaryDateStore';
import type { Exercise } from '../types/exercise';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ActivityAdd'>;

const ActivityAddScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const entry = route.params?.entry;
  const initialDate = route.params?.date ?? useDiaryDateStore.getState().selectedDate;
  const popCount = route.params?.popCount ?? 1;
  const isEditMode = !!entry;

  const insets = useSafeAreaInsets();
  const calendarSheetRef = useRef<CalendarSheetRef>(null);

  const [accentPrimary, textMuted, raisedBg] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-raised',
  ]) as [string, string, string];
  const usesNativeHeader = useNativeIOSHeadersActive();

  const {
    state,
    setExercise,
    setName,
    setDuration,
    setDistance,
    setCalories,
    setAvgHeartRate,
    setDate: setFormDate,
    setNotes,
    populate,
    hasDraftData,
    discardDraft,
  } = useActivityForm({
    isEditMode,
    initialDate,
    skipDraftLoad: (!!route.params?.selectedExercise || !!route.params?.skipDraftLoad) && !isEditMode,
  });
  // Logging always targets the Dashboard/Diary date; changing it here should
  // carry back so the other views stay on the same day, not just inherit it.
  const setDate = useCallback((date: string) => {
    setFormDate(date);
    useDiaryDateStore.getState().setSelectedDate(date);
  }, [setFormDate]);

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

  // The draft only persists the exercise's category, so a restored draft
  // falls back to the category-derived modality; a fresh selection (and edit
  // mode's snapshot) keeps the explicit one.
  const [selectedModality, setSelectedModality] = useState<string | null>(
    entry?.exercise_snapshot?.modality ?? null,
  );
  const handleSetExercise = useCallback(
    (exercise: Exercise) => {
      setSelectedModality(exercise.modality ?? null);
      setExercise(exercise);
    },
    [setExercise],
  );
  useSelectedExercise(route.params, handleSetExercise);
  const modality = resolveExerciseModality(selectedModality, state.exerciseCategory);

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

    // Cardio is logged as a single set carrying duration+distance (issue
    // #1903). Non-cardio activities must NOT get a fabricated set — it would
    // grow a set table on plain activities — and an existing multi-set cardio
    // entry keeps its rows (both server update paths delete unreferenced
    // sets, so sending fewer sets than the entry has would truncate it).
    const sendCardioSet =
      isCardioModality(modality) && (entry == null || entry.sets.length <= 1);
    const payload = {
      exercise_id: submission.exerciseId,
      exercise_name: submission.exerciseName,
      duration_minutes: submission.durationMinutes,
      calories_burned: submission.caloriesBurned,
      entry_date: submission.entryDate,
      distance: submission.distanceKm,
      avg_heart_rate: submission.avgHeartRate,
      notes: submission.notes,
      ...(sendCardioSet
        ? {
            sets: buildActivitySetsPayload(
              // Draft rows echo the entry's stored values as kg text (the
              // builder gets 'kg' below) so an existing set's weight/reps
              // ride through unchanged.
              (entry?.sets ?? []).map((set, i) => ({
                clientId: `set-${i}`,
                weight: set.weight != null ? String(set.weight) : '',
                reps: set.reps != null ? String(set.reps) : '',
                distance: '',
              })),
              new Map((entry?.sets ?? []).map((set, i) => [`set-${i}`, set])),
              'kg',
              modality,
              {
                durationSec: submission.hasDuration
                  ? Math.round(submission.durationMinutes * 60)
                  : null,
                distanceKm: submission.distanceKm,
              },
            ),
          }
        : {}),
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
      Toast.show({ type: 'error', text1: t('activityAdd.errors.saveFailed', { defaultValue: 'Failed to save activity' }), text2: t('common.tryAgain', { defaultValue: 'Please try again.' }) });
    }
  }, [
    submission, isEditMode, entry, popCount, modality,
    createEntry, updateEntry, invalidateCreateCache, invalidateUpdateCache, discardDraft, navigation, t,
  ]);

  const header = useScreenHeader({
    left: {
      kind: 'dismiss',
      onPress: () => void handleCancel(),
      disabled: isPending,
      identifier: 'activity-add-cancel',
    },
    right: {
      kind: 'primary',
      label: t('common.save', { defaultValue: 'Save' }),
      busyLabel: t('common.saving', { defaultValue: 'Saving…' }),
      busy: isPending,
      disabled: isPending || !canSave,
      placement: 'native-only',
      onPress: () => void handleSave(),
      identifier: 'activity-add-save',
    },
  });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}

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
                    placeholder={t('activityAdd.fields.activity', { defaultValue: 'Activity' })} accessibilityLabel={t('activityAdd.accessibility.activityName', { defaultValue: 'Activity name' })}
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
                    accessibilityRole="button"
                    accessibilityLabel={t('activityAdd.accessibility.editActivityName', { defaultValue: 'Edit activity name' })}
                  >
                    <Text className="text-xl font-bold text-text-primary">
                      {state.name || state.exerciseName || t('activityAdd.fields.activity', { defaultValue: 'Activity' })}
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
                  accessibilityRole="button"
                  accessibilityLabel={t('activityAdd.accessibility.useYesterday', { defaultValue: 'Use yesterday' })}
                  className="flex-row items-center mx-4"
                  onPress={() => setDate(addDays(getTodayDate(), -1))}
                >
                  <Text className="text-text-link text-sm font-medium mx-1.5">{t('activityAdd.actions.useYesterday', { defaultValue: 'Use Yesterday' })}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('activityAdd.accessibility.useToday', { defaultValue: 'Use today' })}
                  className="flex-row items-center mx-4"
                  onPress={() => setDate(getTodayDate())}
                >
                  <Text className="text-text-link text-sm font-medium mx-1.5">{t('activityAdd.actions.useToday', { defaultValue: 'Use Today' })}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Exercise picker row */}
            <TouchableOpacity
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: raisedBg }}
              onPress={() => navigation.navigate('ExerciseSearch', { returnKey: route.key })}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('activityAdd.accessibility.selectExercise', { defaultValue: 'Select exercise' })}
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
                      {t('activityAdd.actions.selectActivity', { defaultValue: 'Select Activity' })}
                    </Text>
                  </View>
                </FadeView>
              )}
            </TouchableOpacity>

            {/* Duration */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-text-secondary mb-1.5">{t('activityAdd.fields.duration', { defaultValue: 'Duration (min)' })}</Text>
              <FormInput
                value={state.duration}
                onChangeText={setDuration}
                accessibilityLabel={t('activityAdd.accessibility.duration', { defaultValue: 'Duration in minutes' })}
                placeholder="0"
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>

            {/* Distance */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-text-secondary mb-1.5">
                {t('activityAdd.fields.distance', { defaultValue: 'Distance ({{unit}})', unit: distanceUnit === 'miles' ? 'mi' : 'km' })}
              </Text>
              <FormInput
                value={state.distance}
                onChangeText={setDistance}
                accessibilityLabel={t('activityAdd.accessibility.distance', { defaultValue: 'Distance in {{unit}}', unit: distanceUnit === 'miles' ? 'miles' : 'kilometers' })}
                placeholder="0"
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>

            {/* Calories */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-text-secondary mb-1.5">{t('activityAdd.fields.calories', { defaultValue: 'Calories' })}</Text>
              <FormInput
                value={state.calories}
                onChangeText={setCalories}
                accessibilityLabel={t('activityAdd.accessibility.calories', { defaultValue: 'Calories' })}
                placeholder="0"
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
              <Text className="text-xs text-text-muted mt-1">
                {state.caloriesManuallySet ? t('activityAdd.labels.custom', { defaultValue: 'Custom' }) : t('activityAdd.labels.autoCalculated', { defaultValue: 'Auto-calculated' })}
              </Text>
            </View>

            {/* Avg Heart Rate */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-text-secondary mb-1.5">{t('activityAdd.fields.avgHeartRate', { defaultValue: 'Avg Heart Rate (bpm)' })}</Text>
              <FormInput
                value={state.avgHeartRate}
                onChangeText={setAvgHeartRate}
                accessibilityLabel={t('activityAdd.accessibility.avgHeartRate', { defaultValue: 'Average heart rate in beats per minute' })}
                placeholder="0"
                keyboardType="number-pad"
                returnKeyType="done"
              />
            </View>

            {/* Notes */}
            <View className="mb-6">
              <Text className="text-sm font-medium text-text-secondary mb-1.5">{t('activityAdd.fields.notes', { defaultValue: 'Notes' })}</Text>
              <FormInput
                value={state.notes}
                onChangeText={setNotes}
                accessibilityLabel={t('activityAdd.accessibility.notes', { defaultValue: 'Activity notes' })}
                placeholder={t('activityAdd.fields.notesPlaceholder', { defaultValue: 'Optional notes...' })}
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

      {/* Sticky footer; the native-header path shows Save in the nav bar */}
      {!usesNativeHeader && (
        <FooterSaveBar
          onPress={() => void handleSave()}
          disabled={isPending || !canSave}
          busy={isPending}
          label={t('common.save', { defaultValue: 'Save' })}
        />
      )}

      <CalendarSheet
        ref={calendarSheetRef}
        selectedDate={state.entryDate}
        onSelectDate={setDate}
      />
    </View>
  );
};

export default ActivityAddScreen;
