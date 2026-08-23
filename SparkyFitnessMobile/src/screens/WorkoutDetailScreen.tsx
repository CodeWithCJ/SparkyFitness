import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import Animated, { LinearTransition } from 'react-native-reanimated';
import FadeView from '../components/FadeView';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import FormInput from '../components/FormInput';
import Button from '../components/ui/Button';
import WorkoutFormExerciseList, {
  type WorkoutFormExerciseListHandle,
} from '../components/WorkoutFormExerciseList';
import { useSetEditAccessoryBar } from '../components/SetRowChrome';
import ActiveWorkoutExerciseCard from '../components/ActiveWorkoutExerciseCard';
import ActionSheet, {
  type ActionSheetItem,
  type ActionSheetRef,
} from '../components/ActionSheet';
import { MetricColumnMenu } from '../components/WorkoutMenus';
import { type AnchorRect } from '../components/AnchoredMenu';
import {
  getSourceLabel,
  getWorkoutSummary,
  getExerciseVolumeKg,
  formatVolume,
  canReorderDraftExercises,
  exerciseFromSnapshot,
} from '../utils/workoutSession';
import { formatLocalizedNumber } from '../localization';
import {
  useDeleteWorkout,
  useUpdateWorkout,
} from '../hooks/useExerciseMutations';
import { promptForActiveWorkoutConflict } from '../hooks/useStartLiveWorkout';
import { usePreferences } from '../hooks/usePreferences';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useSelectedExercise } from '../hooks/useSelectedExercise';
import { useWorkoutForm, getWorkoutDraftSubmission } from '../hooks/useWorkoutForm';
import { useExerciseSetEditing } from '../hooks/useExerciseSetEditing';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { normalizeDate, formatDate, formatDateLabel } from '../utils/dateUtils';
import { parseDecimalInput } from '../utils/numericInput';
import Toast from 'react-native-toast-message';
import { addLog } from '../services/LogService';
import { extractActivitySummary } from '../utils/activityDetails';
import {
  seedCompletionFromSession,
  useActiveWorkoutStore,
} from '../stores/activeWorkoutStore';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  ensureNotificationPermission,
  maybePromptForExactAlarmPermission,
} from '../services/notifications';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader, SAVE_LABEL, SAVING_LABEL, type HeaderItem } from '../hooks/useScreenHeader';
import { useSupersetBorders } from '../components/ActiveWorkoutRail';
import type { RootStackScreenProps } from '../types/navigation';
import type { UpdatePresetSessionRequest } from '@workspace/shared';
import { canEditGroupedWorkout } from '@workspace/shared';

type Props = RootStackScreenProps<'WorkoutDetail'>;

const WorkoutDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t , i18n: translationI18n } = useTranslation();
  const dateLocale = translationI18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const [session, setSession] = useState(route.params.session);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { preferences } = usePreferences();
  const weightUnit = preferences?.default_weight_unit ?? 'kg';
  const distanceUnit = (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';

  const calendarSheetRef = useRef<CalendarSheetRef>(null);
  const exerciseListRef = useRef<WorkoutFormExerciseListHandle>(null);

  const [accentPrimary, borderSubtle] = useCSSVariable([
    '--color-accent-primary',
    '--color-border-subtle',
  ]) as [string, string];
  const usesNativeHeader = useNativeIOSHeadersActive();

  // Superset display (view mode only): grouped members get a flat left rail
  // in a per-group palette color, matching the active-workout screen.
  const { borders: supersetBorders } = useSupersetBorders(session.exercises);

  const { getImageSource } = useExerciseImageSource();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // Last-saved server state: a live session's just-tapped checkmarks appear
  // here only after the autosave lands (the focus refresh below swaps in the
  // store's session snapshot).
  const completedSetIds = useMemo(() => seedCompletionFromSession(session), [session]);

  // Metric column is shared with the active-workout screen; changing it on
  // either screen changes both (intended).
  const metricColumn = useAppPreferencesStore((s) => s.activeWorkoutMetricColumn);
  const [metricMenu, setMetricMenu] = useState<{
    anchor: AnchorRect;
    clampedToRpe: boolean;
  } | null>(null);
  const handlePressMetricHeader = useCallback(
    (anchor: AnchorRect, clampedToRpe: boolean) => {
      setMetricMenu({ anchor, clampedToRpe });
    },
    [],
  );

  // Active workout state (narrow selector to avoid re-rendering on unrelated
  // changes). The Diary routes the live session to ActiveWorkout instead of
  // here, but this gate still hides Start actions if the screen is reached
  // for the live session some other way.
  const activeSessionId = useActiveWorkoutStore((s) => s.sessionId);
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const isWorkoutActive = activeSessionId === session.id;

  const toggleSection = useCallback((key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const sourceLabel = getSourceLabel(session.source);
  const canEdit = canEditGroupedWorkout(session.source);
  const entryDate = session.entry_date ?? '';
  const normalizedDate = normalizeDate(entryDate);

  const { name } = getWorkoutSummary(session, t);

  const deleteWorkout = useDeleteWorkout({
    sessionId: session.id,
    entryDate: normalizedDate,
    onSuccess: () => {
      // If the user just deleted the workout that the HUD is pointing at,
      // clear the active state so the bar doesn't keep referencing a session
      // that no longer exists on the server.
      if (useActiveWorkoutStore.getState().sessionId === session.id) {
        useActiveWorkoutStore.getState().clearWorkout();
      }
      navigation.goBack();
    },
  });

  const isDeleting = deleteWorkout.isPending;

  const { updateSession, isPending: isSaving, invalidateCache: invalidateSessionCache } = useUpdateWorkout();
  const [isEditing, setIsEditing] = useState(false);
  const [editNotes, setEditNotes] = useState('');

  // Reuse the workout form hook for exercise/set editing
  const {
    state: formState,
    addExercise,
    removeExercise,
    replaceExercise,
    clearExerciseCompletions,
    addSet,
    removeSet,
    updateSetField,
    updateSetMeta,
    setExerciseRest,
    setExerciseCalories,
    setExerciseNotes,
    supersetWith,
    ungroupExercise,
    reorderExercises,
    setName: setFormName,
    setDate: setFormDate,
    populate,
    exercisesModifiedRef,
  } = useWorkoutForm({ isEditMode: true, skipDraftLoad: true });
  const submission = useMemo(
    () => getWorkoutDraftSubmission(formState, weightUnit as 'kg' | 'lbs', distanceUnit),
    [formState, weightUnit, distanceUnit],
  );
  const hasEditedExercisesWithSets = submission.canSave;

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

  // Sticky Done/Next bar for the focused set cell (edit mode), on both
  // platforms.
  const { onRegisterAccessoryHandle, accessoryBar } = useSetEditAccessoryBar({
    activeSetKey,
    activeSetField,
    onDeactivateSet: deactivateSet,
  });

  const isEligibleForPrefill = useCallback(
    (clientId: string) => eligibleIds.has(clientId),
    [eligibleIds],
  );

  const startEditing = useCallback(() => {
    populate(session, weightUnit as 'kg' | 'lbs', distanceUnit);
    setEditNotes(session.notes ?? '');
    setEligibleIds(new Set());
    setIsEditing(true);
  }, [populate, session, weightUnit, distanceUnit]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditNotes('');
    deactivateSet();
  }, [deactivateSet]);

  useSelectedExercise(route.params, handleAddExercise);

  // Reconcile store step IDs whenever the local session object changes
  // (e.g., after a save round-trip that may have renumbered sets).
  useEffect(() => {
    if (useActiveWorkoutStore.getState().sessionId === session.id) {
      useActiveWorkoutStore.getState().reconcileWithSession(session);
    }
  }, [session]);

  // Reverse direction: while this session is the live workout, the store's
  // snapshot is the source of truth (the active-workout screen autosaves it,
  // and a recreate save replaces every exercise/set id). Refresh the local
  // copy on focus; otherwise edit-saves built from the stale
  // route.params.session would send dead ids and 400.
  useFocusEffect(
    useCallback(() => {
      const store = useActiveWorkoutStore.getState();
      if (store.sessionId === session.id && store.session != null && store.session !== session) {
        setSession(store.session);
      }
    }, [session]),
  );

  // Seed the store from this saved session and enter the live screen. `atSetId`
  // starts the cursor on a specific set (the "Start workout here" long-press).
  const enterLiveWorkout = useCallback(
    (atSetId?: string) => {
      // Chained so the exact-alarm prompt never stacks on top of the OS
      // notification-permission dialog.
      void ensureNotificationPermission().then(() =>
        maybePromptForExactAlarmPermission(),
      );
      const store = useActiveWorkoutStore.getState();
      if (atSetId != null) store.startWorkoutAtSet(session, atSetId);
      else store.startWorkout(session);
      navigation.replace('ActiveWorkout');
    },
    [session, navigation],
  );

  // Start this workout, first resolving any other in-progress session through
  // the shared conflict prompt (go to it, or clear it and start this one). The
  // Start button and "Start workout here" long-press are both gated on
  // !isWorkoutActive, so a non-null sessionId here means a *different* workout.
  const beginWorkout = useCallback(
    (atSetId?: string) => {
      const prompted = promptForActiveWorkoutConflict(queryClient, {
        onGoToWorkout: () => navigation.navigate('ActiveWorkout'),
        onClearAndStart: () => enterLiveWorkout(atSetId),
      }, t);
      if (prompted) return;
      enterLiveWorkout(atSetId);
    },
    [queryClient, navigation, enterLiveWorkout, t],
  );

  const handleStartWorkout = () => beginWorkout();

  // Long-pressing a set opens a menu-style bottom sheet (same ActionSheet the
  // live/edit exercise ⋮ menus use). Gated on canEdit like the Start button:
  // sessions that are not editable (external/unknown sources) can be neither
  // edited nor run live — a live workout autosaves via the nested-exercise
  // update, which the server rejects (409) for them.
  const setMenuSheetRef = useRef<ActionSheetRef>(null);
  const [setMenuTargetId, setSetMenuTargetId] = useState<string | null>(null);
  const handleLongPressSet = useCallback(
    (setId: string) => {
      if (!canEdit) return;
      setSetMenuTargetId(setId);
      setMenuSheetRef.current?.present();
    },
    [canEdit],
  );

  const setMenuItems = useMemo<ActionSheetItem[]>(() => {
    if (setMenuTargetId == null) return [];
    const items: ActionSheetItem[] = [
      { key: 'edit', label: t('common.edit', { defaultValue: 'Edit' }), onPress: startEditing },
    ];
    if (!isWorkoutActive) {
      items.push({
        key: 'start-here',
        label: t('workoutDetail.actions.startHere', { defaultValue: 'Start workout here' }),
        onPress: () => beginWorkout(setMenuTargetId),
      });
    }
    return items;
  }, [setMenuTargetId, isWorkoutActive, startEditing, beginWorkout, t]);

  // "Save as preset": review-and-save through the preset create form,
  // prefilled from this session. Not gated on canEdit — templating a synced
  // workout (e.g. a Garmin strength import) only reads the session.
  const handleSaveAsPreset = useCallback(() => {
    navigation.navigate('WorkoutPresetForm', {
      mode: 'create-preset',
      sourceSession: session,
    });
  }, [navigation, session]);

  const openExerciseSearch = () => {
    // Plain Add: drop any pending replace target so a cancelled replace can't
    // misroute this add.
    setReplaceTarget(null);
    navigation.navigate('ExerciseSearch', { returnKey: route.key });
  };

  // ⋮ "Replace exercise": the next ExerciseSearch return swaps this entry in
  // place instead of appending.
  const handleReplaceExercise = useCallback(
    (clientId: string) => {
      setReplaceTarget(clientId);
      navigation.navigate('ExerciseSearch', { returnKey: route.key });
    },
    [setReplaceTarget, navigation, route.key],
  );

  // Tap an exercise thumbnail → its library detail. Session entries carry a
  // full snapshot, so the detail screen opens with muscles/equipment already
  // populated (and still hydrates by id).
  const handleViewExercise = useCallback(
    (entryId: string) => {
      const entry = session.exercises.find((e) => e.id === entryId);
      if (!entry) return;
      navigation.navigate('ExerciseDetail', {
        item: exerciseFromSnapshot(entry.exercise_snapshot, entry.exercise_id, t),
        hideWorkoutActions: true,
      });
    },
    [session, navigation, t],
  );

  // --- Save ---

  const handleSave = useCallback(async () => {
    const editedDate = submission.entryDate;
    const dateChanged = editedDate !== normalizedDate;

    try {
      if (exercisesModifiedRef.current && !submission.canSave) {
        Toast.show({
          type: 'error',
          text1: t('workoutDetail.errors.needsExercise', { defaultValue: 'Workout needs an exercise' }),
          text2: t('workoutDetail.errors.addExerciseOrDelete', { defaultValue: 'Add at least one exercise with a set or delete the workout.' }),
        });
        return;
      }
      const payload: UpdatePresetSessionRequest = {
        name: submission.name,
        entry_date: editedDate,
        notes: editNotes || null,
        ...(exercisesModifiedRef.current && submission.canSave ? {
          exercises: submission.payloadExercises,
        } : {}),
      };
      const updatedSession = await updateSession({ id: session.id, payload });
      invalidateSessionCache(editedDate);
      if (dateChanged) invalidateSessionCache(normalizedDate);
      setSession(updatedSession);
      setIsEditing(false);
      setEditNotes('');
      deactivateSet();
    } catch (error) {
      addLog(`Failed to save workout: ${error}`, 'ERROR');
      Toast.show({ type: 'error', text1: t('workoutDetail.errors.saveFailed', { defaultValue: 'Failed to save workout' }), text2: t('common.tryAgain', { defaultValue: 'Please try again.' }) });
    }
  }, [submission, normalizedDate, editNotes, updateSession, session, invalidateSessionCache, deactivateSet, exercisesModifiedRef, t]);

  // --- Read-only render helpers ---

  const renderViewExercises = () => (
    <View className="mt-4">
      {session.exercises.map(exercise => {
        const isExpanded = !!expandedSections[exercise.id];
        const supersetBorder = supersetBorders.get(exercise.id) ?? null;
        const card = (
          <ActiveWorkoutExerciseCard
            exercise={exercise}
            mode="view"
            expanded={isExpanded}
            completedSetIds={completedSetIds}
            activeSetId={null}
            metricColumn={metricColumn}
            weightUnit={weightUnit as 'kg' | 'lbs'}
            distanceUnit={distanceUnit}
            getImageSource={getImageSource}
            excludePresetEntryId={session.id}
            showRestChip={canEdit}
            onPressThumb={handleViewExercise}
            onToggleExpanded={toggleSection}
            onPressMetricHeader={handlePressMetricHeader}
            onLongPressSet={handleLongPressSet}
          />
        );
        return (
          <Animated.View key={exercise.id} layout={LinearTransition.duration(300)}>
            {supersetBorder ? (
              // Grouped members carry a flat 3px left rail. Interior rails
              // run the full wrapper height, meeting the next member's rail at
              // the divider so consecutive members read as one continuous line;
              // the run's last member stops ~8px short to end at the card
              // content rather than the divider.
              <View style={{ paddingLeft: 10 }}>
                <View
                  testID={`superset-rail-${exercise.id}`}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: supersetBorder.isLast && isExpanded ? 8 : 0,
                    width: 3,
                    backgroundColor: supersetBorder.color,
                  }}
                />
                {card}
              </View>
            ) : (
              card
            )}
          </Animated.View>
        );
      })}
    </View>
  );

  // --- Other content render helpers ---

  const renderActivityDetails = () => {
    const details = session.activity_details;
    if (!details || details.length === 0) return null;

    const items = extractActivitySummary(details, t);
    if (items.length === 0) return null;

    return (
      <View className="bg-surface rounded-xl p-4 mt-4">
        <Text className="text-base font-semibold text-text-primary mb-2">{t('workoutDetail.labels.details', { defaultValue: 'Details' })}</Text>
        {items.map((item, i) => (
          <View
            key={`${item.label}-${i}`}
            className={`flex-row justify-between py-2 ${i < items.length - 1 ? 'border-b border-border-subtle' : ''}`}
          >
            <Text className="text-sm text-text-secondary">{item.label}</Text>
            <Text className="text-sm text-text-primary">{item.value}</Text>
          </View>
        ))}
      </View>
    );
  };

  // --- Summary card ---

  const renderSummaryCard = () => {
    const exercises = isEditing ? formState.exercises : session.exercises;
    const exerciseCount = exercises.length;
    const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
    const totalVolume = isEditing
      ? formState.exercises.reduce((sum, ex) => ex.sets.reduce((s, set) => {
          const w = parseDecimalInput(set.weight);
          const r = parseInt(set.reps, 10);
          return s + (isNaN(w) || isNaN(r) ? 0 : w * r);
        }, sum), 0)
      : session.exercises.reduce((sum, ex) => sum + getExerciseVolumeKg(ex), 0);
    const totalCalories = isEditing
      ? formState.exercises.reduce((sum, ex) => {
          const cal = parseDecimalInput(ex.calories ?? '');
          return sum + (isNaN(cal) ? 0 : cal);
        }, 0)
      : session.exercises.reduce((sum, ex) => sum + (ex.calories_burned ?? 0), 0);

    const summaryItems: { value: string; label: string }[] = [];
    summaryItems.push({
      value: String(exerciseCount),
      label: t('workoutDetail.summary.exercise', {
        count: exerciseCount,
        defaultValue: 'Exercises',
        defaultValue_one: 'Exercise',
        defaultValue_few: 'Exercises',
        defaultValue_many: 'Exercises',
        defaultValue_other: 'Exercises',
      }),
    });
    if (totalSets > 0) summaryItems.push({ value: String(totalSets), label: t('workoutDetail.summary.sets', { defaultValue: 'Sets' }) });
    if (totalVolume > 0) {
      const volumeLabel = isEditing
        ? `${formatLocalizedNumber(Math.round(totalVolume))} ${weightUnit}`
        : formatVolume(totalVolume, weightUnit);
      summaryItems.push({ value: volumeLabel, label: t('workoutDetail.summary.volume', { defaultValue: 'Volume' }) });
    }
    if (totalCalories > 0) {
      summaryItems.push({
        value: formatLocalizedNumber(Math.round(totalCalories)),
        label: t('workoutDetail.summary.calories', { defaultValue: 'Calories' }),
      });
    }
    if (summaryItems.length === 0) return null;

    return (
      <View className="bg-surface rounded-xl p-4">
        <View className="flex-row items-center justify-around">
          {summaryItems.map((item, i) => (
            <React.Fragment key={item.label}>
              {i > 0 && (
                <View style={{ width: 1, height: 32, backgroundColor: borderSubtle }} />
              )}
              <View className="items-center">
                <Text className="text-lg font-semibold text-text-primary">{item.value}</Text>
                <Text className="text-xs text-text-muted mt-0.5">{item.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>
    );
  };

  // Edit mode: Save is the one accent action; a secondary reorder icon joins it
  // (left of Save) when the draft has 2+ draggable items.
  const canReorderEdit = canReorderDraftExercises(formState.exercises);
  const saveHeaderItem: HeaderItem = {
    kind: 'primary',
    label: SAVE_LABEL,
    busyLabel: SAVING_LABEL,
    busy: isSaving,
    disabled: isSaving || !hasEditedExercisesWithSets,
    onPress: handleSave,
    accessibilityLabel: t('workoutDetail.accessibility.save', { defaultValue: 'Save' }),
    identifier: 'workout-detail-save',
  };
  const reorderHeaderItem: HeaderItem = {
    kind: 'icon',
    sfSymbol: 'arrow.up.arrow.down',
    ionicon: 'swap-vertical',
    role: 'secondary',
    onPress: () => exerciseListRef.current?.openReorder(),
    accessibilityLabel: t('workoutDetail.accessibility.reorder', { defaultValue: 'Reorder exercises' }),
    identifier: 'workout-detail-reorder',
  };
  const saveAsPresetHeaderItem: HeaderItem = {
    kind: 'icon',
    sfSymbol: 'bookmark',
    ionicon: 'bookmark-outline',
    role: 'secondary',
    onPress: handleSaveAsPreset,
    accessibilityLabel: t('workoutDetail.accessibility.saveAsPreset', { defaultValue: 'Save as preset' }),
    identifier: 'workout-detail-save-as-preset',
  };

  // Small inline native title (set in App.tsx as a small title so re-applying it
  // for the edit-mode swap updates in place rather than flying in a large one).
  // View mode: name + owner-only Edit (the in-body name is suppressed since it
  // lives in the bar). Edit mode: "Edit Workout" title, X-dismiss owning the
  // left slot with swipe-back disabled, Save (+ reorder) on the right; name
  // edited in-body.
  const header = useScreenHeader({
    nativeTitle: isEditing ? t('workoutDetail.title.edit', { defaultValue: 'Edit Workout' }) : name,
    animateKey: isEditing ? 'edit' : 'view',
    borderless: true,
    nativeOptions: { gestureEnabled: !isEditing, headerBackVisible: !isEditing },
    left: isEditing
      ? {
          kind: 'dismiss',
          onPress: cancelEditing,
          disabled: isSaving,
          accessibilityLabel: t('common.cancel', { defaultValue: 'Cancel' }),
          identifier: 'workout-detail-cancel',
        }
      : { kind: 'back' },
    right: isEditing
      ? canReorderEdit
        ? [reorderHeaderItem, saveHeaderItem]
        : saveHeaderItem
      : canEdit
        ? [
            saveAsPresetHeaderItem,
            {
              kind: 'text',
              label: t('common.edit', { defaultValue: 'Edit' }),
              role: 'secondary',
              onPress: startEditing,
              accessibilityLabel: t('workoutDetail.accessibility.editWorkout', { defaultValue: 'Edit workout' }),
              identifier: 'workout-detail-edit',
            },
          ]
        : saveAsPresetHeaderItem,
  });

  // Native-header mode: the glass header (above) replaces the custom header,
  // and the KeyboardAwareScrollView must be the screen root for the large
  // title to attach. Fallback mode keeps the custom header + padded wrapper.
  const content = (
    <>
      {header}

      <KeyboardAwareScrollView
        contentContainerClassName="px-4 py-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 + activeWorkoutBarPadding }}
        bottomOffset={20}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : undefined}
        // Set-row taps remount the focused input; stop the keyboard-hide
        // restore scroll so the refocus lands on the tapped cell (see
        // ActiveWorkoutScreen's scroll view).
        disableScrollOnKeyboardHide
      >
        {/* Title area */}
        <View className="mb-4">
          {isEditing ? (
            <FadeView key="edit-title">
              <Text className="text-sm font-medium text-text-secondary mb-1">{t('workoutDetail.labels.name', { defaultValue: 'Name' })}</Text>
              <FormInput
                value={formState.name}
                onChangeText={setFormName}
                placeholder={t('workoutDetail.placeholders.workoutName', { defaultValue: 'Workout Name' })}
                className="mb-2"
              />
            </FadeView>
          ) : !usesNativeHeader ? (
            <FadeView key="view-title">
              <Text className="text-xl font-bold text-text-primary mb-1">{name}</Text>
            </FadeView>
          ) : null}
          <View className="flex-row items-center">
            <Text className="text-sm text-text-muted">{sourceLabel}</Text>
            <Text className="text-sm text-text-muted mx-2">{'\u2022'}</Text>
            {isEditing ? (
              <TouchableOpacity
                className="flex-row items-center"
                onPress={() => calendarSheetRef.current?.present()}
                activeOpacity={0.7}
              >
                <Text className="text-sm" style={{ color: accentPrimary }}>
                  {formatDateLabel(formState.entryDate, t, dateLocale)}
                </Text>
                <Icon name="chevron-forward" size={14} color={accentPrimary} style={{ marginLeft: 2 }} />
              </TouchableOpacity>
            ) : entryDate ? (
              <Text className="text-sm text-text-muted">{formatDate(entryDate, dateLocale)}</Text>
            ) : null}
          </View>
        </View>

        {/* Summary card */}
        {renderSummaryCard()}

        {/* Start Workout button */}
        {!isEditing && canEdit && !isWorkoutActive && (
          <Button variant="primary" onPress={handleStartWorkout} className="mt-4">
            {t('workout.startWorkout', { defaultValue: 'Start Workout' })}
          </Button>
        )}

        {/* Pull back part of the scroll container's px-4 so the cards sit at
            the same 12px inset as the active workout screen (px-3). */}
        <View className="-mx-1">
          {isEditing ? (
            <WorkoutFormExerciseList
              ref={exerciseListRef}
              exercises={formState.exercises}
              weightUnit={weightUnit as 'kg' | 'lbs'}
              distanceUnit={distanceUnit}
              getImageSource={getImageSource}
              excludePresetEntryId={session.id}
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
              setExerciseCalories={setExerciseCalories}
              setExerciseNotes={setExerciseNotes}
              onReplaceExercise={handleReplaceExercise}
              clearExerciseCompletions={clearExerciseCompletions}
              supersetWith={supersetWith}
              ungroupExercise={ungroupExercise}
              onReorderExercises={reorderExercises}
              onAddExercisePress={openExerciseSearch}
              onViewExercise={(exercise) =>
                navigation.navigate('ExerciseDetail', { item: exercise, hideWorkoutActions: true })
              }
              isEligibleForPrefill={isEligibleForPrefill}
              showCompletion
              removeExerciseOnLastSetDelete
            />
          ) : (
            renderViewExercises()
          )}
        </View>

        {/* Edit controls */}
        {isEditing && (
          <FadeView>
            <View className="mt-4">
              <Text className="text-sm font-medium text-text-secondary mb-1">{t('workoutDetail.labels.notes', { defaultValue: 'Notes' })}</Text>
              <FormInput
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder={t('workoutDetail.placeholders.notes', { defaultValue: 'Add notes...' })}
                multiline
                style={{ minHeight: 60 }}
              />
            </View>
          </FadeView>
        )}

        {/* Notes (view mode) */}
        {!isEditing && session.notes && (
          <FadeView>
            <View className="mt-4 px-4">
              <Text className="text-sm font-medium text-text-secondary mb-1">{t('workoutDetail.labels.notes', { defaultValue: 'Notes' })}</Text>
              <Text className="text-sm text-text-primary">{session.notes}</Text>
            </View>
          </FadeView>
        )}

        {renderActivityDetails()}

        {/* Delete button */}
        {isEditing && (
          <FadeView>
            <Button
              variant="destructive"
              onPress={() => deleteWorkout.confirmAndDelete()}
              disabled={isDeleting}
              className="mt-6"
            >
              {isDeleting ? t('common.deleting', { defaultValue: 'Deleting...' }) : t('workoutDetail.actions.deleteWorkout', { defaultValue: 'Delete Workout' })}
            </Button>
          </FadeView>
        )}
      </KeyboardAwareScrollView>

      <CalendarSheet
        ref={calendarSheetRef}
        selectedDate={isEditing ? formState.entryDate : normalizedDate}
        onSelectDate={setFormDate}
      />

      <MetricColumnMenu
        anchor={metricMenu?.anchor ?? null}
        onClose={() => setMetricMenu(null)}
        includeWeightMetrics={!metricMenu?.clampedToRpe}
      />

      <ActionSheet
        ref={setMenuSheetRef}
        title={name}
        items={setMenuItems}
        onDismiss={() => setSetMenuTargetId(null)}
      />

      {accessoryBar}
    </>
  );

  if (usesNativeHeader) return content;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {content}
    </View>
  );
};

export default WorkoutDetailScreen;
