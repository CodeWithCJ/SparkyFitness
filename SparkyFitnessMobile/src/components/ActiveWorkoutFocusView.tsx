import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import { usesBarbell, type PresetSessionResponse } from '@workspace/shared';
import ActiveWorkoutFocusChips from './ActiveWorkoutFocusChips';
import ActiveWorkoutFocusMedia from './ActiveWorkoutFocusMedia';
import ActiveWorkoutFocusSets from './ActiveWorkoutFocusSets';
import AdaptiveSuggestionBanner from './AdaptiveSuggestionBanner';
import ExerciseHeartRateChip from './ExerciseHeartRateChip';
import FocusHoldPanel from './FocusHoldPanel';
import FocusPlateStrip from './FocusPlateStrip';
import RestPeriodChip from './RestPeriodChip';
import WorkoutNotesField from './WorkoutNotesField';
import type { AnchorRect } from './AnchoredMenu';
import Icon from './Icon';
import ProgressionHintBanner from './ProgressionHintBanner';
import type { SupersetBorder } from './ActiveWorkoutRail';
import type { SetInputField, SetRowAccessoryHandle } from './SetRowChrome';
import { useExerciseStats } from '../hooks/useExerciseStats';
import { useHeartRateZoneColor } from '../hooks/useHeartRateZoneColor';
import type { GetImageSource } from '../hooks/useExerciseImageSource';
import type { FocusHold } from '../hooks/useFocusHold';
import {
  useCaptureLiveHistory,
  useExerciseBest,
  useLiveAdaptive,
  useLiveAssumedSetValues,
  useLiveProgression,
} from '../hooks/useLiveExerciseCoaching';
import { useAppLocale } from '../localization';
import { localizeExerciseTaxonomyValue } from '../localization/exerciseTaxonomy';
import { fireSelectionHaptic } from '../services/haptics';
import { useLiveHeartRate } from '../stores/liveHeartRateStore';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import type {
  ActiveSetPatch,
  CompletedSetMap,
  PrSetMap,
} from '../stores/activeWorkoutStore';
import {
  useAppPreferencesStore,
  type ActiveWorkoutMetricColumn,
} from '../stores/appPreferencesStore';
import {
  alignPreviousSets,
  plateTargetKg,
  rendersCardioEffortForm,
  resolveSnapshotModality,
} from '../utils/workoutSession';
import { storedWeightInUnit } from '../utils/unitConversions';
import {
  formatLastTimeSets,
  shouldFollowActive,
  summarizePlan,
  swipePageDelta,
} from '../utils/focusView';

type FocusExercise = PresetSessionResponse['exercises'][number];

const SLIDE_OFFSET = 32;
const SLIDE_MS = 180;

interface SetEditorProps {
  completedSetIds: CompletedSetMap;
  activeSetId: string | null;
  setRenderKeys: Record<string, string>;
  metricColumn: ActiveWorkoutMetricColumn;
  weightUnit: 'kg' | 'lbs';
  distanceUnit: 'km' | 'miles';
  onCompleteSet: (setId: string) => void;
  onUncomplete: (setId: string) => void;
  onCommitField: (setId: string, patch: ActiveSetPatch) => void;
  onAddSet: (entryId: string) => void;
  /** Opens the plate calculator sheet for a set (barbell exercises). */
  onOpenPlateCalculator: (setId: string) => void;
  onActivateRpe: (setKey: string) => void;
  onDeleteSet: (setId: string) => void;
  onPressMetricHeader: (anchor: AnchorRect, clampedToRpe: boolean) => void;
  onPressSetType: (setId: string, anchor: AnchorRect) => void;
  onToggleSetDetail: (setKey: string) => void;
  expandedSetKey: string | null;
  /** The screen's keyboard focus, shared with its sticky accessory bar. */
  focusedSetKey: string | null;
  focusedField: SetInputField;
  onActivateSet: (setKey: string, field: Exclude<SetInputField, 'rpe'>) => void;
  onRegisterAccessoryHandle: (
    key: string,
    handle: SetRowAccessoryHandle | null
  ) => void;
}

