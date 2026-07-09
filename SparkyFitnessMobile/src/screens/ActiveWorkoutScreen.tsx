import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Modal,
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextInput,
} from 'react-native';
import {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
  KeyboardProvider,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { LinearTransition } from 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import { useQueryClient } from '@tanstack/react-query';

import ActiveWorkoutHeader, {
  buildExerciseProgress,
} from '../components/ActiveWorkoutHeader';
import ActiveWorkoutRail, { useSupersetBorders } from '../components/ActiveWorkoutRail';
import ActiveWorkoutExerciseCard from '../components/ActiveWorkoutExerciseCard';
import { MetricColumnMenu, SetTypeMenu } from '../components/WorkoutMenus';
import ActiveWorkoutRestBar from '../components/ActiveWorkoutRestBar';
import AnchoredMenu, { type AnchorRect } from '../components/AnchoredMenu';
import RestPeriodSheet, { type RestPeriodSheetRef } from '../components/RestPeriodSheet';
import WorkoutReorderList from '../components/WorkoutReorderList';
import Button from '../components/ui/Button';
import FormInput from '../components/FormInput';
import { useActiveWorkoutAutosave } from '../hooks/useActiveWorkoutAutosave';
import { invalidateExerciseCache } from '../hooks/invalidateExerciseCache';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useNavigationActionGuard } from '../hooks/useNavigationActionGuard';
import { usePreferences } from '../hooks/usePreferences';
import { useSelectedExercise } from '../hooks/useSelectedExercise';
import { deleteWorkout } from '../services/api/exerciseApi';
import { addLog } from '../services/LogService';
import { useActiveWorkoutStore, type ActiveSetPatch } from '../stores/activeWorkoutStore';
import { normalizeDate } from '../utils/dateUtils';
import { weightFromKg } from '../utils/unitConversions';
import {
  buildExerciseReorderItems,
  exerciseFromSnapshot,
} from '../utils/workoutSession';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ActiveWorkout'>;

/**
 * Centered modal prompt for renaming the live workout. Rendered here rather
 * than reaching for `Alert.prompt` because that is iOS-only; this works on both
 * platforms and matches the app's themed controls.
 */
function RenameWorkoutDialog({
  visible,
  initialName,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  initialName: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const inputRef = useRef<TextInput>(null);
  const [value, setValue] = useState(initialName);
  // Re-seed the field to the current name each time the dialog opens.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setValue(initialName);
  }
  const trimmed = value.trim();
  const submit = () => {
    if (trimmed.length > 0) onSubmit(trimmed);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      onShow={() => inputRef.current?.focus()}
    >
      {/* A native Modal renders in its own window, so the root KeyboardProvider
          doesn't reach it — mount a local one so KeyboardAvoidingView tracks the
          keyboard on both platforms (RN's own KAV is a no-op on Android). */}
      <KeyboardProvider>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Pressable
            className="flex-1 justify-center px-6"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onPress={onCancel}
            accessibilityLabel="Dismiss rename"
          >
            {/* Absorb taps on the card so only the backdrop dismisses. */}
            <Pressable className="bg-surface rounded-2xl p-5" onPress={() => {}} accessible={false}>
              <Text className="text-lg font-semibold text-text-primary mb-3">Rename workout</Text>
              <FormInput
                ref={inputRef}
                value={value}
                onChangeText={setValue}
                placeholder="Workout name"
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={submit}
              />
              <View className="flex-row justify-end gap-2 mt-4">
                <Button variant="ghost" onPress={onCancel}>
                  Cancel
                </Button>
                <Button variant="primary" onPress={submit} disabled={trimmed.length === 0}>
                  Save
                </Button>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </KeyboardProvider>
    </Modal>
  );
}

function ActiveWorkoutScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const session = useActiveWorkoutStore((s) => s.session);
  const sessionId = useActiveWorkoutStore((s) => s.sessionId);
  const startedAt = useActiveWorkoutStore((s) => s.startedAt);
  const completedSetIds = useActiveWorkoutStore((s) => s.completedSetIds);
  const prSetIds = useActiveWorkoutStore((s) => s.prSetIds);
  const activeSetId = useActiveWorkoutStore((s) => s.activeSetId);
  const restState = useActiveWorkoutStore((s) => s.rest.state);
  const restEndsAt = useActiveWorkoutStore((s) => s.rest.endsAt);
  const restPausedRemainingMs = useActiveWorkoutStore((s) => s.rest.pausedRemainingMs);
  const restDurationSec = useActiveWorkoutStore((s) => s.rest.durationSec);
  const createdByLiveStart = useActiveWorkoutStore((s) => s.createdByLiveStart);
  const queryClient = useQueryClient();

  const metricColumn = useAppPreferencesStore((s) => s.activeWorkoutMetricColumn);

  const { preferences } = usePreferences();
  const weightUnit = (preferences?.default_weight_unit ?? 'kg') as 'kg' | 'lbs';
  const { getImageSource } = useExerciseImageSource();
  const { flush } = useActiveWorkoutAutosave();
  const { runNavigationAction } = useNavigationActionGuard(navigation);

  // One 1s tick drives the elapsed clock, the rest countdown, and the guarded
  // rest-complete transition (the floating HUD is hidden on this route, so
  // this screen owns `markRestReady`). Set rows are memoized, so ticks only
  // re-render the header and rest bar.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (restState === 'resting' && restEndsAt != null && now >= restEndsAt) {
      useActiveWorkoutStore.getState().markRestReady();
    }
  }, [restState, restEndsAt, now]);

  // Flush unsaved edits when the screen loses focus, and on mount when a cold
  // start rehydrated a dirty session (the autosave hook wasn't mounted to see
  // that revision).
  useEffect(() => {
    if (useActiveWorkoutStore.getState().hasUnsavedChanges) void flush();
    const unsubscribe = navigation.addListener('blur', () => {
      void flush();
    });
    return unsubscribe;
  }, [navigation, flush]);

  // If the route is opened with no live workout (stale deep link), bail out.
  // Finish/Discard clear the session themselves and own their navigation, so
  // this only auto-pops when the screen *arrived* without a session.
  const hadSessionRef = useRef(sessionId != null);
  useEffect(() => {
    if (sessionId != null) {
      hadSessionRef.current = true;
      return;
    }
    if (!hadSessionRef.current && navigation.canGoBack()) navigation.goBack();
  }, [sessionId, navigation]);

  const activeExerciseId = useMemo(() => {
    if (session == null || activeSetId == null) return null;
    return (
      session.exercises.find((e) => e.sets.some((s) => String(s.id) === activeSetId))?.id ??
      null
    );
  }, [session, activeSetId]);

  // Reorder overlay. Gated on ≥2 draggable items (a lone exercise or a single
  // all-in-one superset run has nothing to reorder).
  const [reorderVisible, setReorderVisible] = useState(false);
  const reorderItemCount = useMemo(
    () => buildExerciseReorderItems(session?.exercises ?? []).length,
    [session],
  );
  const handleOpenReorder = useCallback(() => {
    // Live set inputs commit on blur — dismiss the keyboard so a focused edit
    // lands before the overlay covers the list.
    Keyboard.dismiss();
    setReorderVisible(true);
  }, []);

  // Superset display: adjacent 2+ runs get a flat left rail (log cards) and a
  // bottom bar (rail thumbs) in a per-group palette color.
  const exercisesForBorders = useMemo(() => session?.exercises ?? [], [session]);
  const { runs: supersetRuns, borders: supersetBorders } =
    useSupersetBorders(exercisesForBorders);

  // Expanded state: the cursor's exercise auto-expands as the workout
  // advances, auto-collapsing only the previously auto-expanded card — cards
  // the user opened by hand stay open.
  const [userExpandedIds, setUserExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [autoExpandedId, setAutoExpandedId] = useState<string | null>(activeExerciseId);
  const [focusedExerciseId, setFocusedExerciseId] = useState<string | null>(activeExerciseId);

  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  const cardOffsetsRef = useRef<Record<string, number>>({});
  const viewportHeightRef = useRef(0);
  const programmaticScrollUntilRef = useRef(0);

  const scrollToExercise = useCallback((entryId: string) => {
    const y = cardOffsetsRef.current[entryId];
    if (y == null) return;
    programmaticScrollUntilRef.current = Date.now() + 600;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  }, []);

  // Follow the cursor: when the active exercise changes, adopt it as the
  // auto-expanded/focused card. Render-time state adjust (not an effect) so
  // the expansion lands in the same commit as the cursor move.
  const [prevActiveExerciseId, setPrevActiveExerciseId] = useState(activeExerciseId);
  if (activeExerciseId !== prevActiveExerciseId) {
    // Keep a just-finished exercise expanded instead of auto-collapsing it as
    // the cursor moves on: promote it into the user-expanded set (still
    // collapsible by hand). Only when it's fully logged — a jump that leaves
    // holes shouldn't pin it open.
    const leaving = prevActiveExerciseId;
    if (leaving != null) {
      const leavingExercise = session?.exercises.find((e) => e.id === leaving);
      const leavingDone =
        leavingExercise != null &&
        leavingExercise.sets.length > 0 &&
        leavingExercise.sets.every((s) => completedSetIds[String(s.id)]);
      if (leavingDone) {
        setUserExpandedIds((prev) => {
          if (prev.has(leaving)) return prev;
          const next = new Set(prev);
          next.add(leaving);
          return next;
        });
      }
    }
    setPrevActiveExerciseId(activeExerciseId);
    if (activeExerciseId != null) {
      setAutoExpandedId(activeExerciseId);
      setFocusedExerciseId(activeExerciseId);
    }
  }

  useEffect(() => {
    if (activeExerciseId == null) return;
    // Defer so the newly expanded card has a measured offset before scrolling.
    const id = setTimeout(() => scrollToExercise(activeExerciseId), 350);
    return () => clearTimeout(id);
  }, [activeExerciseId, scrollToExercise]);

  const handleToggleExpanded = useCallback(
    (entryId: string) => {
      setUserExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(entryId)) {
          next.delete(entryId);
        } else if (autoExpandedId === entryId) {
          // Collapsing the auto-expanded card.
          setAutoExpandedId(null);
        } else {
          next.add(entryId);
        }
        return next;
      });
    },
    [autoExpandedId],
  );

  const handleRailPress = useCallback(
    (entryId: string) => {
      setUserExpandedIds((prev) => {
        if (prev.has(entryId) || autoExpandedId === entryId) return prev;
        const next = new Set(prev);
        next.add(entryId);
        return next;
      });
      setFocusedExerciseId(entryId);
      setTimeout(() => scrollToExercise(entryId), 100);
    },
    [autoExpandedId, scrollToExercise],
  );

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Date.now() < programmaticScrollUntilRef.current) return;
    const offset = event.nativeEvent.contentOffset.y;
    const probe = offset + viewportHeightRef.current / 3;
    let candidate: string | null = null;
    let candidateY = -Infinity;
    for (const [entryId, y] of Object.entries(cardOffsetsRef.current)) {
      if (y <= probe && y > candidateY) {
        candidate = entryId;
        candidateY = y;
      }
    }
    if (candidate != null) setFocusedExerciseId(candidate);
  }, []);

  // Distinguishes an ExerciseSearch return bound for Replace (an entry id) from
  // one bound for Add (null). Cleared on consume and whenever Add is opened, so
  // a cancelled replace can't misroute a later add.
  const replaceTargetEntryIdRef = useRef<string | null>(null);

  // ExerciseSearch return. Replace swaps the exercise in place; Add appends to
  // the end without moving the cursor, so expand the new card and scroll it
  // into view (deferred so the card has a measured offset before scrolling).
  useSelectedExercise(route.params, (exercise) => {
    const replaceTarget = replaceTargetEntryIdRef.current;
    if (replaceTarget != null) {
      replaceTargetEntryIdRef.current = null;
      useActiveWorkoutStore.getState().replaceExercise(replaceTarget, exercise);
      setFocusedExerciseId(replaceTarget);
      return;
    }
    useActiveWorkoutStore.getState().addExercise(exercise);
    const exercises = useActiveWorkoutStore.getState().session?.exercises ?? [];
    const added = exercises[exercises.length - 1];
    if (added != null) {
      const id = added.id;
      setUserExpandedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setFocusedExerciseId(id);
      setTimeout(() => scrollToExercise(id), 350);
    }
  });

  const handleAddExercise = useCallback(() => {
    replaceTargetEntryIdRef.current = null;
    runNavigationAction(() => {
      navigation.navigate('ExerciseSearch', { returnKey: route.key });
    });
  }, [navigation, route.key, runNavigationAction]);

  const handleReplaceExercise = useCallback(
    (entryId: string) => {
      replaceTargetEntryIdRef.current = entryId;
      runNavigationAction(() => {
        navigation.navigate('ExerciseSearch', { returnKey: route.key });
      });
    },
    [navigation, route.key, runNavigationAction],
  );

  const handleRemoveExercise = useCallback((entryId: string) => {
    const exercise = useActiveWorkoutStore
      .getState()
      .session?.exercises.find((e) => e.id === entryId);
    const name = exercise?.exercise_snapshot?.name ?? 'this exercise';
    Alert.alert('Remove exercise?', `${name} will be removed from this workout.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => useActiveWorkoutStore.getState().removeExercise(entryId),
      },
    ]);
  }, []);

  const handleClearExerciseSets = useCallback((entryId: string) => {
    useActiveWorkoutStore.getState().clearExerciseCompletions(entryId);
  }, []);

  const handleClearAllSets = useCallback(() => {
    Alert.alert(
      'Clear logged sets?',
      'Un-checks every logged set in this workout. Your set weights and reps are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => useActiveWorkoutStore.getState().clearAllCompletions(),
        },
      ],
    );
  }, []);

  // Tap an exercise thumbnail → its library detail. Maps the session's full
  // snapshot to an Exercise so the detail screen gets muscles/equipment/etc.
  const handlePressThumb = useCallback(
    (entryId: string) => {
      const entry = useActiveWorkoutStore
        .getState()
        .session?.exercises.find((e) => e.id === entryId);
      if (entry == null) return;
      const exercise = exerciseFromSnapshot(entry.exercise_snapshot, entry.exercise_id);
      runNavigationAction(() => {
        navigation.navigate('ExerciseDetail', { item: exercise, hideWorkoutActions: true });
      });
    },
    [navigation, runNavigationAction],
  );

  // Rest sheet (per-exercise rest duration).
  const restSheetRef = useRef<RestPeriodSheetRef>(null);
  const restSheetEntryIdRef = useRef<string | null>(null);
  const handlePressRestChip = useCallback((entryId: string, currentSec: number | null) => {
    restSheetEntryIdRef.current = entryId;
    restSheetRef.current?.present(currentSec);
  }, []);
  const handleRestChanged = useCallback((seconds: number) => {
    const entryId = restSheetEntryIdRef.current;
    if (entryId != null) {
      useActiveWorkoutStore.getState().setExerciseRest(entryId, seconds);
    }
  }, []);

  // Metric column picker.
  const [metricMenuAnchor, setMetricMenuAnchor] = useState<AnchorRect | null>(null);
  const handlePressMetricHeader = useCallback((anchor: AnchorRect) => {
    setMetricMenuAnchor(anchor);
  }, []);

  // Rename dialog.
  const [renameVisible, setRenameVisible] = useState(false);
  const handleRenameSubmit = useCallback((newName: string) => {
    useActiveWorkoutStore.getState().renameSession(newName);
    setRenameVisible(false);
  }, []);

  // Card ⋮ menu. 'main' offers the superset actions; 'pick' swaps in the
  // candidate list (ungrouped exercises other than the current one) at the
  // same anchor.
  const [overflowMenu, setOverflowMenu] = useState<{
    entryId: string;
    anchor: AnchorRect;
    mode: 'main' | 'pick';
  } | null>(null);
  const handlePressOverflow = useCallback(
    (entryId: string, anchor: AnchorRect) => {
      setOverflowMenu({ entryId, anchor, mode: 'main' });
    },
    [],
  );

  const overflowMenuItems = useMemo(() => {
    if (overflowMenu == null || session == null) return [];
    const { entryId, mode } = overflowMenu;
    const groupedIds = new Set(supersetRuns.flatMap((run) => run.entryIds));
    const candidates = session.exercises.filter(
      (e) => e.id !== entryId && !groupedIds.has(e.id),
    );

    if (mode === 'pick') {
      return candidates.map((candidate) => ({
        key: candidate.id,
        label: candidate.exercise_snapshot?.name ?? 'Exercise',
        onPress: () => {
          useActiveWorkoutStore.getState().supersetWith(entryId, candidate.id);
        },
      }));
    }

    const entry = session.exercises.find((e) => e.id === entryId);
    const entryHasCompleted =
      entry?.sets.some((s) => completedSetIds[String(s.id)] != null) ?? false;

    const items: { key: string; label: string; onPress: () => void }[] = [];
    items.push({
      key: 'view',
      label: 'View exercise',
      onPress: () => handlePressThumb(entryId),
    });
    if (candidates.length > 0) {
      items.push({
        key: 'superset-with',
        label: 'Superset with…',
        onPress: () => {
          // Re-open at the same anchor with the candidate list. AnchoredMenu
          // closes first (onClose), then this runs — both land in one commit.
          setOverflowMenu({ ...overflowMenu, mode: 'pick' });
        },
      });
    }
    if (groupedIds.has(entryId)) {
      items.push({
        key: 'ungroup',
        label: 'Remove from superset',
        onPress: () => {
          useActiveWorkoutStore.getState().ungroupExercise(entryId);
        },
      });
    }
    // handleReplaceExercise writes replaceTargetEntryIdRef only inside this
    // deferred onPress (on menu tap), never during render — the linter can't
    // see that through the memo. Same pattern as BottomSheetPicker's trigger.
    // eslint-disable-next-line react-hooks/refs
    items.push({
      key: 'replace',
      label: 'Replace exercise',
      onPress: () => handleReplaceExercise(entryId),
    });
    if (entryHasCompleted) {
      items.push({
        key: 'clear',
        label: 'Clear logged sets',
        onPress: () => handleClearExerciseSets(entryId),
      });
    }
    if (reorderItemCount >= 2) {
      items.push({
        key: 'reorder',
        label: 'Reorder exercises',
        onPress: handleOpenReorder,
      });
    }
    items.push({
      key: 'remove',
      label: 'Remove exercise',
      onPress: () => handleRemoveExercise(entryId),
    });
    return items;
  }, [
    overflowMenu,
    session,
    supersetRuns,
    reorderItemCount,
    handleOpenReorder,
    completedSetIds,
    handlePressThumb,
    handleReplaceExercise,
    handleClearExerciseSets,
    handleRemoveExercise,
  ]);

  // Live editing: which set cell is tap-focused (the keyboard target). Distinct
  // from activeSetId (the cursor / log ring), so tapping an earlier set to fix a
  // value doesn't move the cursor.
  const [focusedSetId, setFocusedSetId] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<'weight' | 'reps' | 'rpe'>('weight');
  const handleActivateSet = useCallback((setId: string, field: 'weight' | 'reps') => {
    setFocusedField(field);
    setFocusedSetId(setId);
  }, []);
  // Tapping the RPE column focuses that row's RPE input directly (the row's
  // focus effect reads `focusedField`).
  const handleActivateRpe = useCallback((setId: string) => {
    setFocusedField('rpe');
    setFocusedSetId(setId);
  }, []);
  const handleDeactivateSet = useCallback(() => {
    setFocusedSetId(null);
  }, []);

  const handleCompleteSet = useCallback((setId: string) => {
    useActiveWorkoutStore.getState().completeSet(setId);
    // Logging advances the cursor and (usually) starts a rest — drop the
    // keyboard so the rest bar is unobstructed and the logged inputs collapse.
    setFocusedSetId(null);
    Keyboard.dismiss();
    // When that was the last unlogged set, the cursor has nowhere to advance,
    // so the follow-cursor scroll won't fire. Surface the End Workout button
    // instead. Deferred so the just-logged card's collapse/layout settles;
    // guarded so handleScroll doesn't re-home the focused exercise mid-scroll.
    const store = useActiveWorkoutStore.getState();
    const completed = store.completedSetIds;
    const remaining =
      store.session?.exercises.reduce(
        (sum, e) => sum + e.sets.filter((s) => !completed[String(s.id)]).length,
        0,
      ) ?? 0;
    if (remaining === 0) {
      programmaticScrollUntilRef.current = Date.now() + 600;
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 350);
    }
  }, []);
  const handleUncomplete = useCallback((setId: string) => {
    useActiveWorkoutStore.getState().uncompleteSet(setId);
  }, []);
  const handleCommitField = useCallback((setId: string, patch: ActiveSetPatch) => {
    useActiveWorkoutStore.getState().updateSetField(setId, patch);
  }, []);
  const handleAddSet = useCallback((entryId: string) => {
    useActiveWorkoutStore.getState().addSetToExercise(entryId);
  }, []);

  const handleDeleteSet = useCallback((setId: string) => {
    const store = useActiveWorkoutStore.getState();
    const exercise = store.session?.exercises.find((e) =>
      e.sets.some((s) => String(s.id) === setId),
    );
    if (exercise != null && exercise.sets.length <= 1) {
      const name = exercise.exercise_snapshot?.name ?? 'this exercise';
      Alert.alert(
        'Remove exercise?',
        `Deleting the only set removes ${name} from this workout.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => useActiveWorkoutStore.getState().deleteSet(setId),
          },
        ],
      );
      return;
    }
    store.deleteSet(setId);
  }, []);

  // Set-type menu: tapping a set number (or long-pressing the row) anchors
  // the shared SetTypeMenu. Replaces an Alert, which capped at 3 buttons on
  // Android and hid half the options.
  const [setTypeMenu, setSetTypeMenu] = useState<{ setId: string; anchor: AnchorRect } | null>(
    null,
  );
  const handlePressSetType = useCallback((setId: string, anchor: AnchorRect) => {
    setSetTypeMenu({ setId, anchor });
  }, []);
  const setTypeCurrent = useMemo(() => {
    if (setTypeMenu == null || session == null) return null;
    for (const exercise of session.exercises) {
      const set = exercise.sets.find((s) => String(s.id) === setTypeMenu.setId);
      if (set) return set.set_type ?? 'normal';
    }
    return null;
  }, [setTypeMenu, session]);

  const handleDiscard = useCallback(() => {
    // Live-start sessions exist on the server only because the user hit Start,
    // so discarding deletes them instead of leaving a stray diary workout.
    // Sessions started from WorkoutDetail keep their keep-server-edits discard.
    if (createdByLiveStart && sessionId != null) {
      const idToDelete = sessionId;
      // entry_date can round-trip as an ISO timestamp; un-normalized it would
      // silently miss the daily-summary cache key on invalidation.
      const entryDate = session?.entry_date != null ? normalizeDate(session.entry_date) : null;
      Alert.alert('Discard workout?', 'This deletes the workout from your diary.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            // Clear and exit first: clearing cancels the pending autosave
            // debounce and frees the user immediately; the delete finishes in
            // the background (a racing autosave 404s harmlessly server-side).
            useActiveWorkoutStore.getState().clearWorkout();
            navigation.goBack();
            deleteWorkout(idToDelete)
              .then(() => {
                if (entryDate != null) invalidateExerciseCache(queryClient, entryDate);
              })
              .catch((error: unknown) => {
                addLog(`Failed to delete discarded live-start workout: ${error}`, 'ERROR');
                Toast.show({
                  type: 'error',
                  text1: "Couldn't delete workout",
                  text2: 'It remains in your diary.',
                });
              });
          },
        },
      ]);
      return;
    }

    Alert.alert(
      'Discard workout?',
      'Clears your progress on this device and drops unsaved changes. Edits already saved to the server are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            useActiveWorkoutStore.getState().clearWorkout();
            navigation.goBack();
          },
        },
      ],
    );
  }, [createdByLiveStart, sessionId, session, queryClient, navigation]);

  const handleFinish = useCallback(async () => {
    // Named so the failure alert's Retry can re-run the same attempt.
    async function attempt(): Promise<void> {
      const ok = await flush();
      if (!ok) {
        Alert.alert(
          'Could not save your workout',
          'Some changes have not reached the server yet.',
          [
            { text: 'Retry', onPress: () => void attempt() },
            {
              text: 'Discard changes',
              style: 'destructive',
              onPress: () => {
                useActiveWorkoutStore.getState().clearWorkout();
                navigation.goBack();
              },
            },
            { text: 'Cancel', style: 'cancel' },
          ],
        );
        return;
      }
      useActiveWorkoutStore.getState().clearWorkout();
      navigation.goBack();
    }
    await attempt();
  }, [flush, navigation]);

  const handleConfirmEnd = useCallback(() => {
    const totalSets =
      session?.exercises.reduce((sum, e) => sum + e.sets.length, 0) ?? 0;
    const doneSets =
      session?.exercises.reduce(
        (sum, e) => sum + e.sets.filter((s) => completedSetIds[String(s.id)]).length,
        0,
      ) ?? 0;
    const remaining = totalSets - doneSets;
    const message =
      remaining > 0
        ? `${doneSets} of ${totalSets} sets logged. ${remaining} still to go.`
        : `All ${totalSets} sets logged. Nice work!`;
    Alert.alert('End workout?', message, [
      { text: 'Keep going', style: 'cancel' },
      { text: 'End Workout', style: 'default', onPress: () => void handleFinish() },
    ]);
  }, [session, completedSetIds, handleFinish]);

  if (session == null || sessionId == null) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-base text-text-muted">No active workout</Text>
      </View>
    );
  }

  const progress = buildExerciseProgress(session, completedSetIds);
  const hasAnyCompletedSets = Object.keys(completedSetIds).length > 0;

  const restVisible = restState !== 'ready';
  const restRemainingMs = (() => {
    if (restState === 'resting' && restEndsAt != null) {
      return Math.max(0, restEndsAt - now);
    }
    if (restState === 'paused' && restPausedRemainingMs != null) {
      return restPausedRemainingMs;
    }
    return 0;
  })();
  const restLabel = (() => {
    if (activeSetId == null) return '';
    for (const exercise of session.exercises) {
      const set = exercise.sets.find((s) => String(s.id) === activeSetId);
      if (set) {
        return `${exercise.exercise_snapshot?.name ?? 'Exercise'} · Set ${set.set_number}`;
      }
    }
    return '';
  })();
  // Target load for the upcoming set, shown under the rest label so the user
  // knows what's next while resting.
  const restNextSetText = (() => {
    if (activeSetId == null) return null;
    for (const exercise of session.exercises) {
      const set = exercise.sets.find((s) => String(s.id) === activeSetId);
      if (!set) continue;
      if (set.weight != null && set.reps != null) {
        const w = parseFloat(weightFromKg(set.weight, weightUnit).toFixed(1));
        return `${w} ${weightUnit} × ${set.reps}`;
      }
      if (set.reps != null) return `${set.reps} reps`;
      if (set.weight != null) {
        const w = parseFloat(weightFromKg(set.weight, weightUnit).toFixed(1));
        return `${w} ${weightUnit}`;
      }
      return null;
    }
    return null;
  })();

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ActiveWorkoutHeader
        name={session.name}
        startedAt={startedAt}
        now={now}
        progress={progress}
        onBack={() => navigation.goBack()}
        onDiscard={handleDiscard}
        onEndWorkout={handleConfirmEnd}
        onRename={() => setRenameVisible(true)}
        onAddExercise={handleAddExercise}
        onReorder={reorderItemCount >= 2 ? handleOpenReorder : undefined}
        onClearAllSets={hasAnyCompletedSets ? handleClearAllSets : undefined}
      />

      <ActiveWorkoutRail
        exercises={session.exercises}
        completedSetIds={completedSetIds}
        focusedEntryId={focusedExerciseId}
        activeEntryId={activeExerciseId}
        supersetBorders={supersetBorders}
        getImageSource={getImageSource}
        onPressExercise={handleRailPress}
        onPressAdd={handleAddExercise}
      />

      <KeyboardAwareScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="px-3 pt-2"
        contentContainerStyle={{ paddingBottom: restVisible ? 16 : insets.bottom + 16 }}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        onLayout={(e) => {
          viewportHeightRef.current = e.nativeEvent.layout.height;
        }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={80}
      >
        {session.exercises.map((exercise) => {
          const isExpanded =
            userExpandedIds.has(exercise.id) || autoExpandedId === exercise.id;
          const supersetBorder = supersetBorders.get(exercise.id) ?? null;
          const card = (
            <ActiveWorkoutExerciseCard
              exercise={exercise}
              expanded={isExpanded}
              completedSetIds={completedSetIds}
              prSetIds={prSetIds}
              excludePresetEntryId={sessionId ?? undefined}
              activeSetId={activeSetId}
              focusedSetId={focusedSetId}
              activeField={focusedField}
              metricColumn={metricColumn}
              weightUnit={weightUnit}
              getImageSource={getImageSource}
              onPressThumb={handlePressThumb}
              onToggleExpanded={handleToggleExpanded}
              onPressRestChip={handlePressRestChip}
              onPressMetricHeader={handlePressMetricHeader}
              onPressOverflow={handlePressOverflow}
              onComplete={handleCompleteSet}
              onUncomplete={handleUncomplete}
              onCommitField={handleCommitField}
              onDeleteSet={handleDeleteSet}
              onPressSetType={handlePressSetType}
              onAddSet={handleAddSet}
              onActivateSet={handleActivateSet}
              onActivateRpe={handleActivateRpe}
              onDeactivateSet={handleDeactivateSet}
            />
          );

          return (
            <Animated.View
              key={exercise.id}
              layout={LinearTransition.duration(300)}
              onLayout={(e) => {
                cardOffsetsRef.current[exercise.id] = e.nativeEvent.layout.y;
              }}
            >
              {supersetBorder ? (
                // Grouped members carry a flat 3px left rail. Interior rails
                // run the full wrapper height, meeting the next member's rail
                // at the divider so consecutive members read as one continuous
                // line; the run's last member stops ~8px short to end at the
                // card content rather than the divider.
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

        <Button
          variant="ghost"
          onPress={handleAddExercise}
          className="mt-5 mx-1"
        >
          Add Exercise
        </Button>

        <Button
          variant="primary"
          onPress={handleConfirmEnd}
          className="mt-2 mb-2 mx-1"
        >
          End Workout
        </Button>
      </KeyboardAwareScrollView>

      {restVisible && (
        <ActiveWorkoutRestBar
          remainingMs={restRemainingMs}
          durationSec={restDurationSec}
          paused={restState === 'paused'}
          label={restLabel}
          nextSetText={restNextSetText}
          onAdjust={(deltaSec) => useActiveWorkoutStore.getState().adjustRest(deltaSec)}
          onSkip={() => useActiveWorkoutStore.getState().dismissRest()}
          onPause={() => useActiveWorkoutStore.getState().pauseRest()}
          onResume={() => useActiveWorkoutStore.getState().resumeRest()}
        />
      )}

      <RestPeriodSheet ref={restSheetRef} onChange={handleRestChanged} />

      <RenameWorkoutDialog
        visible={renameVisible}
        initialName={session.name}
        onCancel={() => setRenameVisible(false)}
        onSubmit={handleRenameSubmit}
      />

      <MetricColumnMenu
        anchor={metricMenuAnchor}
        onClose={() => setMetricMenuAnchor(null)}
      />

      <AnchoredMenu
        visible={overflowMenu != null && overflowMenuItems.length > 0}
        anchor={overflowMenu?.anchor ?? null}
        onClose={() => setOverflowMenu(null)}
        minWidth={200}
        items={overflowMenuItems}
      />

      <SetTypeMenu
        anchor={setTypeCurrent != null ? (setTypeMenu?.anchor ?? null) : null}
        currentType={setTypeCurrent}
        onClose={() => setSetTypeMenu(null)}
        onSelect={(type) => {
          const setId = setTypeMenu?.setId;
          if (setId != null) {
            useActiveWorkoutStore.getState().updateSetField(setId, { set_type: type });
          }
        }}
      />

      <WorkoutReorderList
        visible={reorderVisible}
        exercises={session.exercises}
        getImageSource={getImageSource}
        onMoveItem={(from, to) =>
          useActiveWorkoutStore.getState().reorderExercises(from, to)
        }
        onDone={() => setReorderVisible(false)}
      />
    </View>
  );
}

export default ActiveWorkoutScreen;
