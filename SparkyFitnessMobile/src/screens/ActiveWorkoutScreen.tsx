import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AppState,
  Keyboard,
  LayoutAnimation,
  Platform,
  Text,
  View,
  type LayoutChangeEvent,
  useWindowDimensions,
} from 'react-native';
import {
  type KeyboardAwareScrollViewRef,
  useKeyboardState,
} from 'react-native-keyboard-controller';
import {
  calculateWarmupSets,
  findDropSetBaseIndex,
  findWarmupBaseIndex,
  usesBarbell,
} from '@workspace/shared';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import ActiveWorkoutHeader, {
  ActiveWorkoutStripButtons,
  buildExerciseProgress,
} from '../components/ActiveWorkoutHeader';
import { useSupersetBorders } from '../components/ActiveWorkoutRail';
import type { SetRowAccessoryHandle } from '../components/ActiveWorkoutSetRow';
import {
  SET_ACCESSORY_BAR_HEIGHT,
  StickySetInputAccessoryBar,
  useDeactivateOnKeyboardDismiss,
  type SetAccessoryAction,
  type SetInputField,
} from '../components/SetRowChrome';
import { MetricColumnMenu } from '../components/WorkoutMenus';
import PlateCalculatorSheet from '../components/PlateCalculatorSheet';
import {
  storedWeightInUnit,
  weightFromKg,
  weightToKg,
} from '../utils/unitConversions';
import {
  ActiveWorkoutCompactRestRow,
  COMPACT_REST_ROW_HEIGHT,
  MIN_WINDOW_HEIGHT_FOR_COMPACT_REST_ROW,
  LiveActiveWorkoutRestBar,
} from '../components/ActiveWorkoutRestBar';
import type { ActionSheetRef } from '../components/ActionSheet';
import { type AnchorRect } from '../components/AnchoredMenu';
import type { ExerciseSetRestSheetRef } from '../components/ExerciseSetRestSheet';
import ExerciseSetRestSheet from '../components/ExerciseSetRestSheet';
import WorkoutDurationSheet, {
  type WorkoutDurationSheetRef,
} from '../components/WorkoutDurationSheet';
import FocusExercisesSheet from '../components/FocusExercisesSheet';
import FocusSetOptionsPage from '../components/FocusSetOptionsPage';
import FocusWorkoutSettingsPage from '../components/FocusWorkoutSettingsPage';
import FocusEffortSheet, {
  effortStartValue,
} from '../components/FocusEffortSheet';
import { type EffortMetric } from '../components/FocusEffortSlider';
import FocusPrCard from '../components/FocusPrCard';
import { formatLocalizedNumber } from '../localization';
import ActiveWorkoutIntervalHud from '../components/ActiveWorkoutIntervalHud';
import ActiveWorkoutGuidedCard from '../components/ActiveWorkoutGuidedCard';
import ActiveWorkoutRenameModal from '../components/ActiveWorkoutRenameModal';
import ActiveWorkoutLocationModal from '../components/ActiveWorkoutLocationModal';
import { setWorkoutReorderSource } from '../services/workoutReorderSource';
import ActiveWorkoutOverflowSheet, {
  type OverflowMenuState,
} from '../components/ActiveWorkoutOverflowSheet';
import ActiveWorkoutFocusView from '../components/ActiveWorkoutFocusView';
import FocusRestCard from '../components/FocusRestCard';
import Button from '../components/ui/Button';
import { useActiveWorkoutAutosave } from '../hooks/useActiveWorkoutAutosave';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useNavigationActionGuard } from '../hooks/useNavigationActionGuard';
import { usePreferences } from '../hooks/usePreferences';
import { useVerticalBar } from '../hooks/useVerticalBar';
import { getActiveServerConfig } from '../services/storage';
import {
  useActiveWorkoutStore,
  type ActiveSetPatch,
} from '../stores/activeWorkoutStore';
import { useFocusHold } from '../hooks/useFocusHold';
import {
  shouldPlaceHeaderInStatusRow,
  statusRowCluster,
  verticalStripBottom,
} from '../utils/activeWorkoutHeaderLayout';
import { useStatusOcclusion } from '../hooks/useStatusOcclusion';
import { AnimatedStripBox } from '../components/AnimatedStripBox';
import { runAfterKeyboardSettles } from '../utils/keyboardFocus';
import {
  buildExerciseReorderItems,
  describeActiveSet,
  describeActiveSetAssumed,
  FOCUS_SUPERSET_PALETTE_VARS,
  firstSetInputField,
  formatSetLoad,
  rendersCardioEffortForm,
  resolveSnapshotModality,
  isCardioModality,
  isDurationModality,
  isWeightDurationModality,
  effectiveSetDurationSec,
  isMetricClampedToRpe,
  isWarmupSetType,
  quantizeSetWeightKg,
  resolveCurrentSetId,
  SET_TYPE_OPTIONS,
} from '../utils/workoutSession';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { resolveWarmupOptions } from '../utils/warmupSettings';
import { useLiveWorkoutCalories } from '../stores/liveHeartRateStore';
import { useActiveWorkoutIntervalLifecycle } from '../hooks/useActiveWorkoutIntervalLifecycle';
import { useActiveWorkoutDiscard } from '../hooks/useActiveWorkoutDiscard';
import { useActiveWorkoutFinish } from '../hooks/useActiveWorkoutFinish';
import { useActiveWorkoutExerciseActions } from '../hooks/useActiveWorkoutExerciseActions';
import { useLiveCoachingSignals } from '../hooks/useLiveCoachingSignals';
import { FocusLogLockContext } from '../components/focusLogLock';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ActiveWorkout'>;

