import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Keyboard,
  LayoutAnimation,
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
  KeyboardStickyView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { LinearTransition } from 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import { useQueryClient } from '@tanstack/react-query';

import ActiveWorkoutHeader, {
  buildExerciseProgress,
} from '../components/ActiveWorkoutHeader';
import ActiveWorkoutRail, { useSupersetBorders } from '../components/ActiveWorkoutRail';
import ActiveWorkoutExerciseCard from '../components/ActiveWorkoutExerciseCard';
import type { SetRowAccessoryHandle } from '../components/ActiveWorkoutSetRow';
import KeyboardCollapsible from '../components/KeyboardCollapsible';
import {
  SetInputAccessoryBar,
  useDeactivateOnKeyboardDismiss,
  type SetAccessoryAction,
  type SetInputField,
} from '../components/SetRowChrome';
import { MetricColumnMenu, SetTypeMenu } from '../components/WorkoutMenus';
import ActiveWorkoutRestBar, {
  REST_BAR_GLASS_CLEARANCE,
} from '../components/ActiveWorkoutRestBar';
import ActionSheet, {
  type ActionSheetItem,
  type ActionSheetRef,
} from '../components/ActionSheet';
import { type AnchorRect } from '../components/AnchoredMenu';
import ExerciseSetRestSheet, {
  type ExerciseSetRestSheetRef,
  type ExerciseSetRestUpdate,
} from '../components/ExerciseSetRestSheet';
import WorkoutDurationSheet, {
  type WorkoutDurationSheetRef,
} from '../components/WorkoutDurationSheet';
import WorkoutReorderList from '../components/WorkoutReorderList';
import Button from '../components/ui/Button';
import FormInput from '../components/FormInput';
import { useActiveWorkoutAutosave } from '../hooks/useActiveWorkoutAutosave';
import { invalidateExerciseCache } from '../hooks/invalidateExerciseCache';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useNavigationActionGuard } from '../hooks/useNavigationActionGuard';
import { usePreferences } from '../hooks/usePreferences';
import { useRestCountdown } from '../hooks/useRestCountdown';
import { useSelectedExercise } from '../hooks/useSelectedExercise';
import { deleteWorkout } from '../services/api/exerciseApi';
import { addLog } from '../services/LogService';
import { useNativeIOSTabsActive } from '../services/nativeTabBarPreference';
import { getActiveServerConfig } from '../services/storage';
import { useActiveWorkoutStore, type ActiveSetPatch } from '../stores/activeWorkoutStore';
import { normalizeDate } from '../utils/dateUtils';
import { runAfterKeyboardSettles } from '../utils/keyboardFocus';
import {
  buildExerciseReorderItems,
  describeActiveSet,
  exerciseFromSnapshot,
  formatDuration,
  formatSetLoad,
  getSupersetRuns,
  rendersCardioEffortForm,
  summarizeWorkoutSpan,
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
  const { t } = useTranslation();
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
          doesn't reach it; mount a local one so KeyboardAvoidingView tracks the
          keyboard on both platforms (RN's own KAV is a no-op on Android). */}
      <KeyboardProvider>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Pressable
            className="flex-1 justify-center px-6"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onPress={onCancel}
            accessibilityLabel={t('workout.dismissRename', { defaultValue: 'Dismiss rename' })}
          >
            {/* Absorb taps on the card so only the backdrop dismisses. */}
            <Pressable className="bg-surface rounded-2xl p-5" onPress={() => {}} accessible={false}>
              <Text className="text-lg font-semibold text-text-primary mb-3">{t('workout.renameWorkout', { defaultValue: 'Rename workout' })}</Text>
              <FormInput
                ref={inputRef}
                value={value}
                onChangeText={setValue}
                placeholder={t('workout.renamePlaceholder', { defaultValue: 'Workout name' })}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={submit}
              />
              <View className="flex-row justify-end gap-2 mt-4">
                <Button variant="ghost" onPress={onCancel}>
                  {t('common.cancel', { defaultValue: 'Cancel' })}
                </Button>
                <Button variant="primary" onPress={submit} disabled={trimmed.length === 0}>
                  {t('common.save', { defaultValue: 'Save' })}
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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const session = useActiveWorkoutStore((s) => s.session);
  const sessionId = useActiveWorkoutStore((s) => s.sessionId);
  const sourcePresetId = useActiveWorkoutStore((s) => s.sourcePresetId);
  const sourceServerConfigId = useActiveWorkoutStore((s) => s.sourceServerConfigId);
  const startedAt = useActiveWorkoutStore((s) => s.startedAt);
  const completedSetIds = useActiveWorkoutStore((s) => s.completedSetIds);
  const prSetIds = useActiveWorkoutStore((s) => s.prSetIds);
  const setRenderKeys = useActiveWorkoutStore((s) => s.setRenderKeys);
  const activeSetId = useActiveWorkoutStore((s) => s.activeSetId);
  const {
    state: restState,
    remainingMs: restRemainingMs,
    progress: restProgress,
  } = useRestCountdown({ selfTick: false });
  const usesGlassRestBar = useNativeIOSTabsActive();
  const createdByLiveStart = useActiveWorkoutStore((s) => s.createdByLiveStart);
  const queryClient = useQueryClient();

  const metricColumn = useAppPreferencesStore((s) => s.activeWorkoutMetricColumn);

  const { preferences } = usePreferences();
  const weightUnit = (preferences?.default_weight_unit ?? 'kg') as 'kg' | 'lbs';
  const distanceUnit = (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const { getImageSource } = useExerciseImageSource();

  // Preset ids are per-server; a config switched since the workout started
  // (such as the user backgrounding this screen, switching servers in
  // settings, and coming back) can resolve the id against the wrong server's
  // preset. sourcePresetId/sourceServerConfigId are fixed for the whole
  // session, so a switch that happens without this screen unmounting would
  // never re-trigger the check on its own — re-verify on every focus regain
  // instead, and clear immediately so a stale verified id from the old
  // server can't leak through while the fresh check is in flight.
  const isFocused = useIsFocused();
  const [verifiedSourcePresetId, setVerifiedSourcePresetId] = useState<
    number | undefined
  >(undefined);
  useEffect(() => {
    if (!isFocused || sourcePresetId == null) {
      setVerifiedSourcePresetId(undefined);
      return;
    }
    let cancelled = false;
    setVerifiedSourcePresetId(undefined);
    void (async () => {
      try {
        const config = await getActiveServerConfig();
        if (cancelled || config?.id !== sourceServerConfigId) return;
        setVerifiedSourcePresetId(sourcePresetId);
      } catch {
        // Storage read failed — leave verifiedSourcePresetId cleared.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isFocused, sourcePresetId, sourceServerConfigId]);
  const { flush } = useActiveWorkoutAutosave();
  const { runNavigationAction } = useNavigationActionGuard(navigation);

  // One 1s tick drives the elapsed clock and re-renders the rest countdown
  // (`useRestCountdown` is told not to stack a second interval on top). Set
  // rows are memoized, so ticks only re-render the header and rest bar.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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

  // A cold-start deep link (e.g. tapping the workout Live Activity) can land
  // here before the persisted store rehydrates, so an empty sessionId proves
  // nothing until hydration completes.
  const [storeHydrated, setStoreHydrated] = useState(() =>
    useActiveWorkoutStore.persist.hasHydrated(),
  );
  useEffect(() => {
    if (storeHydrated) return;
    // Hydration may have finished between the initial read and this effect.
    if (useActiveWorkoutStore.persist.hasHydrated()) {
      setStoreHydrated(true);
      return;
    }
    return useActiveWorkoutStore.persist.onFinishHydration(() => setStoreHydrated(true));
  }, [storeHydrated]);

  // If the route is opened with no live workout (stale deep link), bail out.
  // Finish/Discard clear the session themselves and own their navigation, so
  // this only auto-pops when the screen *arrived* without a session.
  const hadSessionRef = useRef(sessionId != null);
  useEffect(() => {
    if (sessionId != null) {
      hadSessionRef.current = true;
      return;
    }
    if (!storeHydrated) return;
    if (!hadSessionRef.current && navigation.canGoBack()) navigation.goBack();
  }, [sessionId, storeHydrated, navigation]);

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
    // Live set inputs commit on blur; dismiss the keyboard so a focused edit
    // lands before the overlay covers the list.
    Keyboard.dismiss();
    setReorderVisible(true);
  }, []);

  const handleOpenWorkoutSettings = useCallback(() => {
    Keyboard.dismiss();
    navigation.navigate('WorkoutSettings');
  }, [navigation]);

  // Superset display: adjacent 2+ runs get a flat left rail (log cards) and a
  // bottom bar (rail thumbs) in a per-group palette color.
  const exercisesForBorders = useMemo(() => session?.exercises ?? [], [session]);
  const { runs: supersetRuns, borders: supersetBorders } =
    useSupersetBorders(exercisesForBorders);

  // Expanded state: the cursor's exercise auto-expands as the workout
  // advances, auto-collapsing only the previously auto-expanded card; cards
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
    // collapsible by hand). Only when it's fully logged; a jump that leaves
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
    // Logging a set dismisses the keyboard as the cursor advances; starting
    // the follow scroll mid-hide makes the two motions fight, so wait for the
    // hide to finish. With no keyboard up, defer so the newly expanded card
    // has a measured offset before scrolling.
    return runAfterKeyboardSettles(() => scrollToExercise(activeExerciseId), 350);
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

  // Tapping the rest bar outside its controls brings the on-deck set back
  // into view (same expand/focus/scroll as tapping the exercise's rail thumb).
  const handlePressRestBar = useCallback(() => {
    if (activeExerciseId != null) handleRailPress(activeExerciseId);
  }, [activeExerciseId, handleRailPress]);

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
    const name = exercise?.exercise_snapshot?.name ?? t('workout.thisExercise', { defaultValue: 'this exercise' });
    Alert.alert(t('workout.removeExerciseTitle', { defaultValue: 'Remove exercise?' }), t('workout.removeExerciseMessage', { defaultValue: '{{name}} will be removed from this workout.', name }), [
      { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
      {
        text: t('workout.removeExercise', { defaultValue: 'Remove exercise' }),
        style: 'destructive',
        onPress: () => useActiveWorkoutStore.getState().removeExercise(entryId),
      },
    ]);
  }, [t]);

  const handleClearExerciseSets = useCallback((entryId: string) => {
    useActiveWorkoutStore.getState().clearExerciseCompletions(entryId);
  }, []);

  const handleClearAllSets = useCallback(() => {
    Alert.alert(
      t('workout.clearAllSetsTitle', { defaultValue: 'Clear all logged sets?' }),
      t('workout.clearAllSetsMessage', { defaultValue: 'Un-checks every logged set in this workout. Your set weights and reps are kept.' }),
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('common.clear', { defaultValue: 'Clear' }),
          style: 'destructive',
          onPress: () => useActiveWorkoutStore.getState().clearAllCompletions(),
        },
      ],
    );
  }, [t]);

  // Tap an exercise thumbnail → its library detail. Maps the session's full
  // snapshot to an Exercise so the detail screen gets muscles/equipment/etc.
  const handlePressThumb = useCallback(
    (entryId: string) => {
      const entry = useActiveWorkoutStore
        .getState()
        .session?.exercises.find((e) => e.id === entryId);
      if (entry == null) return;
      const exercise = exerciseFromSnapshot(entry.exercise_snapshot, entry.exercise_id, t);
      runNavigationAction(() => {
        navigation.navigate('ExerciseDetail', { item: exercise, hideWorkoutActions: true });
      });
    },
    [navigation, runNavigationAction, t],
  );

  // Exercise rest drawer (All / per-set rest editing, committed on Done).
  const setRestSheetRef = useRef<ExerciseSetRestSheetRef>(null);
  const handlePressRestChip = useCallback((entryId: string, _currentSec: number | null) => {
    const store = useActiveWorkoutStore.getState();
    const exercise = store.session?.exercises.find((e) => e.id === entryId);
    if (!exercise || !store.session) return;
    
    // Check if this exercise is part of a superset
    const run = getSupersetRuns(store.session.exercises).find((r) =>
      r.entryIds.includes(entryId),
    );
    const isSupersetMember = run != null;
    
    setRestSheetRef.current?.present(
      exercise.exercise_snapshot?.name ?? t('workout.exercise', { defaultValue: 'Exercise' }),
      exercise.sets.map((set) => ({
        setId: String(set.id),
        setNumber: set.set_number,
        restSec: set.rest_time,
      })),
      isSupersetMember,
    );
  }, [t]);
  const handleApplySetRests = useCallback((updates: ExerciseSetRestUpdate[]) => {
    const store = useActiveWorkoutStore.getState();
    if (!store.session) return;
    
    // Find which exercise these updates belong to by matching the first set ID
    const firstUpdate = updates[0];
    if (!firstUpdate) return;
    const exercise = store.session.exercises.find((e) =>
      e.sets.some((s) => String(s.id) === firstUpdate.setId),
    );
    if (!exercise) return;
    
    // Check if this is a superset member
    const run = getSupersetRuns(store.session.exercises).find((r) =>
      r.entryIds.includes(exercise.id),
    );
    
    if (run) {
      // Superset rest is per-round and shared across members: applies each
      // changed round (matched by set_number) to every member's matching
      // set, so editing one round doesn't overwrite the others.
      const memberExercises = store.session.exercises.filter((e) =>
        run.entryIds.includes(e.id),
      );
      for (const update of updates) {
        const changedSet = exercise.sets.find((s) => String(s.id) === update.setId);
        if (!changedSet) continue;
        for (const member of memberExercises) {
          const roundSet = member.sets.find((s) => s.set_number === changedSet.set_number);
          if (roundSet) store.updateSetField(String(roundSet.id), { rest_time: update.seconds });
        }
      }
    } else {
      // Solo exercise: update individual sets
      for (const update of updates) {
        store.updateSetField(update.setId, { rest_time: update.seconds });
      }
    }
  }, []);

  // Metric column picker.
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

  // Rename dialog.
  const [renameVisible, setRenameVisible] = useState(false);
  const handleRenameSubmit = useCallback((newName: string) => {
    useActiveWorkoutStore.getState().renameSession(newName);
    setRenameVisible(false);
  }, []);

  // Per-set note inline expand, toggled by long-pressing the set row. Keyed by
  // render key (the card translates the row's set id) so the panel stays with
  // the same logical set across an autosave id churn. A stale key after a
  // delete/reconcile is harmless: no matching row renders.
  const [expandedSetKey, setExpandedSetKey] = useState<string | null>(null);
  const handleToggleSetDetail = useCallback((setKey: string) => {
    // Animate the panel (and the rows it pushes) in/out. easeInEaseOut matches
    // the card wrapper's 300ms LinearTransition, so the internal reflow and the
    // card's frame grow/shrink together. Same idiom as CollapsibleSection.
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSetKey((prev) => (prev === setKey ? null : setKey));
  }, []);

  // Per-exercise note editor: which exercise's note field the card ⋮ "Notes"
  // item revealed. Selecting "Notes" again toggles the empty editor back off; a
  // saved (non-empty) note stays visible regardless, because the card also
  // shows the field whenever `exercise.notes` is set.
  const [noteEditorEntryId, setNoteEditorEntryId] = useState<string | null>(null);
  const handleToggleExerciseNote = useCallback(
    (entryId: string) => {
      const opening = noteEditorEntryId !== entryId;
      setNoteEditorEntryId(opening ? entryId : null);
      // Opening reveals the field, so make sure the card is expanded to show it.
      if (opening) {
        setUserExpandedIds((prev) => {
          if (prev.has(entryId)) return prev;
          const next = new Set(prev);
          next.add(entryId);
          return next;
        });
      }
    },
    [noteEditorEntryId],
  );
  const handleCommitExerciseNote = useCallback((entryId: string, text: string) => {
    useActiveWorkoutStore.getState().setExerciseNotes(entryId, text);
  }, []);

  // Card ⋮ menu, presented as a bottom sheet titled with the exercise name.
  // 'main' offers the exercise actions; 'pick' swaps the superset candidate
  // list (ungrouped exercises other than the current one) into the same sheet.
  const [overflowMenu, setOverflowMenu] = useState<{
    entryId: string;
    mode: 'main' | 'pick';
  } | null>(null);
  const overflowSheetRef = useRef<ActionSheetRef>(null);
  const handlePressOverflow = useCallback((entryId: string) => {
    // The sheet slides into the keyboard's space, so drop the keyboard first,
    // mirroring what logging a set does.
    Keyboard.dismiss();
    setOverflowMenu({ entryId, mode: 'main' });
    overflowSheetRef.current?.present();
  }, []);

  const overflowMenuItems = useMemo<ActionSheetItem[]>(() => {
    if (overflowMenu == null || session == null) return [];
    const { entryId, mode } = overflowMenu;
    const groupedIds = new Set(supersetRuns.flatMap((run) => run.entryIds));
    const candidates = session.exercises.filter(
      (e) => e.id !== entryId && !groupedIds.has(e.id),
    );

    if (mode === 'pick') {
      return candidates.map((candidate) => ({
        key: candidate.id,
        label: candidate.exercise_snapshot?.name ?? t('workout.exercise', { defaultValue: 'Exercise' }),
        onPress: () => {
          useActiveWorkoutStore.getState().supersetWith(entryId, candidate.id);
        },
      }));
    }

    const entry = session.exercises.find((e) => e.id === entryId);
    const entryHasCompleted =
      entry?.sets.some((s) => completedSetIds[String(s.id)] != null) ?? false;
    // The cardio effort form owns completion inline (tap the check to un-log),
    // so the set-table Clear action would be redundant set-speak there.
    const entryIsCardioForm =
      entry != null &&
      rendersCardioEffortForm(entry.exercise_snapshot, entry.sets.length);

    const items: ActionSheetItem[] = [];
    items.push({
      key: 'view',
      label: t('workout.viewExercise', { defaultValue: 'View exercise' }),
      onPress: () => handlePressThumb(entryId),
    });
    items.push({
      key: 'notes',
      label: t('workout.notes', { defaultValue: 'Notes' }),
      onPress: () => handleToggleExerciseNote(entryId),
    });
    if (candidates.length > 0) {
      items.push({
        key: 'superset-with',
        label: t('workout.supersetWith', { defaultValue: 'Superset with…' }),
        // Keeps the sheet presented; the candidate list swaps in place.
        dismissOnPress: false,
        onPress: () => {
          setOverflowMenu((prev) => (prev ? { ...prev, mode: 'pick' } : prev));
        },
      });
    }
    if (groupedIds.has(entryId)) {
      items.push({
        key: 'ungroup',
        label: t('workout.removeFromSuperset', { defaultValue: 'Remove from superset' }),
        onPress: () => {
          useActiveWorkoutStore.getState().ungroupExercise(entryId);
        },
      });
    }
    // handleReplaceExercise writes replaceTargetEntryIdRef only inside this
    // deferred onPress (on menu tap), never during render, but the linter can't
    // see that through the memo. Same pattern as BottomSheetPicker's trigger.
    // eslint-disable-next-line react-hooks/refs
    items.push({
      key: 'replace',
      label: t('workout.replaceExercise', { defaultValue: 'Replace exercise' }),
      onPress: () => handleReplaceExercise(entryId),
    });
    if (entryHasCompleted && !entryIsCardioForm) {
      items.push({
        key: 'clear',
        label: t('workout.clearLoggedSets', { defaultValue: 'Clear logged sets' }),
        destructive: true,
        onPress: () => handleClearExerciseSets(entryId),
      });
    }
    items.push({
      key: 'remove',
      label: t('workout.removeExercise', { defaultValue: 'Remove exercise' }),
      destructive: true,
      onPress: () => handleRemoveExercise(entryId),
    });
    return items;
  }, [
    overflowMenu,
    session,
    supersetRuns,
    completedSetIds,
    handlePressThumb,
    handleToggleExerciseNote,
    handleReplaceExercise,
    handleClearExerciseSets,
    handleRemoveExercise,
    t,
  ]);

  // Live editing: which set cell is tap-focused (the keyboard target). Keyed by
  // render key (the card translates the row's set id) so focus survives an
  // autosave id churn. Distinct from activeSetId (the cursor / log ring), so
  // tapping an earlier set to fix a value doesn't move the cursor.
  const [focusedSetKey, setFocusedSetKey] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<SetInputField>('weight');
  const handleActivateSet = useCallback(
    (setKey: string, field: Exclude<SetInputField, 'rpe'>) => {
      setFocusedField(field);
      setFocusedSetKey(setKey);
    },
    [],
  );
  // Tapping the RPE column focuses that row's RPE input directly (the row's
  // focus effect reads `focusedField`).
  const handleActivateRpe = useCallback((setKey: string) => {
    setFocusedField('rpe');
    setFocusedSetKey(setKey);
  }, []);

  // Live rows register their sticky-bar handles here, keyed by render key;
  // the accessory bar dispatches to the focused row's handle at press time.
  const accessoryHandlesRef = useRef<Record<string, SetRowAccessoryHandle>>({});
  const handleRegisterAccessoryHandle = useCallback(
    (key: string, handle: SetRowAccessoryHandle | null) => {
      if (handle == null) delete accessoryHandlesRef.current[key];
      else accessoryHandlesRef.current[key] = handle;
    },
    [],
  );

  // The keyboard leaving — accessory Done, a tap outside the grid, the
  // Android back gesture — always ends the cell edit: clearing the focus
  // state flushes the row's drafts (deactivation commit) and hides the bar.
  useDeactivateOnKeyboardDismiss(useCallback(() => setFocusedSetKey(null), []));

  const handleAccessoryDone = useCallback(() => {
    setFocusedSetKey(null);
    Keyboard.dismiss();
  }, []);

  const handleCompleteSet = useCallback((setId: string) => {
    useActiveWorkoutStore.getState().completeSet(setId);
    // Logging advances the cursor and (usually) starts a rest; drop the
    // keyboard so the rest bar is unobstructed and the logged inputs collapse.
    setFocusedSetKey(null);
    setExpandedSetKey(null);
    Keyboard.dismiss();
    // When that was the last unlogged set, the cursor has nowhere to advance,
    // so the follow-cursor scroll won't fire. Surface the End Workout button
    // instead. Deferred past the keyboard hide and the just-logged card's
    // layout settle; guarded so handleScroll doesn't re-home the focused
    // exercise mid-scroll.
    const store = useActiveWorkoutStore.getState();
    const completed = store.completedSetIds;
    const remaining =
      store.session?.exercises.reduce(
        (sum, e) => sum + e.sets.filter((s) => !completed[String(s.id)]).length,
        0,
      ) ?? 0;
    if (remaining === 0) {
      runAfterKeyboardSettles(() => {
        programmaticScrollUntilRef.current = Date.now() + 600;
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 350);
    }
  }, []);
  // The rest bar's ready-state Complete button targets the cursor set; the id
  // is read at press time so the handler can't act on a stale cursor.
  const handleCompleteActiveSet = useCallback(() => {
    const id = useActiveWorkoutStore.getState().activeSetId;
    if (id != null) handleCompleteSet(id);
  }, [handleCompleteSet]);
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
      const name = exercise.exercise_snapshot?.name ?? t('workout.thisExercise', { defaultValue: 'this exercise' });
      Alert.alert(
        t('workout.removeExerciseTitle', { defaultValue: 'Remove exercise?' }),
        t('workout.deleteOnlySetMessage', { defaultValue: 'Deleting the only set removes {{name}} from this workout.', name }),
        [
          { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          {
            text: t('workout.removeExercise', { defaultValue: 'Remove exercise' }),
            style: 'destructive',
            onPress: () => useActiveWorkoutStore.getState().deleteSet(setId),
          },
        ],
      );
      return;
    }
    store.deleteSet(setId);
  }, [t]);

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
      Alert.alert(t('workout.discardWorkoutTitle', { defaultValue: 'Discard workout?' }), t('workout.discardWorkoutMessage', { defaultValue: 'This deletes the workout from your diary.' }), [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('workout.discard', { defaultValue: 'Discard' }),
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
                  text1: t('workout.couldntDelete', { defaultValue: "Couldn't delete workout" }),
                  text2: t('workout.remainsInDiary', { defaultValue: 'It remains in your diary.' }),
                });
              });
          },
        },
      ]);
      return;
    }

    Alert.alert(
      t('workout.discardWorkoutTitle', { defaultValue: 'Discard workout?' }),
      t('workout.clearWorkoutMessage', { defaultValue: 'Clears your progress on this device and drops unsaved changes. Edits already saved to the server are kept.' }),
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('workout.discard', { defaultValue: 'Discard' }),
          style: 'destructive',
          onPress: () => {
            useActiveWorkoutStore.getState().clearWorkout();
            navigation.goBack();
          },
        },
      ],
    );
  }, [createdByLiveStart, sessionId, session, queryClient, navigation, t]);

  const handleFinish = useCallback(async () => {
    // "Discard changes" sits one tap from "Retry", and a mis-tap would
    // silently lose every set logged since the last successful save, so the
    // destructive exit gets its own confirm.
    function confirmDiscardChanges(): void {
      Alert.alert(
        t('workout.discardChangesTitle', { defaultValue: 'Discard unsaved changes?' }),
        t('workout.discardChangesMessage', { defaultValue: "Sets and edits that haven't reached the server will be lost. Changes already saved are kept." }),
        [
          { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          {
            text: t('workout.discard', { defaultValue: 'Discard' }),
            style: 'destructive',
            onPress: () => {
              useActiveWorkoutStore.getState().clearWorkout();
              navigation.goBack();
            },
          },
        ],
      );
    }
    // Named so the failure alert's Retry can re-run the same attempt.
    async function attempt(): Promise<void> {
      const ok = await flush();
      if (!ok) {
        Alert.alert(
          t('workout.saveError', { defaultValue: 'Could not save your workout' }),
          t('workout.failedChangesMessage', { defaultValue: 'Some changes have not reached the server yet.' }),
          [
            { text: t('workout.retry', { defaultValue: 'Retry' }), onPress: () => void attempt() },
            {
              text: t('common.discardChanges', { defaultValue: 'Discard changes' }),
              style: 'destructive',
              onPress: confirmDiscardChanges,
            },
            { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          ],
        );
        return;
      }
      // The celebration screen renders entirely from this snapshot, so it must
      // be taken before clearWorkout. With zero completed sets there is
      // nothing to celebrate — finish exits straight back to the diary.
      const state = useActiveWorkoutStore.getState();
      const celebration =
        state.session != null && Object.keys(state.completedSetIds).length > 0
          ? {
              session: state.session,
              completedSetIds: state.completedSetIds,
              prSetIds: state.prSetIds,
              startedAt: state.startedAt,
              finishedAt: Date.now(),
              sourcePresetId: state.sourcePresetId,
              sourceServerConfigId: state.sourceServerConfigId,
              plannedSetValues: state.plannedSetValues,
            }
          : null;
      useActiveWorkoutStore.getState().clearWorkout();
      if (celebration != null) {
        navigation.replace('WorkoutComplete', celebration);
      } else {
        navigation.goBack();
      }
    }
    await attempt();
  }, [flush, navigation, t]);

  // Long-gap guard on the way out: a workout left open across a long break
  // (forgotten overnight, one straggler set the next morning) would stamp the
  // whole wall-clock span as exercise duration — and the server derives
  // calories from duration. Offer the gap-clamped active time before finishing.
  const durationSheetRef = useRef<WorkoutDurationSheetRef>(null);
  const maybeAdjustDurationThenFinish = useCallback(() => {
    const { completedSetIds: completed, startedAt } = useActiveWorkoutStore.getState();
    const span = summarizeWorkoutSpan(completed, startedAt);
    if (span == null || !span.hasLongGap) {
      void handleFinish();
      return;
    }
    const activeLabel = formatDuration(span.activeMinutes);
    Alert.alert(
      t('workout.adjustDurationTitle', { defaultValue: 'Adjust workout duration?' }),
      t('workout.endWorkoutMessage', { defaultValue: 'This workout spans {{span}}, including a long break. Log {{active}} of active time instead?', span: formatDuration(span.totalMinutes), active: activeLabel }),
      [
        {
          text: t('workout.logWorkout', { defaultValue: 'Log {{name}}', name: activeLabel }),
          onPress: () => {
            useActiveWorkoutStore.getState().setWorkoutDurationMinutes(span.activeMinutes);
            void handleFinish();
          },
        },
        {
          text: t('workout.keep', { defaultValue: 'Keep {{name}}', name: formatDuration(span.totalMinutes) }),
          onPress: () => void handleFinish(),
        },
        {
          text: t('workout.custom', { defaultValue: 'Custom…' }),
          onPress: () =>
            durationSheetRef.current?.present(span.activeMinutes, Math.floor(span.totalMinutes)),
        },
      ],
    );
  }, [handleFinish, t]);

  const handleDurationSave = useCallback(
    (minutes: number) => {
      useActiveWorkoutStore.getState().setWorkoutDurationMinutes(minutes);
      void handleFinish();
    },
    [handleFinish],
  );

  const handleConfirmEnd = useCallback(() => {
    // Commit any focused-but-unblurred input (a set value or a note) into the
    // store before the finish flush reads it. keyboardShouldPersistTaps keeps
    // the field focused when End Workout is tapped, so blur it explicitly; the
    // commit lands well before the user confirms the dialog. On iOS the alert
    // would blur it anyway; this closes the same gap on Android.
    Keyboard.dismiss();
    const totalSets =
      session?.exercises.reduce((sum, e) => sum + e.sets.length, 0) ?? 0;
    const doneSets =
      session?.exercises.reduce(
        (sum, e) => sum + e.sets.filter((s) => completedSetIds[String(s.id)]).length,
        0,
      ) ?? 0;
    const remaining = totalSets - doneSets;
    const message = remaining > 0
      ? t('workout.setsRemaining', { defaultValue: '{{done}} of {{total}} sets logged. {{remaining}} still to go.', done: doneSets, total: totalSets, remaining })
      : t('workout.allSetsLogged', { defaultValue: 'All {{total}} sets logged. Nice work!', total: totalSets });
    Alert.alert(t('workout.endWorkoutTitle', { defaultValue: 'End workout?' }), message, [
      { text: t('workout.keepGoing', { defaultValue: 'Keep going' }), style: 'cancel' },
      { text: t('workout.endWorkout', { defaultValue: 'End Workout' }), style: 'default', onPress: maybeAdjustDurationThenFinish },
    ]);
  }, [session, completedSetIds, maybeAdjustDurationThenFinish, t]);

  if (session == null || sessionId == null) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-base text-text-muted">{t('workout.noActiveWorkout', { defaultValue: 'No active workout' })}</Text>
      </View>
    );
  }

  const progress = buildExerciseProgress(session, completedSetIds);
  const hasAnyCompletedSets = Object.keys(completedSetIds).length > 0;

  // The bar stays up through 'ready' (compact on-deck row with a Complete
  // button) as long as a set remains to complete; it only leaves once the
  // workout is done.
  const restBarVisible = restState !== 'ready' || activeSetId != null;
  // With Liquid Glass tabs active the rest bar floats over the log instead of
  // docking below it, so the scroll content reserves clearance for the pill.
  const restBarPadding = usesGlassRestBar
    ? REST_BAR_GLASS_CLEARANCE + insets.bottom
    : 16;
  const activeSetDescription = describeActiveSet(session, activeSetId);
  const restLabel =
    activeSetDescription == null
      ? ''
      : `${activeSetDescription.exerciseName ?? t('workout.exercise', { defaultValue: 'Exercise' })} · ${t('workout.setNumber', { defaultValue: 'Set {{number}}', number: activeSetDescription.setNumber })}`;
  // Target load for the upcoming set, shown under the rest label so the user
  // knows what's next while resting.
  const restNextSetText =
    activeSetDescription == null ? null : formatSetLoad(activeSetDescription, weightUnit, t);

  // Sticky accessory bar (both platforms) for the focused set cell. The
  // focused row registered its handle by render key; its set id — needed for
  // completion state — reverses through setRenderKeys (identity when the id
  // never churned).
  const focusedSetId =
    focusedSetKey == null
      ? null
      : (Object.keys(setRenderKeys).find((id) => setRenderKeys[id] === focusedSetKey) ??
        focusedSetKey);
  // The cardio effort form has its own two-field walk (duration → distance)
  // and no RPE cell, so the bar's Next must not aim at inputs it lacks.
  const focusedEntryIsCardioForm =
    focusedSetId != null &&
    session.exercises.some(
      (e) =>
        e.sets.some((s) => String(s.id) === focusedSetId) &&
        rendersCardioEffortForm(e.exercise_snapshot, e.sets.length),
    );
  // The keyboard walk: weight → reps → RPE (when that column is shown); a
  // duration cell is its row's only value input, so it walks straight to RPE.
  // The last field's bar drops Next and leads with Log.
  const accessoryNextField = focusedEntryIsCardioForm
    ? focusedField === 'duration'
      ? ('distance' as const)
      : null
    : focusedField === 'weight'
      ? ('reps' as const)
      : (focusedField === 'reps' || focusedField === 'duration') && metricColumn === 'rpe'
        ? ('rpe' as const)
        : null;
  const focusedSetCompleted = focusedSetId != null && completedSetIds[focusedSetId] != null;
  const accessoryActions: SetAccessoryAction[] = [
    ...(accessoryNextField != null
      ? [
          {
            key: 'next',
            label: t('workout.next', { defaultValue: 'Next' }),
            onPress: () => {
              if (focusedSetKey == null) return;
              accessoryHandlesRef.current[focusedSetKey]?.focusField(accessoryNextField);
            },
          },
        ]
      : []),
    // A completed set has no Log, so its last field would dead-end with only
    // Done — Next Set moves on to the following row (or adds one on the last
    // set), matching the edit forms' bar. The cardio form is its exercise's
    // whole log, so there is no set to move on to and its bar ends at Done.
    ...(accessoryNextField == null && focusedSetCompleted && !focusedEntryIsCardioForm
      ? [
          {
            key: 'next-set',
            label: t('workout.nextSet', { defaultValue: 'Next Set' }),
            onPress: () => {
              if (focusedSetKey == null) return;
              accessoryHandlesRef.current[focusedSetKey]?.advance();
            },
          },
        ]
      : []),
    // Any uncompleted set is loggable (matching its ring), so a focused row
    // doesn't dead-end on the last field with only Done.
    ...(focusedSetId != null && !focusedSetCompleted
      ? [
          {
            key: 'log',
            label: t('workout.log', { defaultValue: 'Log' }),
            bold: true,
            onPress: () => {
              if (focusedSetKey == null) return;
              accessoryHandlesRef.current[focusedSetKey]?.log();
            },
          },
        ]
      : []),
  ];

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
        onOpenSettings={handleOpenWorkoutSettings}
        onClearAllSets={hasAnyCompletedSets ? handleClearAllSets : undefined}
      />

      {/* Collapses while the keyboard is up to hand its ~105px back to the log. */}
      <KeyboardCollapsible>
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
      </KeyboardCollapsible>

      <KeyboardAwareScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="px-3 pt-2"
        contentContainerStyle={{
          paddingBottom: restBarVisible ? restBarPadding : insets.bottom + 16,
        }}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        onLayout={(e) => {
          viewportHeightRef.current = e.nativeEvent.layout.height;
        }}
        keyboardShouldPersistTaps="handled"
        // Clearance above the keyboard for the focused input: the sticky
        // accessory bar occupies the first ~48px, the rest keeps the row
        // readable above it.
        bottomOffset={80}
        // A real dismissal (Done, tap outside) shouldn't scroll the log back
        // to its pre-keyboard position — the user is usually mid-list.
        disableScrollOnKeyboardHide
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
              sourcePresetId={verifiedSourcePresetId}
              activeSetId={activeSetId}
              focusedSetKey={focusedSetKey}
              setRenderKeys={setRenderKeys}
              activeField={focusedField}
              metricColumn={metricColumn}
              weightUnit={weightUnit}
              distanceUnit={distanceUnit}
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
              onLongPressSet={handleToggleSetDetail}
              onAddSet={handleAddSet}
              expandedSetKey={expandedSetKey}
              noteEditorOpen={noteEditorEntryId === exercise.id}
              onCommitExerciseNote={handleCommitExerciseNote}
              onActivateSet={handleActivateSet}
              onActivateRpe={handleActivateRpe}
              onRegisterAccessoryHandle={handleRegisterAccessoryHandle}
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
          {t('workout.addExercise', { defaultValue: 'Add an Exercise' })}
        </Button>

        <Button
          variant="primary"
          onPress={handleConfirmEnd}
          className="mt-2 mb-2 mx-1"
        >
          {t('workout.endWorkout', { defaultValue: 'End Workout' })}
        </Button>
      </KeyboardAwareScrollView>

      {restBarVisible && (
        <ActiveWorkoutRestBar
          remainingMs={restRemainingMs}
          progress={restProgress}
          state={restState}
          label={restLabel}
          nextSetText={restNextSetText}
          onAdjust={(deltaSec) => useActiveWorkoutStore.getState().adjustRest(deltaSec)}
          onSkip={() => useActiveWorkoutStore.getState().dismissRest()}
          onPause={() => useActiveWorkoutStore.getState().pauseRest()}
          onResume={() => useActiveWorkoutStore.getState().resumeRest()}
          onCompleteSet={handleCompleteActiveSet}
          onPressBar={handlePressRestBar}
        />
      )}

      {/* Keyboard accessory bar for the focused set cell, on both platforms
          (per-input InputAccessoryViews are iOS-only and edit-form-only now).
          It rides the keyboard via KeyboardStickyView and unmounts when the
          keyboard-hide listener clears the focus state. */}
      {focusedSetKey != null && (
        <KeyboardStickyView style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
          <SetInputAccessoryBar onDone={handleAccessoryDone} actions={accessoryActions} />
        </KeyboardStickyView>
      )}

      <ExerciseSetRestSheet ref={setRestSheetRef} onApply={handleApplySetRests} />

      <WorkoutDurationSheet ref={durationSheetRef} onSave={handleDurationSave} />

      <RenameWorkoutDialog
        visible={renameVisible}
        initialName={session.name}
        onCancel={() => setRenameVisible(false)}
        onSubmit={handleRenameSubmit}
      />

      <MetricColumnMenu
        anchor={metricMenu?.anchor ?? null}
        onClose={() => setMetricMenu(null)}
        includeWeightMetrics={!metricMenu?.clampedToRpe}
      />

      <ActionSheet
        ref={overflowSheetRef}
        title={
          overflowMenu?.mode === 'pick'
            ? t('workout.supersetWith', { defaultValue: 'Superset with…' })
            : (session.exercises.find((e) => e.id === overflowMenu?.entryId)
                ?.exercise_snapshot?.name ?? t('workout.exercise', { defaultValue: 'Exercise' }))
        }
        items={overflowMenuItems}
        onBack={
          overflowMenu?.mode === 'pick'
            ? () => setOverflowMenu((prev) => (prev ? { ...prev, mode: 'main' } : prev))
            : undefined
        }
        onDismiss={() => setOverflowMenu(null)}
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
