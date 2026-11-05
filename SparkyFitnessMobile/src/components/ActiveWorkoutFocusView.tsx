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
import PlateBarGraphic from './PlateBarGraphic';
import RestPeriodChip from './RestPeriodChip';
import WorkoutNotesField from './WorkoutNotesField';
import type { AnchorRect } from './AnchoredMenu';
import Icon from './Icon';
import ProgressionHintBanner from './ProgressionHintBanner';
import type { SupersetBorder } from './ActiveWorkoutRail';
import type { SetInputField, SetRowAccessoryHandle } from './SetRowChrome';
import { useExerciseStats } from '../hooks/useExerciseStats';
import type { GetImageSource } from '../hooks/useExerciseImageSource';
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
  plateTargetKg,
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
  sessionId,
  verifiedSourcePresetId,
  weightUnit,
  ...setEditorProps
}: PageProps) {
  const { t } = useTranslation();
  const [textMuted, textSecondary, prColor, accent] = useCSSVariable([
    '--color-text-muted',
    '--color-text-secondary',
    '--color-pr',
    '--color-accent-primary',
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

  const plateEquipment = snapshot?.equipment ?? null;
  const showPlates = usesBarbell(plateEquipment);
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

  const pillClass =
    'flex-row items-center rounded-full bg-raised px-2.5 py-1 gap-1';
  const titleBlock = (
    <View className={mediaExpanded ? 'mt-3' : 'flex-1'}>
      <View className="flex-row items-start gap-2">
        <Text
          className="flex-1 text-2xl font-bold text-text-primary"
          accessibilityRole="header"
        >
          {name}
        </Text>
        <Pressable
          onPress={() => onSwap(exercise.id)}
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.now.swapLabel', {
            defaultValue: 'Swap {{name}}',
            name,
          })}
          className="min-h-11 flex-row items-center gap-1.5 bg-raised rounded-full px-3 active:opacity-70"
        >
          <Icon name="swap-horizontal" size={15} color={accent} />
          <Text className="text-sm font-semibold text-accent-primary">
            {t('activeWorkout.now.swap', { defaultValue: 'Swap' })}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onPressOverflow(exercise.id)}
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.exercise.moreOptions', {
            defaultValue: 'More options for {{name}}',
            name,
          })}
          className="h-11 w-11 items-center justify-center active:opacity-70"
        >
          <Icon name="ellipsis-horizontal" size={20} color={textMuted} />
        </Pressable>
      </View>
      {(muscle !== '' || equipment !== '' || bestDisplay != null) && (
        <View className="mt-1 flex-row flex-wrap gap-2">
          {muscle !== '' && (
            <View className={pillClass}>
              <Text className="text-xs text-text-secondary">{muscle}</Text>
            </View>
          )}
          {equipment !== '' && (
            <View className={pillClass}>
              <Text className="text-xs text-text-secondary">{equipment}</Text>
            </View>
          )}
          {bestDisplay != null && (
            <View
              className={pillClass}
              accessibilityLabel={t('activeWorkout.exercise.best', {
                defaultValue: 'Best {{value}}',
                value: bestText,
              })}
            >
              <Icon
                name="trophy-outline"
                size={12}
                color={bestIsPr ? prColor : textMuted}
              />
              <Text
                className="text-xs"
                style={{
                  color: bestIsPr ? prColor : textSecondary,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {bestText}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );

  return (
    <View className="gap-3">
      <ActiveWorkoutFocusMedia
        images={snapshot?.images ?? []}
        exerciseName={name}
        getImageSource={getImageSource}
        expanded={mediaExpanded}
        onToggleExpanded={onToggleMedia}
        onBackToCurrent={onBackToCurrent}
      >
        {titleBlock}
      </ActiveWorkoutFocusMedia>
      {mediaExpanded && titleBlock}

      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 px-1">
        <RestPeriodChip
          largeTarget
          value={exercise.sets[0]?.rest_time}
          values={exercise.sets.map((set) => set.rest_time)}
          onPress={() =>
            onPressRestChip(exercise.id, exercise.sets[0]?.rest_time ?? null)
          }
        />
        {showPlates && plateTarget != null && (
          <PlateBarGraphic
            targetWeight={storedWeightInUnit(plateTarget, weightUnit)}
            weightUnit={weightUnit}
            equipment={plateEquipment}
          />
        )}
      </View>

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

      {(plan != null || lastTime.length > 0) && (
        <View className="gap-0.5">
          {plan != null && (
            <Text className="text-sm text-text-secondary">
              {t('activeWorkout.focus.plan', {
                defaultValue: 'Plan: {{sets}} × {{reps}}',
                sets: plan.sets,
                reps: plan.reps,
              })}
            </Text>
          )}
          {lastTime.length > 0 && (
            <Text
              className="text-sm text-text-secondary"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {t('activeWorkout.focus.lastTime', {
                defaultValue: 'Last time: {{sets}}',
                sets: lastTime.join(', '),
              })}
            </Text>
          )}
        </View>
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
        {...setEditorProps}
      />
    </View>
  );
});

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
  getImageSource,
  onPressOverflow,
  onSwap,
  onSeeAlternatives,
  sessionId,
  verifiedSourcePresetId,
  historyScopeSettled,
  showRequest,
  onDismissKeyboard,
  scrollRef,
  scrollContentStyle,
  keyboardBottomOffset,
  children,
  ...setEditorProps
}: Props) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const accentPrimary = String(useCSSVariable('--color-accent-primary'));
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
      slide.value = direction * SLIDE_OFFSET;
      fade.value = 0;
      slide.value = withTiming(0, { duration: SLIDE_MS });
      fade.value = withTiming(1, { duration: SLIDE_MS });
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
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .failOffsetY([-12, 12])
        .runOnJS(true)
        .onEnd((e) => {
          const delta = swipePageDelta(e.translationX, e.velocityX);
          if (delta !== 0) goBy(delta);
        }),
    [goBy]
  );

  // Ramp rounding for store-side resolution follows the unit the rows render in.
  const setStoreWeightUnit = useActiveWorkoutStore((s) => s.setWeightUnit);
  useEffect(() => {
    setStoreWeightUnit(weightUnit);
  }, [weightUnit, setStoreWeightUnit]);

  if (exercise == null) return null;
  const previous = exercises[selectedIndex - 1];
  const next = exercises[selectedIndex + 1];
  const nameOf = (e: FocusExercise) =>
    e.exercise_snapshot?.name ??
    t('workout.exercise', { defaultValue: 'Exercise' });
  const awayFromCurrent =
    activeExerciseId != null && activeExerciseId !== exercise.id;

  const navButton = (target: FocusExercise | undefined, direction: -1 | 1) => {
    const label =
      direction < 0
        ? t('activeWorkout.focus.previous', { defaultValue: 'Previous' })
        : t('activeWorkout.focus.next', { defaultValue: 'Next' });
    return (
      <Pressable
        onPress={() => goBy(direction)}
        disabled={target == null}
        accessibilityRole="button"
        accessibilityState={{ disabled: target == null }}
        accessibilityLabel={
          target == null
            ? label
            : direction < 0
              ? t('activeWorkout.focus.previousLabel', {
                  defaultValue: 'Previous exercise, {{name}}',
                  name: nameOf(target),
                })
              : t('activeWorkout.focus.nextLabel', {
                  defaultValue: 'Next exercise, {{name}}',
                  name: nameOf(target),
                })
        }
        className={`min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-raised px-3 active:opacity-70 ${
          target == null ? 'opacity-40' : ''
        }`}
      >
        {direction < 0 && (
          <Icon name="chevron-back" size={16} color={accentPrimary} />
        )}
        <Text
          className="text-sm font-semibold"
          style={{ color: accentPrimary }}
        >
          {label}
        </Text>
        {direction > 0 && (
          <Icon name="chevron-forward" size={16} color={accentPrimary} />
        )}
      </Pressable>
    );
  };

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
        contentContainerClassName="px-3 pt-2"
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
        <GestureDetector gesture={swipe}>
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
              sessionId={sessionId}
              verifiedSourcePresetId={verifiedSourcePresetId}
              {...setEditorProps}
            />
            <View className="mt-3 flex-row gap-3">
              {navButton(previous, -1)}
              {navButton(next, 1)}
            </View>
          </Animated.View>
        </GestureDetector>
        {children}
      </KeyboardAwareScrollView>
    </>
  );
}

export default React.memo(ActiveWorkoutFocusView);
