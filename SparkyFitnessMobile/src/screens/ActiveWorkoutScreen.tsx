import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AppState,
  Keyboard,
  LayoutAnimation,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';
import {
  calculateWarmupSets,
  findDropSetBaseIndex,
  findWarmupBaseIndex,
} from '@workspace/shared';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import ActiveWorkoutHeader, {
  buildExerciseProgress,
} from '../components/ActiveWorkoutHeader';
import ActiveWorkoutRail, {
  useSupersetBorders,
} from '../components/ActiveWorkoutRail';
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
import type { ActionSheetRef } from '../components/ActionSheet';
import { type AnchorRect } from '../components/AnchoredMenu';
import type { ExerciseSetRestSheetRef } from '../components/ExerciseSetRestSheet';
import ExerciseSetRestSheet from '../components/ExerciseSetRestSheet';
import WorkoutDurationSheet, {
  type WorkoutDurationSheetRef,
} from '../components/WorkoutDurationSheet';
import WorkoutReorderList from '../components/WorkoutReorderList';
import ActiveWorkoutIntervalHud from '../components/ActiveWorkoutIntervalHud';
import ActiveWorkoutGuidedCard from '../components/ActiveWorkoutGuidedCard';
import ActiveWorkoutRenameModal from '../components/ActiveWorkoutRenameModal';
import ActiveWorkoutLocationModal from '../components/ActiveWorkoutLocationModal';
import ActiveWorkoutOverflowSheet, {
  type OverflowMenuState,
} from '../components/ActiveWorkoutOverflowSheet';
import ActiveWorkoutExerciseList from '../components/ActiveWorkoutExerciseList';
import Button from '../components/ui/Button';
import { useActiveWorkoutAutosave } from '../hooks/useActiveWorkoutAutosave';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useNavigationActionGuard } from '../hooks/useNavigationActionGuard';
import { usePreferences } from '../hooks/usePreferences';
import { useRestCountdown } from '../hooks/useRestCountdown';
import { useNativeIOSTabsActive } from '../services/nativeTabBarPreference';
import { getActiveServerConfig } from '../services/storage';
import {
  useActiveWorkoutStore,
  type ActiveSetPatch,
} from '../stores/activeWorkoutStore';
import { runAfterKeyboardSettles } from '../utils/keyboardFocus';
import {
  buildExerciseReorderItems,
  describeActiveSet,
  firstSetInputField,
  formatSetLoad,
  rendersCardioEffortForm,
  resolveSnapshotModality,
  isCardioModality,
  isDurationModality,
} from '../utils/workoutSession';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { resolveWarmupOptions } from '../utils/warmupSettings';
import { useActiveWorkoutIntervalLifecycle } from '../hooks/useActiveWorkoutIntervalLifecycle';
import { useActiveWorkoutDiscard } from '../hooks/useActiveWorkoutDiscard';
import { useActiveWorkoutFinish } from '../hooks/useActiveWorkoutFinish';
import { useActiveWorkoutExerciseActions } from '../hooks/useActiveWorkoutExerciseActions';
import { useLiveCoachingSignals } from '../hooks/useLiveCoachingSignals';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ActiveWorkout'>;

