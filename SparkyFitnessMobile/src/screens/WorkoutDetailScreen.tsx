import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
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
import ActiveWorkoutExerciseCard from '../components/ActiveWorkoutExerciseCard';
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
import {
  useDeleteWorkout,
  useUpdateWorkout,
} from '../hooks/useExerciseMutations';
import { flushActiveWorkoutBeforeClear } from '../hooks/useActiveWorkoutAutosave';
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
import { ensureNotificationPermission } from '../services/notifications';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader, SAVE_LABEL, SAVING_LABEL, type HeaderItem } from '../hooks/useScreenHeader';
import { useSupersetBorders } from '../components/ActiveWorkoutRail';
import type { RootStackScreenProps } from '../types/navigation';
import type { UpdatePresetSessionRequest } from '@workspace/shared';

type Props = RootStackScreenProps<'WorkoutDetail'>;

const WorkoutDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const [session, setSession] = useState(route.params.session);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { preferences } = usePreferences();
  const weightUnit = preferences?.default_weight_unit ?? 'kg';

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

  // Metric column is shared with the active-workout screen — changing it on
  // either screen changes both (intended).
  const metricColumn = useAppPreferencesStore((s) => s.activeWorkoutMetricColumn);
  const [metricMenuAnchor, setMetricMenuAnchor] = useState<AnchorRect | null>(null);
  const handlePressMetricHeader = useCallback((anchor: AnchorRect) => {
    setMetricMenuAnchor(anchor);
  }, []);

  // Active workout state (narrow selectors — avoid re-rendering on unrelated changes)
  const activeSessionId = useActiveWorkoutStore((s) => s.sessionId);
  const activeSetId = useActiveWorkoutStore((s) => s.activeSetId);
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const isWorkoutActive = activeSessionId === session.id;

  const toggleSection = useCallback((key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Auto-expand the exercise containing the active set while the workout is
  // running for this session — so opening the detail page mid-workout (e.g.
  // from the Diary) lands with the current exercise already open. Never
  // auto-collapses; the user can still close it manually, and it re-expands
  // only when the active set advances into a different exercise.
  useEffect(() => {
    if (!isWorkoutActive || activeSetId == null) return;
    const activeExercise = session.exercises.find(ex =>
      ex.sets.some(s => String(s.id) === activeSetId),
    );
    if (!activeExercise) return;
    // Syncs the expanded section to the external active-workout store; guarded so
    // it only auto-expands the active exercise, never collapses a user's choice.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedSections(prev =>
      prev[activeExercise.id] ? prev : { ...prev, [activeExercise.id]: true },
    );
  }, [isWorkoutActive, activeSetId, session]);

  const { label: sourceLabel, isSparky } = getSourceLabel(session.source);
  const entryDate = session.entry_date ?? '';
  const normalizedDate = normalizeDate(entryDate);

  const { name } = getWorkoutSummary(session);

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
    addSet,
    removeSet,
    updateSetField,
    updateSetMeta,
    setExerciseRest,
    supersetWith,
    ungroupExercise,
    reorderExercises,
    setName: setFormName,
    setDate: setFormDate,
    populate,
    exercisesModifiedRef,
  } = useWorkoutForm({ isEditMode: true, skipDraftLoad: true });
  const submission = useMemo(
    () => getWorkoutDraftSubmission(formState, weightUnit as 'kg' | 'lbs'),
    [formState, weightUnit],
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

  const {
    activeSetKey,
    activeSetField,
    handleAddExercise,
    handleRemoveExercise,
    handleAddSet,
    activateSet,
    deactivateSet,
  } = useExerciseSetEditing({ addExercise: wrappedAddExercise, removeExercise, addSet });

  const isEligibleForPrefill = useCallback(
    (clientId: string) => eligibleIds.has(clientId),
    [eligibleIds],
  );

  const startEditing = useCallback(() => {
    populate(session, weightUnit as 'kg' | 'lbs');
    setEditNotes(session.notes ?? '');
    setEligibleIds(new Set());
    setIsEditing(true);
  }, [populate, session, weightUnit]);

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
  // copy on focus — otherwise edit-saves built from the stale
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
      void ensureNotificationPermission();
      const store = useActiveWorkoutStore.getState();
      if (atSetId != null) store.startWorkoutAtSet(session, atSetId);
      else store.startWorkout(session);
      navigation.replace('ActiveWorkout');
    },
    [session, navigation],
  );

  // Start this workout, first offering to clear any other in-progress session
  // (mirrors useStartLiveWorkout's "Replace current workout?" prompt). The
  // Start button and "Start workout here" long-press are both gated on
  // !isWorkoutActive, so a non-null sessionId here means a *different* workout.
  const beginWorkout = useCallback(
    (atSetId?: string) => {
      if (useActiveWorkoutStore.getState().sessionId !== null) {
        Alert.alert(
          'Replace current workout?',
          'You already have a workout in progress. Starting this one clears it here — any sets already saved stay in your diary.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Clear & Start',
              style: 'destructive',
              onPress: () => {
                void (async () => {
                  // Best-effort save of the in-progress session before dropping
                  // it locally, mirroring the HUD's Clear action.
                  await flushActiveWorkoutBeforeClear(queryClient);
                  useActiveWorkoutStore.getState().clearWorkout();
                  enterLiveWorkout(atSetId);
                })();
              },
            },
          ],
        );
        return;
      }
      enterLiveWorkout(atSetId);
    },
    [queryClient, enterLiveWorkout],
  );

  const handleStartWorkout = () => beginWorkout();

  const handleLongPressSet = useCallback(
    (setId: string) => {
      const buttons: {
        text: string;
        style?: 'cancel' | 'destructive';
        onPress?: () => void;
      }[] = [];

      if (isSparky) {
        buttons.push({ text: 'Edit', onPress: startEditing });
      }

      // Gated on isSparky like the Start button: a live workout autosaves via
      // the nested-exercise update, which the server rejects (409) for
      // synced (non-manual/sparky) sessions.
      if (!isWorkoutActive && isSparky) {
        buttons.push({
          text: 'Start workout here',
          onPress: () => beginWorkout(setId),
        });
      }

      if (buttons.length === 0) return;

      buttons.push({ text: 'Cancel', style: 'cancel' });
      Alert.alert(name, undefined, buttons);
    },
    [isSparky, isWorkoutActive, name, startEditing, beginWorkout],
  );

  const openExerciseSearch = () => {
    navigation.navigate('ExerciseSearch', { returnKey: route.key });
  };

  // Tap an exercise thumbnail → its library detail. Session entries carry a
  // full snapshot, so the detail screen opens with muscles/equipment already
  // populated (and still hydrates by id).
  const handleViewExercise = useCallback(
    (entryId: string) => {
      const entry = session.exercises.find((e) => e.id === entryId);
      if (!entry) return;
      navigation.navigate('ExerciseDetail', {
        item: exerciseFromSnapshot(entry.exercise_snapshot, entry.exercise_id),
        hideWorkoutActions: true,
      });
    },
    [session, navigation],
  );

  // --- Save ---

  const handleSave = useCallback(async () => {
    const editedDate = submission.entryDate;
    const dateChanged = editedDate !== normalizedDate;

    try {
      if (exercisesModifiedRef.current && !submission.canSave) {
        Toast.show({
          type: 'error',
          text1: 'Workout needs an exercise',
          text2: 'Add at least one exercise with a set or delete the workout.',
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
      Toast.show({ type: 'error', text1: 'Failed to save workout', text2: 'Please try again.' });
    }
  }, [submission, normalizedDate, editNotes, updateSession, session, invalidateSessionCache, deactivateSet, exercisesModifiedRef]);

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
            getImageSource={getImageSource}
            showRestChip={isSparky}
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

    const items = extractActivitySummary(details);
    if (items.length === 0) return null;

    return (
      <View className="bg-surface rounded-xl p-4 mt-4">
        <Text className="text-base font-semibold text-text-primary mb-2">Details</Text>
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

    const summaryItems: { value: string; label: string }[] = [];
    summaryItems.push({
      value: String(exerciseCount),
      label: exerciseCount === 1 ? 'Exercise' : 'Exercises',
    });
    if (totalSets > 0) summaryItems.push({ value: String(totalSets), label: 'Sets' });
    if (totalVolume > 0) {
      const volumeLabel = isEditing
        ? `${Math.round(totalVolume).toLocaleString()} ${weightUnit}`
        : formatVolume(totalVolume, weightUnit);
      summaryItems.push({ value: volumeLabel, label: 'Volume' });
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
    accessibilityLabel: 'Save',
    identifier: 'workout-detail-save',
  };
  const reorderHeaderItem: HeaderItem = {
    kind: 'icon',
    sfSymbol: 'arrow.up.arrow.down',
    ionicon: 'swap-vertical',
    role: 'secondary',
    onPress: () => exerciseListRef.current?.openReorder(),
    accessibilityLabel: 'Reorder exercises',
    identifier: 'workout-detail-reorder',
  };

  // Small inline native title (set in App.tsx as a small title so re-applying it
  // for the edit-mode swap updates in place rather than flying in a large one).
  // View mode: name + owner-only Edit (the in-body name is suppressed since it
  // lives in the bar). Edit mode: "Edit Workout" title, X-dismiss owning the
  // left slot with swipe-back disabled, Save (+ reorder) on the right; name
  // edited in-body.
  const header = useScreenHeader({
    nativeTitle: isEditing ? 'Edit Workout' : name,
    animateKey: isEditing ? 'edit' : 'view',
    borderless: true,
    nativeOptions: { gestureEnabled: !isEditing, headerBackVisible: !isEditing },
    left: isEditing
      ? {
          kind: 'dismiss',
          onPress: cancelEditing,
          disabled: isSaving,
          accessibilityLabel: 'Cancel',
          identifier: 'workout-detail-cancel',
        }
      : { kind: 'back' },
    right: isEditing
      ? canReorderEdit
        ? [reorderHeaderItem, saveHeaderItem]
        : saveHeaderItem
      : isSparky
        ? {
            kind: 'text',
            label: 'Edit',
            role: 'secondary',
            onPress: startEditing,
            accessibilityLabel: 'Edit workout',
            identifier: 'workout-detail-edit',
          }
        : null,
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
      >
        {/* Title area */}
        <View className="mb-4">
          {isEditing ? (
            <FadeView key="edit-title">
              <Text className="text-sm font-medium text-text-secondary mb-1">Name</Text>
              <FormInput
                value={formState.name}
                onChangeText={setFormName}
                placeholder="Workout Name"
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
                  {formatDateLabel(formState.entryDate)}
                </Text>
                <Icon name="chevron-forward" size={14} color={accentPrimary} style={{ marginLeft: 2 }} />
              </TouchableOpacity>
            ) : entryDate ? (
              <Text className="text-sm text-text-muted">{formatDate(entryDate)}</Text>
            ) : null}
          </View>
        </View>

        {/* Summary card */}
        {renderSummaryCard()}

        {/* Start Workout button */}
        {!isEditing && isSparky && !isWorkoutActive && (
          <Button variant="primary" onPress={handleStartWorkout} className="mt-4">
            Start Workout
          </Button>
        )}

        {/* Exercises */}
        {isEditing ? (
          <WorkoutFormExerciseList
            ref={exerciseListRef}
            exercises={formState.exercises}
            weightUnit={weightUnit as 'kg' | 'lbs'}
            getImageSource={getImageSource}
            activeSetKey={activeSetKey}
            activeSetField={activeSetField}
            onActivateSet={activateSet}
            onDeactivateSet={deactivateSet}
            updateSetField={updateSetField}
            updateSetMeta={updateSetMeta}
            removeSet={removeSet}
            onAddSet={handleAddSet}
            onRemoveExercise={handleRemoveExercise}
            setExerciseRest={setExerciseRest}
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
        ) : renderViewExercises()}

        {/* Edit controls */}
        {isEditing && (
          <FadeView>
            <View className="mt-4">
              <Text className="text-sm font-medium text-text-secondary mb-1">Notes</Text>
              <FormInput
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Add notes..."
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
              <Text className="text-sm font-medium text-text-secondary mb-1">Notes</Text>
              <Text className="text-sm text-text-primary">{session.notes}</Text>
            </View>
          </FadeView>
        )}

        {renderActivityDetails()}

        {/* Delete button */}
        {isEditing && (
          <FadeView>
            <Button
              variant="ghost"
              onPress={() => deleteWorkout.confirmAndDelete()}
              disabled={isDeleting}
              className="mt-6"
            >
              <Text className="text-bg-danger text-base font-medium">
                {isDeleting ? 'Deleting...' : 'Delete Workout'}
              </Text>
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
        anchor={metricMenuAnchor}
        onClose={() => setMetricMenuAnchor(null)}
      />
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