interface HistoryProps {
  /** The live session's entry id, excluded from the history baseline. */
  sessionId: string | null;
  verifiedSourcePresetId: number | undefined;
  /** False until `verifiedSourcePresetId` is final; see the card's prop. */
  historyScopeSettled: boolean;
}

interface Props extends SetEditorProps, HistoryProps {
  session: PresetSessionResponse;
  prSetIds: PrSetMap;
  /** Entry id holding the active set; the view follows it. */
  activeExerciseId: string | null;
  supersetBorders: Map<string, SupersetBorder>;
  /** The timed hold in progress; its exercise's page becomes the hold screen. */
  hold: FocusHold;
  getImageSource: GetImageSource;
  onPressOverflow: (entryId: string) => void;
  /** The quick change for a busy machine, as on the Now card. */
  onSwap: (entryId: string) => void;
  /** Opens the rest picker for an exercise's sets. */
  onPressRestChip: (entryId: string, currentSec: number | null) => void;
  /** The exercise whose note editor the overflow menu opened, if any. */
  noteEditorEntryId: string | null;
  onCommitExerciseNote: (entryId: string, text: string) => void;
  /** Opens ranked alternatives from the adaptive banner (#1560). */
  onSeeAlternatives?: (entryId: string) => void;
  /** Asks the view to show an exercise now (rest bar tap, "do this now"); a new `seq` is a new request. */
  showRequest?: { id: string; seq: number } | null;
  /** Reports the index of the exercise on show, for the screen's header pill. */
  onSelectedIndexChange?: (index: number) => void;
  /** Closes the keyboard and clears the screen's focused set, before a page change. */
  onDismissKeyboard: () => void;
  /** The screen's scroll ref, so it can scroll to the end buttons after the last set. */
  scrollRef: React.RefObject<KeyboardAwareScrollViewRef | null>;
  /** The screen's bottom padding, which clears its rest bar. */
  scrollContentStyle: StyleProp<ViewStyle>;
  /** Space kept between a focused input and the keyboard. */
  keyboardBottomOffset: number;
  /** Rendered under the last page, inside the scroll (Add exercise / End workout). */
  children?: React.ReactNode;
}

/**
 * Keeps the PR baseline and last-session sets in the store for an exercise the
 * view is not showing, as its list card would; the stats query is shared with
 * the page, so this adds no request.
 */
const HistoryCapture = React.memo(function HistoryCapture({
  exercise,
  sessionId,
  verifiedSourcePresetId,
  historyScopeSettled,
}: HistoryProps & { exercise: FocusExercise }) {
  const { data: stats } = useExerciseStats(
    exercise.exercise_id,
    sessionId ?? undefined,
    verifiedSourcePresetId
  );
  useCaptureLiveHistory(exercise.exercise_id, stats, historyScopeSettled, true);
  return null;
});

interface PageProps extends SetEditorProps {
  sessionId: string | null;
  verifiedSourcePresetId: number | undefined;
  exercise: FocusExercise;
  prSetIds: PrSetMap;
  mediaExpanded: boolean;
  getImageSource: GetImageSource;
  onToggleMedia: () => void;
  onPressOverflow: (entryId: string) => void;
  onSwap: (entryId: string) => void;
  onPressRestChip: (entryId: string, currentSec: number | null) => void;
  noteEditorEntryId: string | null;
  onCommitExerciseNote: (entryId: string, text: string) => void;
  onSeeAlternatives?: (entryId: string) => void;
  /** Set while another exercise than the active one is shown. */
  onBackToCurrent?: () => void;
  hold: FocusHold;
}