function ActiveWorkoutScreen({ navigation, route }: Props) {
  useLiveCoachingSignals();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const session = useActiveWorkoutStore((s) => s.session);
  const sessionId = useActiveWorkoutStore((s) => s.sessionId);
  const sourcePresetId = useActiveWorkoutStore((s) => s.sourcePresetId);
  const sourceServerConfigId = useActiveWorkoutStore(
    (s) => s.sourceServerConfigId
  );
  const startedAt = useActiveWorkoutStore((s) => s.startedAt);
  const completedSetIds = useActiveWorkoutStore((s) => s.completedSetIds);
  const prSetIds = useActiveWorkoutStore((s) => s.prSetIds);
  const setRenderKeys = useActiveWorkoutStore((s) => s.setRenderKeys);
  const activeSetId = useActiveWorkoutStore((s) => s.activeSetId);
  const plannedSetValues = useActiveWorkoutStore((s) => s.plannedSetValues);
  const {
    state: restState,
    remainingMs: restRemainingMs,
    progress: restProgress,
  } = useRestCountdown({ selfTick: false });
  const usesGlassRestBar = useNativeIOSTabsActive();
  const createdByLiveStart = useActiveWorkoutStore((s) => s.createdByLiveStart);
  const queryClient = useQueryClient();

  const metricColumn = useAppPreferencesStore(
    (s) => s.activeWorkoutMetricColumn
  );
  const guidedWorkoutEnabled = useAppPreferencesStore(
    (s) => s.guidedWorkoutEnabled
  );

  const { preferences } = usePreferences();
  const weightUnit = (preferences?.default_weight_unit ?? 'kg') as 'kg' | 'lbs';
  const distanceUnit =
    (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const { getImageSource } = useExerciseImageSource();

  const workoutFormat = useActiveWorkoutStore((s) => s.workoutFormat);
  const { now } = useActiveWorkoutIntervalLifecycle(
    workoutFormat,
    guidedWorkoutEnabled
  );

  const isFocused = useIsFocused();
  const [verifiedSourcePresetId, setVerifiedSourcePresetId] = useState<
    number | undefined
  >(undefined);
  // Which preset/server pair the check above last settled for. Until it has
  // settled, the cards' history is the unscoped "last time anywhere" rather
  // than this preset's, so it must not be captured yet (see below).
  const presetCheckKey = `${sourcePresetId ?? ''}|${sourceServerConfigId ?? ''}`;
  const [settledPresetCheckKey, setSettledPresetCheckKey] = useState<
    string | null
  >(null);
  useEffect(() => {
    if (!isFocused || sourcePresetId == null) return;
    let cancelled = false;
    void (async () => {
      try {
        const config = await getActiveServerConfig();
        if (cancelled) return;
        setVerifiedSourcePresetId(
          config?.id === sourceServerConfigId ? sourcePresetId : undefined
        );
      } catch {
        if (!cancelled) setVerifiedSourcePresetId(undefined);
      }
      if (!cancelled) setSettledPresetCheckKey(presetCheckKey);
    })();
    return () => {
      cancelled = true;
    };
  }, [isFocused, sourcePresetId, sourceServerConfigId, presetCheckKey]);

  const effectiveVerifiedSourcePresetId =
    isFocused && sourcePresetId != null ? verifiedSourcePresetId : undefined;
  // The store keeps the first history each exercise reports, and the watch's
  // targets, a lock-screen complete and the rest notification all read it.
  // Capturing before the preset check settles would pin the unscoped history
  // while the rows go on to show this preset's, so the watch would miss a
  // progression the phone displays.
  const historyScopeSettled =
    sourcePresetId == null ||
    (isFocused && settledPresetCheckKey === presetCheckKey);

  const { flush } = useActiveWorkoutAutosave();
  const { runNavigationAction } = useNavigationActionGuard(navigation);

  useEffect(() => {
    if (useActiveWorkoutStore.getState().hasUnsavedChanges) void flush();
    const unsubscribe = navigation.addListener('blur', () => {
      void flush();
    });
    return unsubscribe;
  }, [navigation, flush]);

  const [storeHydrated, setStoreHydrated] = useState(() =>
    useActiveWorkoutStore.persist.hasHydrated()
  );
  useEffect(() => {
    if (storeHydrated) return;
    return useActiveWorkoutStore.persist.onFinishHydration(() =>
      setStoreHydrated(true)
    );
  }, [storeHydrated]);

  const safeGoBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Tabs', { screen: 'Diary' });
    }
  }, [navigation]);

  const hadSessionRef = useRef(sessionId != null);
  useEffect(() => {
    if (sessionId != null) {
      hadSessionRef.current = true;
      return;
    }
    if (!storeHydrated) return;
    if (!hadSessionRef.current) {
      safeGoBack();
      return;
    }
    // The session was cleared from outside this screen — ended on the paired
    // watch, or from the active-workout bar — while it was showing or while
    // it sat further down the stack (`isFocused` re-runs this on return).
    // This screen's own Finish/Discard navigate synchronously as they clear;
    // `navigation.isFocused()` reads the live navigation state, so it is
    // already false for them even if the hook value has not caught up.
    // Without this the screen sat on "No active workout" with no header and
    // no way back but force-quitting.
    if (isFocused && navigation.isFocused()) safeGoBack();
  }, [sessionId, storeHydrated, safeGoBack, navigation, isFocused]);

  const activeExerciseId = useMemo(() => {
    if (session == null || activeSetId == null) return null;
    return (
      session.exercises.find((e) =>
        e.sets.some((s) => String(s.id) === activeSetId)
      )?.id ?? null
    );
  }, [session, activeSetId]);

  const [reorderVisible, setReorderVisible] = useState(false);
  const reorderItemCount = useMemo(
    () => buildExerciseReorderItems(session?.exercises ?? []).length,
    [session]
  );
  // The first working set's weight, typed or assumed, that a warm-up ramp
  // builds towards. Null for cardio and timed exercises, or when that set has
  // no weight yet.
  const warmupWeightKg = useCallback(
    (entryId: string): number | null => {
      const ex = session?.exercises.find((e) => e.id === entryId);
      if (!ex) return null;
      const modality = resolveSnapshotModality(ex.exercise_snapshot);
      if (isCardioModality(modality) || isDurationModality(modality))
        return null;
      const baseIndex = findWarmupBaseIndex(
        ex.sets,
        (s) => s.weight ?? plannedSetValues[String(s.id)]?.weight
      );
      if (baseIndex < 0) return null;
      const base = ex.sets[baseIndex];
      return Number(base.weight ?? plannedSetValues[String(base.id)]?.weight);
    },
    [session, plannedSetValues]
  );
  const warmupCalculatorEnabled = useAppPreferencesStore(
    (s) => s.warmupCalculatorEnabled
  );
  const warmupMethod = useAppPreferencesStore((s) => s.warmupMethod);
  const warmupPlateRounding = useAppPreferencesStore(
    (s) => s.warmupPlateRounding
  );
  const warmupDumbbellRounding = useAppPreferencesStore(
    (s) => s.warmupDumbbellRounding
  );
  const canAddWarmups = useCallback(
    (entryId: string): boolean => {
      if (!warmupCalculatorEnabled) return false;
      const weightKg = warmupWeightKg(entryId);
      if (weightKg == null) return false;
      const ex = session?.exercises.find((e) => e.id === entryId);
      // A warm-up already logged means the ramp is under way.
      if (
        ex?.sets.some(
          (s) =>
            s.set_type === 'warmup' &&
            (completedSetIds[String(s.id)] != null || s.completed_at != null)
        )
      ) {
        return false;
      }
      // A weight findWarmupBaseIndex accepts can still round to nothing
      // (2 kg against the default 2.5 kg plate step). Hide the action then.
      return (
        calculateWarmupSets(
          weightKg,
          weightUnit,
          resolveWarmupOptions(
            { warmupMethod, warmupPlateRounding, warmupDumbbellRounding },
            weightUnit,
            ex?.exercise_snapshot?.equipment
          )
        ).length > 0
      );
    },
    [
      warmupCalculatorEnabled,
      warmupWeightKg,
      session,
      completedSetIds,
      weightUnit,
      warmupMethod,
      warmupPlateRounding,
      warmupDumbbellRounding,
    ]
  );
  const handleAddWarmups = useCallback(
    (entryId: string) => {
      const weightKg = warmupWeightKg(entryId);
      if (weightKg == null) return;
      const ex = session?.exercises.find((e) => e.id === entryId);
      useActiveWorkoutStore
        .getState()
        .addWarmupSetsToExercise(
          entryId,
          weightKg,
          weightUnit,
          resolveWarmupOptions(
            useAppPreferencesStore.getState(),
            weightUnit,
            ex?.exercise_snapshot?.equipment
          )
        );
    },
    [warmupWeightKg, weightUnit, session]
  );

  const handleOpenReorder = useCallback(() => {
    Keyboard.dismiss();
    setReorderVisible(true);
  }, []);

  const handleOpenWorkoutSettings = useCallback(() => {
    Keyboard.dismiss();
    navigation.navigate('WorkoutSettings');
  }, [navigation]);

  const exercisesForBorders = useMemo(
    () => session?.exercises ?? [],
    [session]
  );
  const { runs: supersetRuns, borders: supersetBorders } =
    useSupersetBorders(exercisesForBorders);

  const [userExpandedIds, setUserExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  const [autoExpandedId, setAutoExpandedId] = useState<string | null>(
    activeExerciseId
  );
  const [focusedExerciseId, setFocusedExerciseId] = useState<string | null>(
    activeExerciseId
  );

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

  const [prevActiveExerciseId, setPrevActiveExerciseId] =
    useState(activeExerciseId);
  if (activeExerciseId !== prevActiveExerciseId) {
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
    return runAfterKeyboardSettles(
      () => scrollToExercise(activeExerciseId),
      350
    );
  }, [activeExerciseId, scrollToExercise]);

  const handleToggleExpanded = useCallback(
    (entryId: string) => {
      setUserExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(entryId)) {
          next.delete(entryId);
        } else if (autoExpandedId === entryId) {
          setAutoExpandedId(null);
        } else {
          next.add(entryId);
        }
        return next;
      });
    },
    [autoExpandedId]
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
    [autoExpandedId, scrollToExercise]
  );

  const handlePressRestBar = useCallback(() => {
    if (activeExerciseId != null) handleRailPress(activeExerciseId);
  }, [activeExerciseId, handleRailPress]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
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
    },
    []
  );

  const setRestSheetRef = useRef<ExerciseSetRestSheetRef>(null);
  const {
    handleAddExercise,
    handleReplaceExercise,
    handleRemoveExercise,
    handleClearExerciseSets,
    handleClearAllSets,
    handlePressThumb,
    handlePressRestChip,
    handleApplySetRests,
  } = useActiveWorkoutExerciseActions({
    navigation,
    route,
    runNavigationAction,
    setRestSheetRef,
    setUserExpandedIds,
    setFocusedExerciseId,
    scrollToExercise,
  });

  const [metricMenu, setMetricMenu] = useState<{
    anchor: AnchorRect;
    clampedToRpe: boolean;
  } | null>(null);
  const handlePressMetricHeader = useCallback(
    (anchor: AnchorRect, clampedToRpe: boolean) => {
      setMetricMenu({ anchor, clampedToRpe });
    },
    []
  );

  const [renameVisible, setRenameVisible] = useState(false);
  const handleRenameSubmit = useCallback((newName: string) => {
    useActiveWorkoutStore.getState().renameSession(newName);
    setRenameVisible(false);
  }, []);

  const [locationVisible, setLocationVisible] = useState(false);
  const handleLocationSubmit = useCallback((location: string | null) => {
    useActiveWorkoutStore.getState().setSessionLocation(location);
    setLocationVisible(false);
  }, []);

  const [expandedSetKey, setExpandedSetKey] = useState<string | null>(null);
  const handleToggleSetDetail = useCallback((setKey: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSetKey((prev) => (prev === setKey ? null : setKey));
  }, []);

  const [noteEditorEntryId, setNoteEditorEntryId] = useState<string | null>(
    null
  );
  const handleToggleExerciseNote = useCallback(
    (entryId: string) => {
      const opening = noteEditorEntryId !== entryId;
      setNoteEditorEntryId(opening ? entryId : null);
      if (opening) {
        setUserExpandedIds((prev) => {
          if (prev.has(entryId)) return prev;
          const next = new Set(prev);
          next.add(entryId);
          return next;
        });
      }
    },
    [noteEditorEntryId]
  );
  const handleCommitExerciseNote = useCallback(
    (entryId: string, text: string) => {
      useActiveWorkoutStore.getState().setExerciseNotes(entryId, text);
    },
    []
  );

  const [overflowMenu, setOverflowMenu] = useState<OverflowMenuState | null>(
    null
  );
  const overflowSheetRef = useRef<ActionSheetRef>(null);
  const handlePressOverflow = useCallback((entryId: string) => {
    Keyboard.dismiss();
    setOverflowMenu({ entryId, mode: 'main' });
    overflowSheetRef.current?.present();
  }, []);

  const [focusedSetKey, setFocusedSetKey] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<SetInputField>('weight');
  const handleActivateSet = useCallback(
    (setKey: string, field: Exclude<SetInputField, 'rpe'>) => {
      setFocusedField(field);
      setFocusedSetKey(setKey);
    },
    []
  );
  const handleActivateRpe = useCallback((setKey: string) => {
    setFocusedField('rpe');
    setFocusedSetKey(setKey);
  }, []);

  const accessoryHandlesRef = useRef<Record<string, SetRowAccessoryHandle>>({});
  const handleRegisterAccessoryHandle = useCallback(
    (key: string, handle: SetRowAccessoryHandle | null) => {
      if (handle == null) delete accessoryHandlesRef.current[key];
      else accessoryHandlesRef.current[key] = handle;
    },
    []
  );

  // When a rest runs out on its own, put the cursor in the next set's first
  // value cell so the lifter can type without tapping. Skip / dismiss don't
  // stamp restExpiredAt, so they never steal focus. A store subscription (not
  // an effect on the value) because this reacts to an event, once.
  const isFocusedRef = useRef(isFocused);
  useEffect(() => {
    isFocusedRef.current = isFocused;
  }, [isFocused]);
  useEffect(
    () =>
      useActiveWorkoutStore.subscribe((state, prev) => {
        if (
          state.restExpiredAt == null ||
          state.restExpiredAt === prev.restExpiredAt
        )
          return;
        if (
          !isFocusedRef.current ||
          AppState.currentState !== 'active' ||
          state.activeSetId == null
        )
          return;
        const setId = state.activeSetId;
        const exercise = state.session?.exercises.find((e) =>
          e.sets.some((s) => String(s.id) === setId)
        );
        if (!exercise) return;
        handleActivateSet(
          state.setRenderKeys[setId] ?? setId,
          firstSetInputField(
            resolveSnapshotModality(exercise.exercise_snapshot)
          )
        );
      }),
    [handleActivateSet]
  );

  useDeactivateOnKeyboardDismiss(useCallback(() => setFocusedSetKey(null), []));

  const handleAccessoryDone = useCallback(() => {
    setFocusedSetKey(null);
    Keyboard.dismiss();
  }, []);

  const handleCompleteSet = useCallback((setId: string) => {
    useActiveWorkoutStore.getState().completeSet(setId);
    setFocusedSetKey(null);
    setExpandedSetKey(null);
    Keyboard.dismiss();
    const store = useActiveWorkoutStore.getState();
    const completed = store.completedSetIds;
    const remaining =
      store.session?.exercises.reduce(
        (sum, e) => sum + e.sets.filter((s) => !completed[String(s.id)]).length,
        0
      ) ?? 0;
    if (remaining === 0) {
      runAfterKeyboardSettles(() => {
        programmaticScrollUntilRef.current = Date.now() + 600;
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 350);
    }
  }, []);

  const handleCompleteActiveSet = useCallback(() => {
    const id = useActiveWorkoutStore.getState().activeSetId;
    if (id != null) handleCompleteSet(id);
  }, [handleCompleteSet]);

  const handleUncomplete = useCallback((setId: string) => {
    useActiveWorkoutStore.getState().uncompleteSet(setId);
  }, []);

  const handleCommitField = useCallback(
    (setId: string, patch: ActiveSetPatch) => {
      useActiveWorkoutStore.getState().updateSetField(setId, patch);
    },
    []
  );

  const handleAddSet = useCallback((entryId: string) => {
    useActiveWorkoutStore.getState().addSetToExercise(entryId);
  }, []);

  const handleDeleteSet = useCallback(
    (setId: string) => {
      const store = useActiveWorkoutStore.getState();
      const exercise = store.session?.exercises.find((e) =>
        e.sets.some((s) => String(s.id) === setId)
      );
      if (exercise != null && exercise.sets.length <= 1) {
        const name =
          exercise.exercise_snapshot?.name ??
          t('workout.thisExercise', { defaultValue: 'this exercise' });
        Alert.alert(
          t('workout.removeExerciseTitle', {
            defaultValue: 'Remove exercise?',
          }),
          t('workout.deleteOnlySetMessage', {
            defaultValue:
              'Deleting the only set removes {{name}} from this workout.',
            name,
          }),
          [
            {
              text: t('common.cancel', { defaultValue: 'Cancel' }),
              style: 'cancel',
            },
            {
              text: t('common.remove', { defaultValue: 'Remove' }),
              style: 'destructive',
              onPress: () => useActiveWorkoutStore.getState().deleteSet(setId),
            },
          ]
        );
        return;
      }
      store.deleteSet(setId);
    },
    [t]
  );

  const [setTypeMenu, setSetTypeMenu] = useState<{
    setId: string;
    anchor: AnchorRect;
  } | null>(null);
  const handlePressSetType = useCallback(
    (setId: string, anchor: AnchorRect) => {
      setSetTypeMenu({ setId, anchor });
    },
    []
  );
  const setTypeCurrent = useMemo(() => {
    if (setTypeMenu == null || session == null) return null;
    for (const exercise of session.exercises) {
      const set = exercise.sets.find((s) => String(s.id) === setTypeMenu.setId);
      if (set) return set.set_type ?? 'normal';
    }
    return null;
  }, [setTypeMenu, session]);

  const { handleDiscard } = useActiveWorkoutDiscard({
    sessionId,
    session,
    createdByLiveStart,
    queryClient,
    safeGoBack,
  });

  const durationSheetRef = useRef<WorkoutDurationSheetRef>(null);
  const { handleConfirmEnd, handleDurationSave } = useActiveWorkoutFinish({
    navigation,
    session,
    completedSetIds,
    flush,
    durationSheetRef,
    safeGoBack,
  });

  if (session == null || sessionId == null) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-base text-text-muted">
          {t('workout.noActiveWorkout', { defaultValue: 'No active workout' })}
        </Text>
      </View>
    );
  }

  const progress = buildExerciseProgress(session, completedSetIds);
  const hasAnyCompletedSets = Object.keys(completedSetIds).length > 0;
  const restBarVisible = restState !== 'ready' || activeSetId != null;
  const restBarPadding = usesGlassRestBar
    ? REST_BAR_GLASS_CLEARANCE + insets.bottom
    : 16;
  const activeSetDescription = describeActiveSet(session, activeSetId);
  const restLabel =
    activeSetDescription == null
      ? ''
      : `${activeSetDescription.exerciseName ?? t('workout.exercise', { defaultValue: 'Exercise' })} · ${t('workout.setNumber', { defaultValue: 'Set {{number}}', number: activeSetDescription.setNumber })}`;
  const restNextSetText =
    activeSetDescription == null
      ? null
      : formatSetLoad(activeSetDescription, weightUnit, t);

  const focusedSetId =
    focusedSetKey == null
      ? null
      : (Object.keys(setRenderKeys).find(
          (id) => setRenderKeys[id] === focusedSetKey
        ) ?? focusedSetKey);
  const focusedEntryIsCardioForm =
    focusedSetId != null &&
    session.exercises.some(
      (e) =>
        e.sets.some((s) => String(s.id) === focusedSetId) &&
        rendersCardioEffortForm(e.exercise_snapshot, e.sets.length)
    );
  const accessoryNextField = focusedEntryIsCardioForm
    ? focusedField === 'duration'
      ? ('distance' as const)
      : null
    : focusedField === 'weight'
      ? ('reps' as const)
      : (focusedField === 'reps' || focusedField === 'duration') &&
          metricColumn === 'rpe'
        ? ('rpe' as const)
        : null;
  const focusedSetCompleted =
    focusedSetId != null && completedSetIds[focusedSetId] != null;
  const accessoryActions: SetAccessoryAction[] = [
    ...(accessoryNextField != null
      ? [
          {
            key: 'next',
            label: t('workout.next', { defaultValue: 'Next' }),
            onPress: () => {
              if (focusedSetKey == null) return;
              accessoryHandlesRef.current[focusedSetKey]?.focusField(
                accessoryNextField
              );
            },
          },
        ]
      : []),
    ...(accessoryNextField == null &&
    focusedSetCompleted &&
    !focusedEntryIsCardioForm
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
        location={session.location}
        startedAt={startedAt}
        now={now}
        progress={progress}
        onBack={safeGoBack}
        onDiscard={handleDiscard}
        onEndWorkout={handleConfirmEnd}
        onRename={() => setRenameVisible(true)}
        onEditLocation={() => setLocationVisible(true)}
        onAddExercise={handleAddExercise}
        onReorder={reorderItemCount >= 2 ? handleOpenReorder : undefined}
        onOpenSettings={handleOpenWorkoutSettings}
        onClearAllSets={hasAnyCompletedSets ? handleClearAllSets : undefined}
      />

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
        bottomOffset={80}
        disableScrollOnKeyboardHide
      >
        <ActiveWorkoutIntervalHud now={now} getImageSource={getImageSource} />

        {guidedWorkoutEnabled && workoutFormat === 'standard' && (
          <ActiveWorkoutGuidedCard
            getImageSource={getImageSource}
            onCompleteSet={handleCompleteSet}
          />
        )}

        <ActiveWorkoutExerciseList
          session={session}
          userExpandedIds={userExpandedIds}
          autoExpandedId={autoExpandedId}
          supersetBorders={supersetBorders}
          completedSetIds={completedSetIds}
          prSetIds={prSetIds}
          sessionId={sessionId}
          verifiedSourcePresetId={effectiveVerifiedSourcePresetId}
          historyScopeSettled={historyScopeSettled}
          activeSetId={activeSetId}
          focusedSetKey={focusedSetKey}
          setRenderKeys={setRenderKeys}
          focusedField={focusedField}
          metricColumn={metricColumn}
          weightUnit={weightUnit}
          distanceUnit={distanceUnit}
          expandedSetKey={expandedSetKey}
          noteEditorEntryId={noteEditorEntryId}
          cardOffsetsRef={cardOffsetsRef}
          getImageSource={getImageSource}
          onPressThumb={handlePressThumb}
          onToggleExpanded={handleToggleExpanded}
          onPressRestChip={handlePressRestChip}
          onPressMetricHeader={handlePressMetricHeader}
          onPressOverflow={handlePressOverflow}
          onSeeAlternatives={handleReplaceExercise}
          onCompleteSet={handleCompleteSet}
          onUncomplete={handleUncomplete}
          onCommitField={handleCommitField}
          onDeleteSet={handleDeleteSet}
          onPressSetType={handlePressSetType}
          onToggleSetDetail={handleToggleSetDetail}
          onAddSet={handleAddSet}
          onCommitExerciseNote={handleCommitExerciseNote}
          onActivateSet={handleActivateSet}
          onActivateRpe={handleActivateRpe}
          onRegisterAccessoryHandle={handleRegisterAccessoryHandle}
        />

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
          onAdjust={(deltaSec) =>
            useActiveWorkoutStore.getState().adjustRest(deltaSec)
          }
          onSkip={() => useActiveWorkoutStore.getState().dismissRest()}
          onPause={() => useActiveWorkoutStore.getState().pauseRest()}
          onResume={() => useActiveWorkoutStore.getState().resumeRest()}
          onCompleteSet={handleCompleteActiveSet}
          onPressBar={handlePressRestBar}
        />
      )}

      {focusedSetKey != null && (
        <KeyboardStickyView
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
        >
          <SetInputAccessoryBar
            onDone={handleAccessoryDone}
            actions={accessoryActions}
          />
        </KeyboardStickyView>
      )}

      <ExerciseSetRestSheet
        ref={setRestSheetRef}
        onApply={handleApplySetRests}
      />

      <WorkoutDurationSheet
        ref={durationSheetRef}
        onSave={handleDurationSave}
      />

      <ActiveWorkoutRenameModal
        visible={renameVisible}
        initialName={session.name}
        onCancel={() => setRenameVisible(false)}
        onSubmit={handleRenameSubmit}
      />

      <ActiveWorkoutLocationModal
        visible={locationVisible}
        initialLocation={session.location}
        onCancel={() => setLocationVisible(false)}
        onSubmit={handleLocationSubmit}
      />

      <MetricColumnMenu
        anchor={metricMenu?.anchor ?? null}
        onClose={() => setMetricMenu(null)}
        includeWeightMetrics={!metricMenu?.clampedToRpe}
      />

      <ActiveWorkoutOverflowSheet
        sheetRef={overflowSheetRef}
        overflowMenu={overflowMenu}
        session={session}
        supersetRuns={supersetRuns}
        completedSetIds={completedSetIds}
        onPressThumb={handlePressThumb}
        onToggleExerciseNote={handleToggleExerciseNote}
        onReplaceExercise={handleReplaceExercise}
        canAddWarmups={canAddWarmups}
        onAddWarmups={handleAddWarmups}
        onClearExerciseSets={handleClearExerciseSets}
        onRemoveExercise={handleRemoveExercise}
        onSelectSupersetPartner={(entryId, candidateId) => {
          useActiveWorkoutStore.getState().supersetWith(entryId, candidateId);
        }}
        onUngroupExercise={(entryId) => {
          useActiveWorkoutStore.getState().ungroupExercise(entryId);
        }}
        onSwitchToPickMode={() => {
          setOverflowMenu((prev) => (prev ? { ...prev, mode: 'pick' } : prev));
        }}
        onSwitchToMainMode={() => {
          setOverflowMenu((prev) => (prev ? { ...prev, mode: 'main' } : prev));
        }}
        onDismiss={() => setOverflowMenu(null)}
      />

      <SetTypeMenu
        anchor={setTypeCurrent != null ? (setTypeMenu?.anchor ?? null) : null}
        currentType={setTypeCurrent}
        onClose={() => setSetTypeMenu(null)}
        onSelect={(type) => {
          const setId = setTypeMenu?.setId;
          if (setId != null) {
            useActiveWorkoutStore
              .getState()
              .updateSetField(setId, { set_type: type });
          }
        }}
        onGenerateDropSets={(() => {
          const setId = setTypeMenu?.setId;
          if (setId == null) return undefined;
          const ex = session.exercises.find((e) =>
            e.sets.some((s) => String(s.id) === setId)
          );
          if (!ex) return undefined;
          // Drop from the last working set with a weight, typed or assumed.
          const baseIndex = findDropSetBaseIndex(
            ex.sets,
            (s) => s.weight ?? plannedSetValues[String(s.id)]?.weight
          );
          if (baseIndex < 0) return undefined;
          const baseSet = ex.sets[baseIndex];
          const weightKg = Number(
            baseSet.weight ?? plannedSetValues[String(baseSet.id)]?.weight
          );
          return () => {
            useActiveWorkoutStore
              .getState()
              .addDropSetsToExercise(ex.id, weightKg, weightUnit);
            setSetTypeMenu(null);
          };
        })()}
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