/** Breathing room kept between the sets and the floating focus rest card. */
const FOCUS_REST_OVERLAY_GAP = 16;

function ActiveWorkoutScreen({ navigation, route }: Props) {
  useLiveCoachingSignals();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const railBeside = useVerticalBar();
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
  const previousSessionSets = useActiveWorkoutStore(
    (s) => s.previousSessionSets
  );
  const exerciseConfigs = useActiveWorkoutStore((s) => s.exerciseConfigs);
  const coachingSignals = useActiveWorkoutStore((s) => s.coachingSignals);
  const declinedAdaptive = useActiveWorkoutStore((s) => s.declinedAdaptive);
  // Only the rest state's transitions reach the screen; the countdown itself
  // ticks inside the rest bar.
  const restState = useActiveWorkoutStore((s) => s.rest.state);
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
  useActiveWorkoutIntervalLifecycle(workoutFormat, guidedWorkoutEnabled);

  const showFocusNowBanner = useAppPreferencesStore((s) => s.focusNowBanner);
  // The one-exercise view is the only layout. Guided mode and the interval
  // formats render their own card / HUD at the top of it and drive set timing
  // themselves, so the hold screen and the post-set effort / PR flow, which
  // belong to a plain standard workout, stay off for them.
  const standardFocus =
    (workoutFormat ?? 'standard') === 'standard' && !guidedWorkoutEnabled;
  // A standard-format rest that is running blocks logging a new set (the
  // interval formats and guided mode own their rest and never lock).
  const logLocked = restState !== 'ready' && standardFocus;

  // The exercise on show in the focus view, for the header's "2/6" pill.
  const [focusIndex, setFocusIndex] = useState(0);

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

  // The set cell holding the keyboard (its render key) and which field. The
  // ref is written with the state, not by an effect after the commit, so the
  // rest-expiry subscription below already sees a tap from the same tick.
  const [focusedSetKey, setFocusedSetKeyState] = useState<string | null>(null);
  const focusedSetKeyRef = useRef<string | null>(null);
  const setFocusedSetKey = useCallback((key: string | null) => {
    focusedSetKeyRef.current = key;
    setFocusedSetKeyState(key);
  }, []);
  const [focusedField, setFocusedField] = useState<SetInputField>('weight');

  // While a set is being edited the autosave holds the server's replies back
  // from the keyboard (see useActiveWorkoutAutosave).
  const { flush } = useActiveWorkoutAutosave({
    editing: focusedSetKey != null,
  });
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

  const handleReorderMove = useCallback((from: number, to: number) => {
    useActiveWorkoutStore.getState().reorderExercises(from, to);
  }, []);
  const [exercisesSheetVisible, setExercisesSheetVisible] = useState(false);
  const handleOpenExercisesSheet = useCallback(() => {
    Keyboard.dismiss();
    setExercisesSheetVisible(true);
  }, []);
  const handleCloseExercisesSheet = useCallback(
    () => setExercisesSheetVisible(false),
    []
  );

  const handleOpenReorder = useCallback(() => {
    Keyboard.dismiss();
    // A reorder screen opened from a workout form can still be in the stack
    // below this one, holding the form's list. `navigate` would return to it;
    // push a new one, which finds no form source and edits this session.
    setWorkoutReorderSource(null);
    runNavigationAction(() => navigation.push('WorkoutReorder'));
  }, [navigation, runNavigationAction]);

  // The focus view opens its own settings page.
  const [focusSettingsOpen, setFocusSettingsOpen] = useState(false);
  const handleOpenWorkoutSettings = useCallback(() => {
    Keyboard.dismiss();
    setFocusSettingsOpen(true);
  }, []);

  const exercisesForBorders = useMemo(
    () => session?.exercises ?? [],
    [session]
  );
  // The focus view draws supersets in the watch's lilac group colour.
  const { runs: supersetRuns, borders: focusSupersetBorders } =
    useSupersetBorders(exercisesForBorders, FOCUS_SUPERSET_PALETTE_VARS);

  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);

  // The rest bar, "do this now" and similar callers ask the focus view to
  // show an exercise; a new `seq` is a new request.
  const [focusShowRequest, setFocusShowRequest] = useState<{
    id: string;
    seq: number;
  } | null>(null);

  const handleShowExercise = useCallback((entryId: string) => {
    setFocusShowRequest((prev) => ({
      id: entryId,
      seq: (prev?.seq ?? 0) + 1,
    }));
  }, []);

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

  const handleSwapExercise = useCallback((entryId: string) => {
    Keyboard.dismiss();
    setOverflowMenu({ entryId, mode: 'swap' });
    overflowSheetRef.current?.present();
  }, []);

  const handleDoExerciseNow = useCallback(
    (entryId: string) => {
      useActiveWorkoutStore.getState().doExerciseNow(entryId);
      handleShowExercise(entryId);
    },
    [handleShowExercise]
  );

  const handleActivateSet = useCallback(
    (setKey: string, field: Exclude<SetInputField, 'rpe'>) => {
      setFocusedField(field);
      setFocusedSetKey(setKey);
    },
    [setFocusedSetKey]
  );
  const handleActivateRpe = useCallback(
    (setKey: string) => {
      setFocusedField('rpe');
      setFocusedSetKey(setKey);
    },
    [setFocusedSetKey]
  );

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
  // stamp restExpiredAt, so they never steal focus, and neither does an
  // expiry while a set cell already has the keyboard: the lifter is typing
  // there. Turned off in Workout Settings (#3581), the rest ends with the
  // keyboard closed. A store subscription (not an effect on the value)
  // because this reacts to an event, once.
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
          !useAppPreferencesStore.getState().focusNextSetOnRestEnd ||
          !isFocusedRef.current ||
          focusedSetKeyRef.current != null ||
          AppState.currentState !== 'active' ||
          state.activeSetId == null
        )
          return;
        const setId = state.activeSetId;
        const exercise = state.session?.exercises.find((e) =>
          e.sets.some((s) => String(s.id) === setId)
        );
        if (!exercise) return;
        const key = state.setRenderKeys[setId] ?? setId;
        // In the one-exercise view the lifter may have paged to another
        // exercise; its row isn't mounted, so there is nothing to focus and
        // a stuck focused key would hold autosave. Stay where they went.
        if (accessoryHandlesRef.current[key] == null) return;
        handleActivateSet(
          key,
          firstSetInputField(
            resolveSnapshotModality(exercise.exercise_snapshot)
          )
        );
      }),
    [handleActivateSet]
  );

  useDeactivateOnKeyboardDismiss(
    useCallback(() => setFocusedSetKey(null), [setFocusedSetKey]),
    focusedSetKey != null
  );

  // The set the plate calculator is open for (its weight is kg, as stored).
  const [plateCalc, setPlateCalc] = useState<{
    setId: string;
    weightKg: number | null;
    equipment: readonly string[] | null;
    exerciseName?: string;
    setNumber?: number;
  } | null>(null);
  // The plate calculator's target for a set: only a barbell exercise has one.
  // Reads the store so a weight committed a moment ago (a row flushing its
  // draft) is not missed by a stale render.
  const plateTargetFor = useCallback(
    (setId: string, weightKgOverride?: number | null) => {
      const current = useActiveWorkoutStore.getState().session;
      const ex = current?.exercises.find((e) =>
        e.sets.some((s) => String(s.id) === setId)
      );
      const equipment = ex?.exercise_snapshot?.equipment ?? null;
      if (!ex || !usesBarbell(equipment)) return null;
      const set = ex.sets.find((s) => String(s.id) === setId);
      // The focus strip passes the weight it shows (typed or assumed), so the
      // calculator opens on the same target.
      const weightKg = Number(
        weightKgOverride ?? set?.weight ?? plannedSetValues[setId]?.weight
      );
      return {
        setId,
        weightKg: Number.isFinite(weightKg) && weightKg > 0 ? weightKg : null,
        equipment,
        exerciseName: ex.exercise_snapshot?.name,
        setNumber: set?.set_number,
      };
    },
    [plannedSetValues]
  );
  const openPlateCalculator = useCallback(
    (setId: string, weightKg?: number | null) => {
      const target = plateTargetFor(setId, weightKg);
      if (target) setPlateCalc(target);
    },
    [plateTargetFor]
  );

  const handleAccessoryDone = useCallback(() => {
    setFocusedSetKey(null);
    Keyboard.dismiss();
  }, [setFocusedSetKey]);

  // The keyboard bar is mounted the whole time, so its props are memoized: a
  // screen render that changes nothing on it (a sheet or menu opening, a rest
  // pausing or resuming) must not re-render it. Next walks weight → reps → RPE
  // (or a cardio form's duration → distance); the last field offers Log on an
  // unlogged set, Next Set on a logged one, or only Done.
  const accessoryActions = useMemo<SetAccessoryAction[]>(() => {
    if (focusedSetKey == null || session == null) return [];
    const key = focusedSetKey;
    const focusedSetId =
      Object.keys(setRenderKeys).find((id) => setRenderKeys[id] === key) ?? key;
    const focusedEntryIsCardioForm = session.exercises.some(
      (e) =>
        e.sets.some((s) => String(s.id) === focusedSetId) &&
        rendersCardioEffortForm(e.exercise_snapshot, e.sets.length)
    );
    const focusedExercise = session.exercises.find((e) =>
      e.sets.some((s) => String(s.id) === focusedSetId)
    );
    // A multi-set cardio row has a distance cell after its duration cell, so
    // it walks duration -> distance -> RPE like the one-set form does.
    const focusedIsDurationDistance =
      resolveSnapshotModality(focusedExercise?.exercise_snapshot) ===
      'duration_distance';
    const nextField = focusedEntryIsCardioForm
      ? focusedField === 'duration'
        ? ('distance' as const)
        : null
      : focusedField === 'weight'
        ? ('reps' as const)
        : focusedField === 'duration' && focusedIsDurationDistance
          ? ('distance' as const)
          : (focusedField === 'reps' ||
                focusedField === 'duration' ||
                (focusedField === 'distance' && focusedIsDurationDistance)) &&
              metricColumn === 'rpe'
            ? ('rpe' as const)
            : null;
    const focusedSetCompleted = completedSetIds[focusedSetId] != null;
    const showCalculator =
      focusedField === 'weight' &&
      usesBarbell(focusedExercise?.exercise_snapshot?.equipment);
    return [
      ...(showCalculator
        ? [
            {
              key: 'plate-calculator',
              label: t('plates.calculatorShort', {
                defaultValue: 'Calculator',
              }),
              onPress: () => {
                // The row commits its weight draft when it loses focus, which
                // happens after this handler: flush first so the calculator
                // sees what is on screen.
                accessoryHandlesRef.current[key]?.flushWeight?.();
                setFocusedSetKey(null);
                Keyboard.dismiss();
                openPlateCalculator(focusedSetId);
              },
            },
          ]
        : []),
      ...(nextField != null
        ? [
            {
              key: 'next',
              label: t('workout.next', { defaultValue: 'Next' }),
              onPress: () => {
                accessoryHandlesRef.current[key]?.focusField(nextField);
              },
            },
          ]
        : []),
      ...(nextField == null && focusedSetCompleted && !focusedEntryIsCardioForm
        ? [
            {
              key: 'next-set',
              label: t('workout.nextSet', { defaultValue: 'Next Set' }),
              onPress: () => {
                accessoryHandlesRef.current[key]?.advance();
              },
            },
          ]
        : []),
      ...(!focusedSetCompleted
        ? [
            {
              key: 'log',
              label: t('workout.log', { defaultValue: 'Log' }),
              bold: true,
              disabled: logLocked,
              onPress: () => {
                accessoryHandlesRef.current[key]?.log();
              },
            },
          ]
        : []),
    ];
  }, [
    focusedSetKey,
    focusedField,
    session,
    setRenderKeys,
    completedSetIds,
    metricColumn,
    openPlateCalculator,
    setFocusedSetKey,
    logLocked,
    t,
  ]);

  // While a rest runs, the keyboard bar carries its controls: the docked rest
  // bar is behind the keyboard. A short screen leaves the row out, or it would
  // cover the set being edited. The row ticks on the shared clock by itself,
  // so the element only changes when a rest starts or ends.
  const restRunning = restState !== 'ready';
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const barCarriesRest =
    restRunning && windowHeight >= MIN_WINDOW_HEIGHT_FOR_COMPACT_REST_ROW;
  const accessoryRestSlot = useMemo(
    () => (barCarriesRest ? <ActiveWorkoutCompactRestRow /> : undefined),
    [barCarriesRest]
  );

  // What the focus view shows after a logged set: the effort sheet (only with
  // the effort column on and no effort yet), then the PR card for a record.
  const [postSet, setPostSet] = useState<{
    setId: string;
    stage: 'effort' | 'pr';
  } | null>(null);
  const handleClosePrCard = useCallback(() => setPostSet(null), []);
  const startPostSetFlow = useCallback((setId: string) => {
    const state = useActiveWorkoutStore.getState();
    const exercise = state.session?.exercises.find((e) =>
      e.sets.some((s) => String(s.id) === setId)
    );
    const set = exercise?.sets.find((s) => String(s.id) === setId);
    if (exercise == null || set == null || state.completedSetIds[setId] == null)
      return;
    const modality = resolveSnapshotModality(exercise.exercise_snapshot);
    const column = useAppPreferencesStore.getState().activeWorkoutMetricColumn;
    const effective =
      isMetricClampedToRpe(modality) && column !== 'rir' ? 'rpe' : column;
    const effortColumnOn = effective === 'rpe' || effective === 'rir';
    const hasEffort = set.rpe != null || set.rir != null;
    if (
      effortColumnOn &&
      useAppPreferencesStore.getState().watchRpeEnabled &&
      !hasEffort &&
      !isWarmupSetType(set.set_type)
    ) {
      setPostSet({ setId, stage: 'effort' });
    } else if (state.prSetIds[setId]) {
      setPostSet({ setId, stage: 'pr' });
    }
  }, []);

  const handleCompleteSet = useCallback(
    (setId: string) => {
      useActiveWorkoutStore.getState().completeSet(setId);
      if (standardFocus) startPostSetFlow(setId);
      setFocusedSetKey(null);
      setExpandedSetKey(null);
      Keyboard.dismiss();
      const store = useActiveWorkoutStore.getState();
      const completed = store.completedSetIds;
      const remaining =
        store.session?.exercises.reduce(
          (sum, e) =>
            sum + e.sets.filter((s) => !completed[String(s.id)]).length,
          0
        ) ?? 0;
      if (remaining === 0) {
        runAfterKeyboardSettles(() => {
          scrollRef.current?.scrollToEnd({ animated: true });
        }, 350);
      }
    },
    [setFocusedSetKey, startPostSetFlow, standardFocus]
  );

  // What the focus view's controls call; a tap during a rest logs nothing,
  // except re-marking a set that comes before the current one.
  // The hold finish and the guided card use handleCompleteSet directly.
  const handleLogTap = useCallback(
    (setId: string) => {
      if (logLocked) {
        const { steps, activeSetId: currentId } =
          useActiveWorkoutStore.getState();
        const at = steps.findIndex((step) => step.setId === setId);
        const current = steps.findIndex((step) => step.setId === currentId);
        if (at < 0 || current < 0 || at >= current) return;
      }
      handleCompleteSet(setId);
    },
    [logLocked, handleCompleteSet]
  );

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
  // The page's note field flushes its draft on unmount, after the menu state is
  // already null; keep the last id so that final commit still reaches the set.
  const [lastSetOptionsId, setLastSetOptionsId] = useState('');
  const handlePressSetType = useCallback(
    (setId: string, anchor: AnchorRect) => {
      setSetTypeMenu({ setId, anchor });
      setLastSetOptionsId(setId);
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
  const openMenuRef = useRef<(() => void) | null>(null);
  const { handleConfirmEnd, handleDurationSave } = useActiveWorkoutFinish({
    navigation,
    session,
    completedSetIds,
    flush,
    durationSheetRef,
    safeGoBack,
  });

  // Everything handed to a memoized child below is kept stable here, so a
  // screen render that changes nothing for that child (a cell gaining focus,
  // a rest starting) does not re-render it.
  const progress = useMemo(
    () =>
      session == null ? [] : buildExerciseProgress(session, completedSetIds),
    [session, completedSetIds]
  );
  const liveCalories = useLiveWorkoutCalories();
  const exerciseCount = session?.exercises.length ?? 0;
  const focusedEntryId = String(
    session?.exercises[Math.min(focusIndex, exerciseCount - 1)]?.id ?? ''
  );
  const focusBar = useMemo(
    () => ({
      position: Math.min(focusIndex, exerciseCount - 1) + 1,
      total: exerciseCount,
      onOpenList: handleOpenExercisesSheet,
      exerciseEntryId: focusedEntryId,
      caloriesKcal: liveCalories,
    }),
    [
      focusIndex,
      exerciseCount,
      handleOpenExercisesSheet,
      focusedEntryId,
      liveCalories,
    ]
  );
  const handleOpenRename = useCallback(() => setRenameVisible(true), []);
  const handleOpenLocation = useCallback(() => setLocationVisible(true), []);
  // The header's laid-out height: the strip buttons are placed from window
  // coordinates, and the content they sit in starts right below it.
  // UIKit's own reserved regions say where the status content ends, a running
  // Live Activity included, which no inset reports. Read only where it matters.
  const statusRegions = useStatusOcclusion(
    railBeside ||
      shouldPlaceHeaderInStatusRow({
        os: Platform.OS,
        railBeside,
        topInset: insets.top,
        windowWidth,
      })
  );
  const [headerHeight, setHeaderHeight] = useState(0);
  const handleHeaderLayout = useCallback((e: LayoutChangeEvent) => {
    setHeaderHeight(e.nativeEvent.layout.height);
  }, []);

  // The timed hold in the focus view; its screen replaces the footer.
  const hold = useFocusHold({
    session,
    activeSetId,
    enabled: standardFocus,
    onFinish: handleCompleteSet,
  });
  // The focus view logs a set (or starts a hold) from the active-set card, so
  // its bar only shows while a rest runs.
  const restBarVisible = restRunning && hold.phase === 'idle';
  // The focus view's rest card floats over the bottom of the page, so the
  // scroll content keeps its height clear while it shows. It hides behind the
  // keyboard, whose bar carries the rest controls instead.
  const [focusRestHeight, setFocusRestHeight] = useState(0);
  // The interval formats own their rest (the HUD), so the overlay would be a
  // second timer. Guided mode shares the standard card: it is the one set of
  // rest controls (-15 s, Pause, +15 s, Skip), and the guided card shows only
  // what is next.
  // A field can stay focused with no keyboard on screen (a hardware keyboard,
  // or a tap on a button that leaves the field focused); the keyboard bar then
  // isn't there to carry the rest, so the card stays up.
  const keyboardUp = useKeyboardState((state) => state.isVisible);
  const focusRestOverlay =
    restRunning &&
    !(focusedSetKey != null && keyboardUp) &&
    (workoutFormat ?? 'standard') === 'standard';
  const scrollContentStyle = useMemo(() => {
    const basePadding = insets.bottom + 16;
    return {
      paddingBottom: focusRestOverlay
        ? basePadding + focusRestHeight + FOCUS_REST_OVERLAY_GAP
        : basePadding,
    };
  }, [focusRestOverlay, focusRestHeight, insets.bottom]);

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

  const hasAnyCompletedSets = Object.keys(completedSetIds).length > 0;
  // Assumed-aware, like the workout bar: a set with empty fields shows the
  // target its row shows in grey, so the banner and the rest line read
  // "load × reps" whenever one is known.
  const activeSetDescription = describeActiveSetAssumed(session, activeSetId, {
    previousSessionSets,
    plannedSetValues,
    exerciseConfigs,
    weightUnit,
    workoutFormat,
    coachingSignals,
    declinedAdaptive,
  });
  const restNextSetText =
    activeSetDescription == null
      ? null
      : formatSetLoad(activeSetDescription, weightUnit, t);

  // The last logged set, which the Exercises sheet's Undo reverts.
  const lastLoggedSetId = Object.entries(completedSetIds).reduce<string | null>(
    (latest, [id, at]) =>
      latest == null || at > completedSetIds[latest] ? id : latest,
    null
  );
  const undoDescription = describeActiveSet(session, lastLoggedSetId);
  const undoLoad =
    undoDescription != null
      ? formatSetLoad(undoDescription, weightUnit, t)
      : null;
  const exercisesUndo =
    lastLoggedSetId != null && undoDescription != null
      ? {
          detail: [undoDescription.exerciseName, undoLoad]
            .filter((part) => part != null && part !== '')
            .join(' · '),
          onUndo: () => handleUncomplete(lastLoggedSetId),
        }
      : null;
  const focusRestNextText =
    activeSetDescription == null
      ? null
      : restNextSetText != null
        ? `${t('workout.setNumber', { defaultValue: 'Set {{number}}', number: activeSetDescription.setNumber })} · ${restNextSetText}`
        : t('workout.setNumber', {
            defaultValue: 'Set {{number}}',
            number: activeSetDescription.setNumber,
          });
  const focusNowBanner =
    showFocusNowBanner && activeSetDescription != null
      ? {
          exerciseName: activeSetDescription.exerciseName,
          setNumber: activeSetDescription.setNumber,
          setCount: activeSetDescription.setCount,
          load: restNextSetText,
        }
      : undefined;

  // The set the Set type menu / Set options page is open for.
  const setOptionsSet = (() => {
    if (setTypeMenu == null) return null;
    for (const exercise of session.exercises) {
      const set = exercise.sets.find((s) => String(s.id) === setTypeMenu.setId);
      if (set) return { exercise, set };
    }
    return null;
  })();
  const handleSelectSetType = (type: (typeof SET_TYPE_OPTIONS)[number]) => {
    const setId = setTypeMenu?.setId;
    if (setId != null) {
      useActiveWorkoutStore
        .getState()
        .updateSetField(setId, { set_type: type });
    }
  };
  const openSetPlateCalculator = (() => {
    const setId = setTypeMenu?.setId;
    if (setId == null) return undefined;
    const target = plateTargetFor(setId);
    if (!target) return undefined;
    return () => {
      setPlateCalc(target);
      setSetTypeMenu(null);
    };
  })();
  const generateDropSets = (() => {
    const ex = setOptionsSet?.exercise;
    if (ex == null) return undefined;
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
  })();

  // The set behind the post-set effort sheet / PR card.
  // `postSet.setId` is the id seen when the set was logged; autosave can swap
  // it, so every read and write goes through the set's current id.
  const postSetId =
    postSet != null
      ? resolveCurrentSetId(session, setRenderKeys, postSet.setId)
      : null;
  const postSetTarget = (() => {
    if (postSetId == null) return null;
    for (const exercise of session.exercises) {
      const set = exercise.sets.find((s) => String(s.id) === postSetId);
      if (set) return { exercise, set };
    }
    return null;
  })();
  const effortMetric: EffortMetric = metricColumn === 'rir' ? 'rir' : 'rpe';
  const postSetModality =
    postSetTarget != null
      ? resolveSnapshotModality(postSetTarget.exercise.exercise_snapshot)
      : null;
  const postSetTimed =
    postSetModality != null &&
    (isDurationModality(postSetModality) ||
      isWeightDurationModality(postSetModality));
  const postSetSummary =
    postSetTarget != null && postSetModality != null
      ? formatSetLoad(
          {
            weightKg: postSetTarget.set.weight ?? null,
            reps: postSetTimed ? null : (postSetTarget.set.reps ?? null),
            durationSec: postSetTimed
              ? effectiveSetDurationSec(postSetTarget.set, postSetModality)
              : null,
          },
          weightUnit,
          t
        )
      : null;
  const finishEffortPrompt = (value: number | null) => {
    if (postSet == null) return;
    if (value != null && postSetId != null) {
      handleCommitField(
        postSetId,
        effortMetric === 'rir' ? { rir: value } : { rpe: value }
      );
    }
    const isPr =
      postSetId != null && useActiveWorkoutStore.getState().prSetIds[postSetId];
    setPostSet(isPr ? { setId: postSet.setId, stage: 'pr' } : null);
  };
  const prDetail = (() => {
    if (postSetTarget == null) return null;
    const { exercise, set } = postSetTarget;
    const baseline =
      useActiveWorkoutStore.getState().prBaseline[exercise.exercise_id ?? ''];
    if (baseline?.weight == null || set.weight == null) return null;
    const gainKg = set.weight - baseline.weight;
    if (gainKg <= 0) return null;
    const fmt = (kg: number) =>
      `${formatLocalizedNumber(weightFromKg(kg, weightUnit), { maximumFractionDigits: 2 })} ${weightUnit}`;
    return { gain: `+${fmt(gainKg)}`, previous: fmt(baseline.weight) };
  })();
  const prLoad =
    postSetTarget != null
      ? (formatSetLoad(
          {
            weightKg: postSetTarget.set.weight ?? null,
            reps: postSetTarget.set.reps ?? null,
            durationSec: null,
          },
          weightUnit,
          t
        ) ?? '')
      : '';

  const footerButtons = (
    <>
      <Button variant="ghost" onPress={handleAddExercise} className="mt-5 mx-1">
        {t('workout.addExercise', { defaultValue: 'Add an Exercise' })}
      </Button>

      <Button
        variant="primary"
        onPress={handleConfirmEnd}
        className="mt-2 mb-2 mx-1"
      >
        {t('workout.endWorkout', { defaultValue: 'End Workout' })}
      </Button>
    </>
  );
  // The focused cell stays clear of the keyboard bar riding on top of the
  // keyboard, and of the rest row it carries while a rest runs.
  const keyboardBottomOffset =
    SET_ACCESSORY_BAR_HEIGHT +
    (barCarriesRest ? COMPACT_REST_ROW_HEIGHT : 0) +
    16;

  // `railBeside` (read with the other hooks above): the system's vertical bar
  // owns one edge, i.e. the iPhone Duo's inner display wide or its closed outer
  // display. The tall inner pose and every other iPhone, notched ones in
  // landscape included, keep the rail as a row.
  // The strip column sits in the safe-area inset, under the clock and Wi-Fi
  // glyphs (about 100 pt tall on the Duo). Never cache: the side swaps by pose.
  const stripWidth = Math.max(insets.left, insets.right);
  // Tiles centre on the status glyphs (measured ~48 pt in from the edge), so
  // the rail is twice that wide; a ringed tile is 52 pt and fits with room.
  const RAIL_WIDTH = 96;
  const stripOnRight = insets.right >= insets.left;
  // The closed outer display (~466 pt wide) parks the clock and Wi-Fi cluster
  // lower than the inner display does (dots end ~150 pt down vs ~98 pt), so the
  // strip buttons start lower there to keep the same gap under it.
  const fallbackStripButtonsTop = windowWidth < 500 ? 98 : 54;
  // The tall inner pose has a status row across the top (82 pt inset) that is
  // empty left of the clock and Wi-Fi cluster. Draw the header in that row.
  const headerInStatusRow = shouldPlaceHeaderInStatusRow({
    os: Platform.OS,
    railBeside,
    topInset: insets.top,
    windowWidth,
  });
  // Beside a bar the buttons start where the strip's status content ends (the
  // region's frame already carries the ~25 pt gap App Settings uses), measured
  // from the top of the content below the header. The rail takes the rest, and
  // it scrolls, so a lengthened cluster just shortens the visible list.
  const stripBottom = railBeside ? verticalStripBottom(statusRegions) : null;
  const stripButtonsTop =
    stripBottom != null
      ? Math.max(0, stripBottom - (insets.top + headerHeight))
      : fallbackStripButtonsTop;
  // A Live Activity widens the tall pose's cluster leftwards. The header stays
  // in the status row and its title row stops at the cluster's measured edge.
  const statusCluster = headerInStatusRow
    ? statusRowCluster(statusRegions, windowWidth)
    : null;
  // The header's back and menu buttons move into the strip beside a vertical
  // bar, so mount them there on their own.
  // The first measurement replaces the fixed guess used until it arrives; that
  // is settling in, not movement, so it snaps like a change of window size.
  const stripLayoutKey = `${windowWidth}x${windowHeight}:${stripBottom != null}`;
  const stripButtonsOnly = (
    <AnimatedStripBox
      pointerEvents="box-none"
      top={stripButtonsTop}
      layoutKey={stripLayoutKey}
      style={{
        position: 'absolute',
        alignItems: 'center',
        width: RAIL_WIDTH,
        ...(stripOnRight ? { right: -stripWidth } : { left: -stripWidth }),
      }}
    >
      <ActiveWorkoutStripButtons
        onBack={safeGoBack}
        onMenu={() => openMenuRef.current?.()}
      />
    </AnimatedStripBox>
  );
  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: headerInStatusRow ? 0 : insets.top }}
    >
      <View onLayout={handleHeaderLayout}>
        <ActiveWorkoutHeader
          inStatusRow={headerInStatusRow}
          statusCluster={statusCluster}
          name={session.name}
          location={session.location}
          startedAt={startedAt}
          progress={progress}
          focusBar={focusBar}
          onBack={safeGoBack}
          onDiscard={handleDiscard}
          onEndWorkout={handleConfirmEnd}
          onRename={handleOpenRename}
          onEditLocation={handleOpenLocation}
          onAddExercise={handleAddExercise}
          onReorder={reorderItemCount >= 2 ? handleOpenReorder : undefined}
          onOpenSettings={handleOpenWorkoutSettings}
          onClearAllSets={hasAnyCompletedSets ? handleClearAllSets : undefined}
          buttonsInStrip={railBeside}
          openMenuRef={openMenuRef}
        />
      </View>

      <View className="flex-1">
        <FocusLogLockContext.Provider value={logLocked}>
          <ActiveWorkoutFocusView
            scrollRef={scrollRef}
            showRequest={focusShowRequest}
            onDismissKeyboard={handleAccessoryDone}
            onSelectedIndexChange={setFocusIndex}
            onOpenPlateCalculator={openPlateCalculator}
            session={session}
            prSetIds={prSetIds}
            activeExerciseId={activeExerciseId}
            supersetBorders={focusSupersetBorders}
            hold={hold}
            nowBanner={focusNowBanner}
            sessionId={sessionId}
            verifiedSourcePresetId={effectiveVerifiedSourcePresetId}
            historyScopeSettled={historyScopeSettled}
            completedSetIds={completedSetIds}
            activeSetId={activeSetId}
            setRenderKeys={setRenderKeys}
            metricColumn={metricColumn}
            weightUnit={weightUnit}
            distanceUnit={distanceUnit}
            getImageSource={getImageSource}
            scrollContentStyle={scrollContentStyle}
            keyboardBottomOffset={keyboardBottomOffset}
            onSwap={handleSwapExercise}
            onPressOverflow={handlePressOverflow}
            onAddExercise={handleAddExercise}
            onSeeAlternatives={handleReplaceExercise}
            onCompleteSet={handleLogTap}
            onUncomplete={handleUncomplete}
            onCommitField={handleCommitField}
            onDeleteSet={handleDeleteSet}
            onPressMetricHeader={handlePressMetricHeader}
            onPressSetType={handlePressSetType}
            onToggleSetDetail={handleToggleSetDetail}
            expandedSetKey={expandedSetKey}
            noteEditorEntryId={noteEditorEntryId}
            onCommitExerciseNote={handleCommitExerciseNote}
            onAddSet={handleAddSet}
            onActivateRpe={handleActivateRpe}
            focusedSetKey={focusedSetKey}
            focusedField={focusedField}
            onActivateSet={handleActivateSet}
            onRegisterAccessoryHandle={handleRegisterAccessoryHandle}
            topSlot={
              <ActiveWorkoutIntervalHud getImageSource={getImageSource} />
            }
            guidedCard={
              guidedWorkoutEnabled && workoutFormat === 'standard' ? (
                <ActiveWorkoutGuidedCard
                  getImageSource={getImageSource}
                  onCompleteSet={handleCompleteSet}
                />
              ) : undefined
            }
          >
            {footerButtons}
          </ActiveWorkoutFocusView>
        </FocusLogLockContext.Provider>
        {focusRestOverlay && (
          <FocusRestCard
            nextText={focusRestNextText}
            onHeightChange={setFocusRestHeight}
          />
        )}
        {railBeside && stripButtonsOnly}
      </View>

      {restBarVisible && <LiveActiveWorkoutRestBar />}

      <StickySetInputAccessoryBar
        visible={focusedSetKey != null}
        onDone={handleAccessoryDone}
        actions={accessoryActions}
        restSlot={accessoryRestSlot}
      />

      <ExerciseSetRestSheet
        ref={setRestSheetRef}
        appearance="page"
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
        activeSetId={activeSetId}
        onDoExerciseNow={handleDoExerciseNow}
        onPressThumb={handlePressThumb}
        onToggleExerciseNote={handleToggleExerciseNote}
        onReplaceExercise={handleReplaceExercise}
        onPressRest={(entryId) => handlePressRestChip(entryId, null)}
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
        onSwitchToSwapMode={() => {
          setOverflowMenu((prev) => (prev ? { ...prev, mode: 'swap' } : prev));
        }}
        onSwitchToMainMode={() => {
          setOverflowMenu((prev) => (prev ? { ...prev, mode: 'main' } : prev));
        }}
        onDismiss={() => setOverflowMenu(null)}
      />

      <FocusSetOptionsPage
        visible={setTypeCurrent != null && setTypeMenu != null}
        setId={setTypeMenu?.setId ?? lastSetOptionsId}
        setNumber={setOptionsSet?.set.set_number ?? 0}
        currentType={setTypeCurrent}
        note={setOptionsSet?.set.notes}
        metricColumn={metricColumn}
        clampedToRpe={
          setOptionsSet != null &&
          isMetricClampedToRpe(
            resolveSnapshotModality(setOptionsSet.exercise.exercise_snapshot)
          )
        }
        onSelectType={handleSelectSetType}
        onSelectMetric={(metric) =>
          useAppPreferencesStore.getState().setActiveWorkoutMetricColumn(metric)
        }
        onCommitField={handleCommitField}
        onGenerateDropSets={generateDropSets}
        onOpenPlateCalculator={openSetPlateCalculator}
        onDelete={() => {
          const setId = setTypeMenu?.setId;
          setSetTypeMenu(null);
          if (setId != null) handleDeleteSet(setId);
        }}
        onClose={() => setSetTypeMenu(null)}
      />

      <FocusWorkoutSettingsPage
        visible={focusSettingsOpen}
        onClose={() => setFocusSettingsOpen(false)}
      />

      {plateCalc != null && (
        <PlateCalculatorSheet
          visible
          onClose={() => setPlateCalc(null)}
          targetWeight={
            plateCalc?.weightKg != null
              ? storedWeightInUnit(plateCalc.weightKg, weightUnit)
              : null
          }
          weightUnit={weightUnit}
          equipment={plateCalc?.equipment}
          exerciseName={plateCalc?.exerciseName}
          setNumber={plateCalc?.setNumber}
          onUseWeight={(weight) => {
            // The id the calculator opened with can have been swapped by
            // autosave since.
            const currentId = resolveCurrentSetId(
              useActiveWorkoutStore.getState().session,
              useActiveWorkoutStore.getState().setRenderKeys,
              plateCalc.setId
            );
            if (currentId != null) {
              handleCommitField(currentId, {
                weight: quantizeSetWeightKg(weightToKg(weight, weightUnit)),
              });
            }
            setPlateCalc(null);
          }}
        />
      )}

      {postSetTarget != null && postSet?.stage === 'effort' && (
        <FocusEffortSheet
          key={postSet.setId}
          visible
          title={
            postSetTarget.exercise.exercise_snapshot?.name ??
            t('workout.exercise', { defaultValue: 'Exercise' })
          }
          setLabel={t('workout.setNumber', {
            defaultValue: 'Set {{number}}',
            number: postSetTarget.set.set_number,
          })}
          summary={postSetSummary}
          timed={postSetTimed}
          cardio={postSetModality != null && isCardioModality(postSetModality)}
          metric={effortMetric}
          initialValue={effortStartValue(effortMetric)}
          onSave={(value) => finishEffortPrompt(value)}
          onSkip={() => finishEffortPrompt(null)}
        />
      )}
      {postSetTarget != null && postSet?.stage === 'pr' && (
        <FocusPrCard
          key={postSet.setId}
          visible
          exerciseName={
            postSetTarget.exercise.exercise_snapshot?.name ??
            t('workout.exercise', { defaultValue: 'Exercise' })
          }
          load={prLoad}
          detail={prDetail}
          onClose={handleClosePrCard}
        />
      )}

      <FocusExercisesSheet
        visible={exercisesSheetVisible}
        exercises={session.exercises}
        completedSetIds={completedSetIds}
        selectedId={
          session.exercises[Math.min(focusIndex, session.exercises.length - 1)]
            ?.id ?? null
        }
        undo={exercisesUndo}
        supersetBorders={focusSupersetBorders}
        onSelectExercise={handleShowExercise}
        onMoveItem={handleReorderMove}
        onAddExercise={handleAddExercise}
        onEndWorkout={handleConfirmEnd}
        onClose={handleCloseExercisesSheet}
      />
    </View>
  );
}

export default ActiveWorkoutScreen;