/** One exercise: media + title, plan / last-time context, coaching, sets. */
const FocusExercisePage = React.memo(function FocusExercisePage({
  exercise,
  prSetIds,
  mediaExpanded,
  getImageSource,
  onToggleMedia,
  onPressOverflow,
  onSwap,
  onPressRestChip,
  noteEditorEntryId,
  onCommitExerciseNote,
  onSeeAlternatives,
  onBackToCurrent,
  hold,
  sessionId,
  verifiedSourcePresetId,
  weightUnit,
  onOpenPlateCalculator,
  ...setEditorProps
}: PageProps) {
  const { t } = useTranslation();
  const [textPrimary, prColor, accent, heartRateColor] = useCSSVariable([
    '--color-text-primary',
    '--color-pr',
    '--color-accent-primary',
    '--color-heart-rate',
  ]) as [string, string, string, string];
  const plannedSetValues = useActiveWorkoutStore((s) => s.plannedSetValues);

  const snapshot = exercise.exercise_snapshot;
  const name =
    snapshot?.name ?? t('workout.exercise', { defaultValue: 'Exercise' });
  const { data: stats } = useExerciseStats(
    exercise.exercise_id,
    sessionId ?? undefined,
    verifiedSourcePresetId
  );
  const previousSessionSets = (stats?.recentSessions ?? [])[0]?.sets;
  // Warm-ups pair with last time's warm-ups, working sets with its working sets.
  const previousSets = useMemo(
    () => alignPreviousSets(exercise.sets, previousSessionSets),
    [exercise.sets, previousSessionSets]
  );
  const progressionResult = useLiveProgression(
    exercise,
    previousSessionSets,
    weightUnit,
    true
  );
  const {
    adaptiveAdjustment,
    adaptiveDeclined,
    suggestVariation,
    adaptiveOverridesProgression,
  } = useLiveAdaptive(exercise, true);
  const assumedSetValues = useLiveAssumedSetValues(
    exercise,
    previousSessionSets,
    weightUnit,
    true
  );
  const { bestDisplay, bestIsPr, bestText } = useExerciseBest(
    exercise,
    stats?.bestSet ?? null,
    prSetIds,
    weightUnit,
    true
  );

  // One-set cardio logs duration and distance in a form, with no rest between sets.
  const cardioForm = rendersCardioEffortForm(snapshot, exercise.sets.length);
  // The watch's newest reading for this exercise, in the person's zone color.
  const liveBpm = useLiveHeartRate(String(exercise.id));
  const zoneColor = useHeartRateZoneColor(liveBpm);
  const plateEquipment = snapshot?.equipment ?? null;
  const showPlates = usesBarbell(plateEquipment) && !cardioForm;
  const plateTarget = useMemo(
    () =>
      showPlates
        ? plateTargetKg(
            exercise.sets,
            setEditorProps.activeSetId,
            assumedSetValues
          )
        : null,
    [showPlates, exercise.sets, setEditorProps.activeSetId, assumedSetValues]
  );

  const plan = useMemo(
    () => summarizePlan(exercise.sets, plannedSetValues),
    [exercise.sets, plannedSetValues]
  );
  // Subscribes to the app locale so a language switch re-renders; the
  // formatter reads it, so the (at most five) sets are formatted per render
  // rather than memoized past the switch.
  useAppLocale();
  const lastTime = formatLastTimeSets(
    previousSessionSets,
    weightUnit,
    resolveSnapshotModality(snapshot),
    setEditorProps.distanceUnit
  );
  const muscle = localizeExerciseTaxonomyValue(
    t,
    'muscle',
    snapshot?.primary_muscles?.[0]
  );
  const equipment = localizeExerciseTaxonomyValue(
    t,
    'equipment',
    snapshot?.equipment?.[0]
  );

  const hasMedia = (snapshot?.images ?? []).some(
    (path) => path !== '' && getImageSource(path) !== null
  );
  // The rest card needs the room, so the demo shrinks while it is up.
  const restHere = useActiveWorkoutStore(
    (s) =>
      s.rest.state !== 'ready' &&
      exercise.sets.some((set) => String(set.id) === s.activeSetId)
  );
  const mediaMode = !hasMedia
    ? 'none'
    : mediaExpanded && !restHere
      ? 'expanded'
      : 'min';
  const planText =
    plan != null
      ? t('activeWorkout.focus.planShort', {
          defaultValue: 'Plan {{sets}} × {{reps}}',
          sets: plan.sets,
          reps: plan.reps,
        })
      : null;
  const lastTimeText =
    lastTime.length > 0
      ? t('activeWorkout.focus.lastTimeShort', {
          defaultValue: 'Last time {{sets}}',
          sets: lastTime.join(', '),
        })
      : null;

  const tagClass =
    'h-7 flex-row items-center gap-1.5 rounded-full bg-raised px-2.5';
  const nameText = (
    <Text
      className={`${mediaMode === 'expanded' ? 'flex-1 text-2xl' : 'text-[22px]'} font-bold text-text-primary`}
      accessibilityRole="header"
    >
      {name}
    </Text>
  );
  const swapButton = (
    <Pressable
      onPress={() => onSwap(exercise.id)}
      accessibilityRole="button"
      accessibilityLabel={t('activeWorkout.now.swapLabel', {
        defaultValue: 'Swap {{name}}',
        name,
      })}
      className="h-11 items-center justify-center rounded-full bg-raised px-4 active:opacity-70"
    >
      <Text className="text-[15px] font-semibold text-text-primary">
        {t('activeWorkout.now.swap', { defaultValue: 'Swap' })}
      </Text>
    </Pressable>
  );
  const moreButton = (
    <Pressable
      onPress={() => onPressOverflow(exercise.id)}
      accessibilityRole="button"
      accessibilityLabel={t('activeWorkout.exercise.moreOptions', {
        defaultValue: 'More options for {{name}}',
        name,
      })}
      className="h-11 w-11 items-center justify-center rounded-full bg-raised active:opacity-70"
    >
      <Icon name="ellipsis-horizontal" size={22} color={textPrimary} />
    </Pressable>
  );
  // Beside the thumbnail, or alone for an exercise without pictures: the name,
  // the plan under it, then Swap and the menu.
  const sideTitle = (
    <View className="min-w-0 flex-1 gap-1">
      {nameText}
      {planText != null && (
        <Text
          className="text-[15px] text-text-secondary"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {planText}
        </Text>
      )}
      <View className="mt-1 flex-row items-center gap-2">
        {swapButton}
        {moreButton}
      </View>
    </View>
  );

  const hasTags = muscle !== '' || equipment !== '' || bestDisplay != null;
  const showMetaRow = hasTags || liveBpm != null;
  const restChip = !cardioForm && (
    <RestPeriodChip
      largeTarget
      tile
      value={exercise.sets[0]?.rest_time}
      values={exercise.sets.map((set) => set.rest_time)}
      onPress={() =>
        onPressRestChip(exercise.id, exercise.sets[0]?.rest_time ?? null)
      }
    />
  );
  const contextText =
    mediaMode === 'expanded'
      ? [planText, lastTimeText].filter(Boolean).join(' · ')
      : (lastTimeText ?? '');
  const plateSetId = useMemo(() => {
    const sets = exercise.sets;
    return String(
      (
        sets.find((set) => String(set.id) === setEditorProps.activeSetId) ??
        sets.find((set) => !setEditorProps.completedSetIds[String(set.id)]) ??
        sets[0]
      )?.id ?? ''
    );
  }, [
    exercise.sets,
    setEditorProps.activeSetId,
    setEditorProps.completedSetIds,
  ]);

  if (hold.phase !== 'idle' && hold.entryId === exercise.id) {
    const setIndex = exercise.sets.findIndex(
      (set) => String(set.id) === hold.setId
    );
    const subtitle = [
      equipment,
      t('activeWorkout.focus.hold.setOf', {
        defaultValue: 'Set {{number}}/{{total}}',
        number: setIndex + 1,
        total: exercise.sets.length,
      }),
    ]
      .filter((part) => part !== '')
      .join(' · ');
    return (
      <FocusHoldPanel
        hold={hold}
        name={name}
        subtitle={subtitle}
        heartRate={
          liveBpm != null ? (
            <ExerciseHeartRateChip
              text={String(liveBpm)}
              color={zoneColor ?? heartRateColor}
              valueColor={zoneColor ?? undefined}
              accessibilityLabel={t('activeWorkout.exercise.liveHeartRateFor', {
                defaultValue: 'Current heart rate for {{name}}',
                name,
              })}
            />
          ) : undefined
        }
      />
    );
  }

  return (
    <View className="gap-3">
      <ActiveWorkoutFocusMedia
        images={snapshot?.images ?? []}
        exerciseName={name}
        getImageSource={getImageSource}
        expanded={mediaExpanded && !restHere}
        onToggleExpanded={onToggleMedia}
        onBackToCurrent={onBackToCurrent}
      >
        {sideTitle}
      </ActiveWorkoutFocusMedia>
      {mediaMode === 'expanded' && (
        <View className="flex-row items-center gap-2">
          {nameText}
          {swapButton}
          {moreButton}
        </View>
      )}
      {mediaMode === 'none' && sideTitle}

      {showMetaRow && (
        <View className="flex-row flex-wrap gap-2">
          {muscle !== '' && (
            <View className={tagClass}>
              <Text className="text-[13px] font-semibold text-text-secondary">
                {muscle}
              </Text>
            </View>
          )}
          {equipment !== '' && (
            <View className={tagClass}>
              <Text className="text-[13px] font-semibold text-text-secondary">
                {equipment}
              </Text>
            </View>
          )}
          {bestDisplay != null && (
            <View
              className={tagClass}
              accessibilityLabel={t('activeWorkout.exercise.best', {
                defaultValue: 'Best {{value}}',
                value: bestText,
              })}
            >
              <Text className="text-[13px] font-semibold text-text-secondary">
                {t('activeWorkout.focus.bestLabel', { defaultValue: 'Best' })}
              </Text>
              <Text
                className="text-[13px] font-bold"
                style={{
                  color: bestIsPr ? prColor : accent,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {bestText}
              </Text>
            </View>
          )}
          {liveBpm != null && (
            <ExerciseHeartRateChip
              pill
              text={String(liveBpm)}
              color={zoneColor ?? heartRateColor}
              valueColor={zoneColor ?? undefined}
              accessibilityLabel={t('activeWorkout.exercise.liveHeartRateFor', {
                defaultValue: 'Current heart rate for {{name}}',
                name,
              })}
            />
          )}
        </View>
      )}

      {(contextText !== '' || restChip) && (
        <View className="flex-row items-center justify-between gap-3">
          {mediaMode !== 'expanded' && restChip}
          {contextText !== '' && (
            <Text
              className={`min-w-0 flex-1 text-[15px] text-text-secondary ${mediaMode === 'expanded' ? '' : 'text-right'}`}
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {contextText}
            </Text>
          )}
          {mediaMode === 'expanded' && restChip}
        </View>
      )}

      {showPlates && plateTarget != null && (
        <FocusPlateStrip
          targetWeight={storedWeightInUnit(plateTarget, weightUnit)}
          weightUnit={weightUnit}
          equipment={plateEquipment}
          onOpenCalculator={() => onOpenPlateCalculator(plateSetId)}
        />
      )}

      {(!!exercise.notes || noteEditorEntryId === exercise.id) && (
        <WorkoutNotesField
          value={exercise.notes}
          onCommit={(text) => onCommitExerciseNote(exercise.id, text)}
          label=""
          placeholder={t('activeWorkout.exercise.notePlaceholder', {
            defaultValue: 'Add a note for this exercise…',
          })}
          accessibilityLabel={t('activeWorkout.exercise.notesFor', {
            defaultValue: 'Notes for {{name}}',
            name,
          })}
        />
      )}

      <AdaptiveSuggestionBanner
        adjustment={adaptiveAdjustment}
        declined={adaptiveDeclined}
        suggestVariation={suggestVariation}
        onDecline={() =>
          useActiveWorkoutStore
            .getState()
            .setAdaptiveDeclined(String(exercise.id), true)
        }
        onRestore={() =>
          useActiveWorkoutStore
            .getState()
            .setAdaptiveDeclined(String(exercise.id), false)
        }
        onSeeAlternatives={
          onSeeAlternatives
            ? () => onSeeAlternatives(String(exercise.id))
            : undefined
        }
      />
      {progressionResult && !adaptiveOverridesProgression && (
        <ProgressionHintBanner
          result={progressionResult}
          unitLabel={
            weightUnit === 'kg'
              ? t('workout.kg', { defaultValue: 'kg' })
              : t('workout.lbs', { defaultValue: 'lbs' })
          }
        />
      )}

      <ActiveWorkoutFocusSets
        exercise={exercise}
        weightUnit={weightUnit}
        assumedSetValues={assumedSetValues}
        previousSets={previousSets}
        {...setEditorProps}
      />
    </View>
  );
});

/**
 * Pan rather than a paging list: the page is one tall, keyboard-aware
 * column inside the screen's vertical scroll, and a nested horizontal list
 * would mount neighbouring pages and fight that scroll. The offsets keep
 * vertical scrolling and the steppers working.
 */
function SwipeDetector({
  onSwipe,
  children,
}: {
  onSwipe: (delta: -1 | 1) => void;
  children: React.ReactNode;
}) {
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .failOffsetY([-12, 12])
        .runOnJS(true)
        .onEnd((e) => {
          const delta = swipePageDelta(e.translationX, e.velocityX);
          if (delta !== 0) onSwipe(delta);
        }),
    [onSwipe]
  );
  return <GestureDetector gesture={swipe}>{children}</GestureDetector>;
}

/**
 * The active workout's one-exercise view: a numbered pager, the selected
 * exercise's media / title / context / set editor, and Prev / Next. A
 * horizontal swipe turns the page. The view follows the active set to its
 * exercise (also when the watch completes a set), unless the lifter moved by
 * hand within the last {@link FOCUS_FOLLOW_GRACE_MS} (then a pill offers the
 * way back).
 */
function ActiveWorkoutFocusView({
  session,
  prSetIds,
  activeExerciseId,
  supersetBorders,
  hold,
  getImageSource,
  onPressOverflow,
  onSwap,
  onSeeAlternatives,
  sessionId,
  verifiedSourcePresetId,
  historyScopeSettled,
  showRequest,
  onDismissKeyboard,
  onSelectedIndexChange,
  scrollRef,
  scrollContentStyle,
  keyboardBottomOffset,
  children,
  ...setEditorProps
}: Props) {
  const reducedMotion = useReducedMotion();
  const { exercises } = session;
  const { weightUnit, completedSetIds } = setEditorProps;

  const mediaDefault = useAppPreferencesStore((s) => s.focusMediaDefault);
  const [mediaExpanded, setMediaExpanded] = useState(
    mediaDefault === 'expanded'
  );
  const toggleMedia = useCallback(() => setMediaExpanded((v) => !v), []);

  const [selectedId, setSelectedId] = useState<string | null>(
    activeExerciseId ?? exercises[0]?.id ?? null
  );
  const lastManualAtRef = useRef<number | null>(null);
  // An exercise removed or replaced under the view falls back to the active
  // one (or the first), without waiting for an effect.
  const selectedIndex = Math.max(
    0,
    exercises.findIndex(
      (e) =>
        e.id ===
        (exercises.some((x) => x.id === selectedId)
          ? selectedId
          : activeExerciseId)
    )
  );
  const exercise: FocusExercise | undefined = exercises[selectedIndex];
  useEffect(() => {
    onSelectedIndexChange?.(selectedIndex);
  }, [selectedIndex, onSelectedIndexChange]);

  const slide = useSharedValue(0);
  const fade = useSharedValue(1);
  const pageStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateX: slide.value }],
  }));

  const showExercise = useCallback(
    (id: string, direction: -1 | 1) => {
      // The unmounting row can leave the IME up (Android) with its focus key
      // still set; its typed drafts commit through the unmount flushes.
      onDismissKeyboard();
      setSelectedId(id);
      // Each exercise opens at its photo, not where the last one was scrolled.
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      if (reducedMotion) return;
      slide.set(direction * SLIDE_OFFSET);
      fade.set(0);
      slide.set(withTiming(0, { duration: SLIDE_MS }));
      fade.set(withTiming(1, { duration: SLIDE_MS }));
    },
    [reducedMotion, slide, fade, scrollRef, onDismissKeyboard]
  );

  // Refs keep the gesture and handlers stable across page changes.
  // Synced after commit (declared before the follow effect, which reads it).
  const stateRef = useRef({ exercises, selectedIndex });
  useEffect(() => {
    stateRef.current = { exercises, selectedIndex };
  });

  const goToIndex = useCallback(
    (index: number) => {
      const { exercises: list, selectedIndex: current } = stateRef.current;
      const target = list[index];
      if (target == null || index === current) return;
      lastManualAtRef.current = Date.now();
      fireSelectionHaptic();
      showExercise(target.id, index > current ? 1 : -1);
    },
    [showExercise]
  );
  const goBy = useCallback(
    (delta: -1 | 1) => goToIndex(stateRef.current.selectedIndex + delta),
    [goToIndex]
  );
  const handleSelectChip = useCallback(
    (id: string) =>
      goToIndex(stateRef.current.exercises.findIndex((e) => e.id === id)),
    [goToIndex]
  );

  // Follow the active set to another exercise, unless the lifter moved away
  // by hand moments ago.
  const lastActiveRef = useRef(activeExerciseId);
  useEffect(() => {
    if (activeExerciseId === lastActiveRef.current) return;
    lastActiveRef.current = activeExerciseId;
    if (
      activeExerciseId == null ||
      !shouldFollowActive(lastManualAtRef.current, Date.now())
    ) {
      return;
    }
    const { exercises: list, selectedIndex: current } = stateRef.current;
    const index = list.findIndex((e) => e.id === activeExerciseId);
    if (index >= 0 && index !== current) {
      showExercise(activeExerciseId, index > current ? 1 : -1);
    }
  }, [activeExerciseId, showExercise]);

  // An explicit "show this exercise": ends the manual-move grace so the
  // active-set follow works again.
  const showById = useCallback(
    (id: string) => {
      const { exercises: list, selectedIndex: current } = stateRef.current;
      const index = list.findIndex((e) => e.id === id);
      if (index < 0) return;
      lastManualAtRef.current = null;
      if (index !== current) showExercise(id, index > current ? 1 : -1);
    },
    [showExercise]
  );
  const handleBackToCurrent = useCallback(() => {
    if (activeExerciseId != null) showById(activeExerciseId);
  }, [activeExerciseId, showById]);

  const handledShowSeqRef = useRef(showRequest?.seq ?? 0);
  useEffect(() => {
    if (showRequest == null || showRequest.seq === handledShowSeqRef.current) {
      return;
    }
    handledShowSeqRef.current = showRequest.seq;
    showById(showRequest.id);
  }, [showRequest, showById]);

  // Pan rather than a paging list: the page is one tall, keyboard-aware
  // column inside the screen's vertical scroll, and a nested horizontal list
  // would mount neighbouring pages and fight that scroll. The offsets keep
  // vertical scrolling and the steppers working.
  // Ramp rounding for store-side resolution follows the unit the rows render in.
  const setStoreWeightUnit = useActiveWorkoutStore((s) => s.setWeightUnit);
  useEffect(() => {
    setStoreWeightUnit(weightUnit);
  }, [weightUnit, setStoreWeightUnit]);

  if (exercise == null) return null;
  const awayFromCurrent =
    activeExerciseId != null && activeExerciseId !== exercise.id;

  return (
    <>
      <ActiveWorkoutFocusChips
        exercises={exercises}
        completedSetIds={completedSetIds}
        selectedId={exercise.id}
        supersetBorders={supersetBorders}
        onSelect={handleSelectChip}
      />
      <KeyboardAwareScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="px-4 pt-1"
        contentContainerStyle={scrollContentStyle}
        keyboardShouldPersistTaps="handled"
        bottomOffset={keyboardBottomOffset}
        disableScrollOnKeyboardHide
      >
        {exercises.map((e) => (
          <HistoryCapture
            key={e.id}
            exercise={e}
            sessionId={sessionId}
            verifiedSourcePresetId={verifiedSourcePresetId}
            historyScopeSettled={historyScopeSettled}
          />
        ))}
        <SwipeDetector onSwipe={goBy}>
          <Animated.View style={pageStyle}>
            <FocusExercisePage
              key={exercise.id}
              exercise={exercise}
              prSetIds={prSetIds}
              mediaExpanded={mediaExpanded}
              getImageSource={getImageSource}
              onToggleMedia={toggleMedia}
              onPressOverflow={onPressOverflow}
              onSwap={onSwap}
              onBackToCurrent={
                awayFromCurrent ? handleBackToCurrent : undefined
              }
              onSeeAlternatives={onSeeAlternatives}
              hold={hold}
              sessionId={sessionId}
              verifiedSourcePresetId={verifiedSourcePresetId}
              {...setEditorProps}
            />
          </Animated.View>
        </SwipeDetector>
        {children}
      </KeyboardAwareScrollView>
    </>
  );
}

export default React.memo(ActiveWorkoutFocusView);
