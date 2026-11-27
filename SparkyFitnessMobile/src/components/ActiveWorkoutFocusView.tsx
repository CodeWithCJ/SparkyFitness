import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewInstance,
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
import {
  FocusScrollTargetContext,
  focusScrollOffset,
} from './focusScrollTarget';
import AdaptiveSuggestionBanner from './AdaptiveSuggestionBanner';
import ExerciseHeartRateChip from './ExerciseHeartRateChip';
import FocusHoldPanel from './FocusHoldPanel';
import FocusHoldReadyCard from './FocusHoldReadyCard';
import { FocusLogLockContext, useFocusLogLocked } from './focusLogLock';
import FocusAwayFrame from './FocusAwayFrame';
import FocusExercisePreview from './FocusExercisePreview';
import FocusNowBanner, { type FocusNowBannerInfo } from './FocusNowBanner';
import FocusSupersetPage, { supersetPageSupports } from './FocusSupersetPage';
import FocusPlateStrip from './FocusPlateStrip';
import WorkoutNotesField from './WorkoutNotesField';
import type { AnchorRect } from './AnchoredMenu';
import Icon from './Icon';
import ProgressionHintBanner from './ProgressionHintBanner';
import type { SupersetBorder } from './ActiveWorkoutRail';
import type { SetInputField, SetRowAccessoryHandle } from './SetRowChrome';
import { useExerciseStats } from '../hooks/useExerciseStats';
import { useHeartRateZoneColor } from '../hooks/useHeartRateZoneColor';
import type { GetImageSource } from '../hooks/useExerciseImageSource';
import { timedTargetForSet, type FocusHold } from '../hooks/useFocusHold';
import {
  useCaptureLiveHistory,
  useExerciseBest,
  useLiveAdaptive,
  useLiveAssumedSetValues,
  useLiveProgression,
} from '../hooks/useLiveExerciseCoaching';
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
} from '../utils/workoutSession';
import { getSupersetRuns } from '../utils/workoutSupersets';
import { storedWeightInUnit } from '../utils/unitConversions';
import { shouldFollowActive, swipePageDelta } from '../utils/focusView';

type FocusExercise = PresetSessionResponse['exercises'][number];

const SLIDE_OFFSET = 32;
const SLIDE_MS = 180;
// Space kept above the current-set card when it is scrolled into view.
const SCROLL_TARGET_MARGIN = 8;

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
  onOpenPlateCalculator: (setId: string, weightKg?: number | null) => void;
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
  /**
   * The set the lifter is on. The banner shows it while another exercise than
   * the one holding it is on show, and a tap goes back to that exercise.
   */
  nowBanner?: FocusNowBannerInfo;
  getImageSource: GetImageSource;
  onPressOverflow: (entryId: string) => void;
  /** Adds an exercise; the strip ends with an Add tile. */
  onAddExercise?: () => void;
  /** The quick change for a busy machine, as on the Now card. */
  onSwap: (entryId: string) => void;
  /** Opens the rest picker for an exercise's sets. */
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
  /**
   * Rendered at the top of the scroll, above the exercise page and kept
   * mounted across page changes: the interval HUD, which returns nothing for
   * a standard workout.
   */
  topSlot?: React.ReactNode;
  /** Guided mode's card, under `topSlot`; left out when guided mode is off. */
  guidedCard?: React.ReactNode;
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

interface ScrollViewport {
  height: number;
  bottomInset: number;
}

interface PageProps extends SetEditorProps {
  sessionId: string | null;
  verifiedSourcePresetId: number | undefined;
  exercise: FocusExercise;
  prSetIds: PrSetMap;
  mediaExpanded: boolean;
  scrollRef: React.RefObject<KeyboardAwareScrollViewRef | null>;
  /** The scroll view's height and the bottom strip the footer covers. */
  viewportRef: React.RefObject<ScrollViewport>;
  /** The bottom padding the footer / rest overlay needs; re-aims the scroll once it is measured. */
  footerInset: number;
  getImageSource: GetImageSource;
  onToggleMedia: () => void;
  onPressOverflow: (entryId: string) => void;
  onSwap: (entryId: string) => void;
  noteEditorEntryId: string | null;
  onCommitExerciseNote: (entryId: string, text: string) => void;
  onSeeAlternatives?: (entryId: string) => void;
  hold: FocusHold;
  /** The guided card is showing its own photo above this page. */
  guided?: boolean;
  /** Drawn between the media / title block and the sets (the interval HUD). */
  belowMedia?: React.ReactNode;
}

/** One exercise: media + title, plan / last-time context, coaching, sets. */
const FocusExercisePage = React.memo(function FocusExercisePage({
  exercise,
  prSetIds,
  mediaExpanded: mediaPreferenceExpanded,
  scrollRef,
  viewportRef,
  footerInset,
  getImageSource,
  onToggleMedia: onTogglePreference,
  onPressOverflow,
  onSwap,
  noteEditorEntryId,
  onCommitExerciseNote,
  onSeeAlternatives,
  hold,
  guided = false,
  belowMedia,
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
  const showPrevious = useAppPreferencesStore((s) => s.focusShowPrevious);
  const previousSets = useMemo(
    () =>
      showPrevious
        ? alignPreviousSets(exercise.sets, previousSessionSets)
        : undefined,
    [showPrevious, exercise.sets, previousSessionSets]
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
  // Once a set is logged (or a hold started) the lifter knows the movement, so
  // the demo shrinks and the current set takes the screen. The stored
  // minimize / enlarge preference only governs exercises not yet started; a
  // hand enlarge on a started one lasts until the page is left (the page is
  // keyed by exercise) and is never saved.
  const started =
    exercise.sets.some(
      (set) => !!setEditorProps.completedSetIds[String(set.id)]
    ) ||
    (hold.phase !== 'idle' && hold.entryId === exercise.id);
  const [handEnlarged, setHandEnlarged] = useState(false);
  // Undoing back to not-started drops a hand enlarge (adjusted during render).
  const [wasStarted, setWasStarted] = useState(started);
  if (wasStarted !== started) {
    setWasStarted(started);
    if (!started) setHandEnlarged(false);
  }
  const restHere = useActiveWorkoutStore(
    (s) =>
      s.rest.state !== 'ready' &&
      exercise.sets.some((set) => String(set.id) === s.activeSetId)
  );
  // The rest card needs the room, so a hand-enlarged demo shrinks once when
  // the rest starts; the lifter can still enlarge it again during the rest
  // (adjusted during render).
  const [wasRest, setWasRest] = useState(restHere);
  if (wasRest !== restHere) {
    setWasRest(restHere);
    if (restHere) setHandEnlarged(false);
  }
  const mediaExpanded = started ? handEnlarged : mediaPreferenceExpanded;
  const onToggleMedia = useCallback(
    () => (started ? setHandEnlarged((v) => !v) : onTogglePreference()),
    [started, onTogglePreference]
  );

  // The guided card carries the photo, so the page does not draw it again.
  const pageImages = guided ? [] : (snapshot?.images ?? []);
  const hasMedia = pageImages.some(
    (path) => path !== '' && getImageSource(path) !== null
  );
  // Bring the current set (clear of the rest overlay while resting) into view when the
  // exercise becomes started, on landing on a started one, and whenever the
  // current set moves on. Measured against the page, which starts at the top
  // of the scroll content.
  const pageRef = useRef<ViewInstance>(null);
  const scrollTargetRef = useRef<ViewInstance>(null);
  const scrollHeaderRef = useRef<ViewInstance>(null);
  // Where the title and thumbnail block ends, from its own layout.
  const titleBottomRef = useRef(0);
  const scrollTargets = useMemo(
    () => ({ card: scrollTargetRef, header: scrollHeaderRef }),
    []
  );
  const reducedMotion = useReducedMotion();
  const activeHere = exercise.sets.some(
    (set) => String(set.id) === setEditorProps.activeSetId
  );
  // Guided mode keeps the scroll where it is (the card sits at the top).
  const scrollKey =
    guided || !started
      ? null
      : restHere
        ? `rest:${setEditorProps.activeSetId}`
        : activeHere
          ? setEditorProps.activeSetId
          : null;
  // The rest overlay is measured after the rest starts; aim again once it is
  // known so the current set ends up above it (the first aim had no inset).
  const restInset = restHere ? footerInset : 0;
  useEffect(() => {
    if (scrollKey == null) return;
    const frame = requestAnimationFrame(() => {
      const target = scrollTargetRef.current;
      const page = pageRef.current;
      if (target == null || page == null) return;
      const scrollTo = (
        cardTop: number,
        cardHeight: number,
        headerTop: number | null
      ) =>
        scrollRef.current?.scrollTo({
          y: focusScrollOffset({
            cardTop,
            cardHeight,
            headerTop,
            titleBottom: titleBottomRef.current,
            viewportHeight: viewportRef.current.height,
            bottomInset: viewportRef.current.bottomInset,
            margin: SCROLL_TARGET_MARGIN,
          }),
          animated: !reducedMotion,
        });
      target.measureLayout(
        page,
        (_x, cardTop, _w, cardHeight) => {
          const header = scrollHeaderRef.current;
          if (header == null) return scrollTo(cardTop, cardHeight, null);
          header.measureLayout(
            page,
            (_hx, headerTop) => scrollTo(cardTop, cardHeight, headerTop),
            () => scrollTo(cardTop, cardHeight, null)
          );
        },
        () => {}
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollKey, restInset, reducedMotion, scrollRef, viewportRef]);

  const mediaMode = !hasMedia ? 'none' : mediaExpanded ? 'expanded' : 'min';

  const tagClass =
    'h-6 flex-row items-center gap-1.5 rounded-full bg-raised px-2.5';
  const nameText = (
    <Text
      className="text-lg font-bold leading-6 text-text-primary"
      numberOfLines={1}
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
      hitSlop={5}
      className="h-9 w-9 items-center justify-center rounded-full bg-raised active:opacity-70"
    >
      <Icon name="swap-horizontal" size={18} color={textPrimary} />
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
      hitSlop={5}
      className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
    >
      <Icon name="ellipsis-horizontal" size={18} color={textPrimary} />
    </Pressable>
  );
  const bestChip =
    bestDisplay != null ? (
      <View
        className={`${tagClass} self-start`}
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
    ) : null;
  // Under the large picture, beside the thumbnail, or alone for an exercise
  // without pictures: the name with the Best chip under it, left-aligned, and
  // Swap and the menu on the right.
  const sideTitle = (
    <View className="min-w-0 flex-row items-center gap-2">
      <View className="min-w-0 flex-1 gap-0.5">
        {nameText}
        {bestChip}
      </View>
      <View className="shrink-0 flex-row items-center gap-2">
        {swapButton}
        {moreButton}
      </View>
    </View>
  );

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

  // The strip shows, and the calculator opens on, the same set: the one the
  // card is editing (typed weight, else the assumed one), never another set.
  const plateTarget = useMemo(
    () =>
      showPlates
        ? plateTargetKg(exercise.sets, plateSetId, assumedSetValues)
        : null,
    [showPlates, exercise.sets, plateSetId, assumedSetValues]
  );

  // A timed hold draws its card in the table where the held set sits; the
  // header, the plates and the other sets stay around it.
  const holdHere = hold.phase !== 'idle' && hold.entryId === exercise.id;
  const holdCard = holdHere ? (
    <FocusHoldPanel
      hold={hold}
      setLabel={t('activeWorkout.focus.hold.setNumber', {
        defaultValue: 'Set {{number}}',
        number:
          exercise.sets.findIndex((set) => String(set.id) === hold.setId) + 1,
      })}
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
  ) : undefined;
  // Before the hold starts, its current-set card carries Start hold. On a
  // timed exercise that is not the current one (opened from the strip) the
  // card sits on its first unlogged set and starts that set's hold.
  const currentHoldSetId =
    hold.phase === 'idle' && hold.setId != null && hold.entryId === exercise.id
      ? hold.setId
      : null;
  const otherHold = useMemo(() => {
    if (hold.phase !== 'idle' || currentHoldSetId != null) return null;
    if (hold.entryId === exercise.id || setEditorProps.activeSetId == null) {
      return null;
    }
    const first = exercise.sets.find(
      (set) => !setEditorProps.completedSetIds[String(set.id)]
    );
    if (first == null) return null;
    if (
      exercise.sets.some((set) => String(set.id) === setEditorProps.activeSetId)
    ) {
      return null;
    }
    return timedTargetForSet(exercise, String(first.id), plannedSetValues);
  }, [
    hold.phase,
    hold.entryId,
    currentHoldSetId,
    exercise,
    setEditorProps.activeSetId,
    setEditorProps.completedSetIds,
    plannedSetValues,
  ]);
  const readySetId = currentHoldSetId ?? otherHold?.setId ?? null;
  const restLocked = useFocusLogLocked();
  // The rest lock guards logging on the exercise the cursor is on, where the
  // rest card says why. A hold started from another exercise's page is a
  // deliberate out-of-order start, so its button stays live there.
  const holdReadyCard =
    readySetId != null ? (
      <FocusLogLockContext.Provider
        value={restLocked && currentHoldSetId != null}
      >
        <FocusHoldReadyCard
          setLabel={t('activeWorkout.focus.hold.setNumber', {
            defaultValue: 'Set {{number}}',
            number:
              exercise.sets.findIndex((set) => String(set.id) === readySetId) +
              1,
          })}
          targetSec={
            currentHoldSetId != null
              ? hold.targetSec
              : (otherHold?.targetSec ?? null)
          }
          onChangeSeconds={(seconds) => {
            setEditorProps.onCommitField(readySetId, { duration: seconds });
          }}
          onStart={() =>
            hold.start(currentHoldSetId != null ? undefined : readySetId)
          }
        />
      </FocusLogLockContext.Provider>
    ) : undefined;

  return (
    <FocusScrollTargetContext.Provider value={scrollTargets}>
      <View ref={pageRef} collapsable={false} className="gap-3">
        <View
          testID="focus-title-block"
          collapsable={false}
          className="gap-3"
          onLayout={(e) => {
            const { y, height } = e.nativeEvent.layout;
            titleBottomRef.current = y + height;
          }}
        >
          <ActiveWorkoutFocusMedia
            images={pageImages}
            exerciseName={name}
            getImageSource={getImageSource}
            expanded={mediaExpanded}
            onToggleExpanded={onToggleMedia}
          >
            {sideTitle}
          </ActiveWorkoutFocusMedia>
          {mediaMode === 'expanded' && sideTitle}
          {mediaMode === 'none' && sideTitle}
        </View>

        {belowMedia}

        {showPlates && plateTarget != null && (
          <FocusPlateStrip
            targetWeight={storedWeightInUnit(plateTarget, weightUnit)}
            weightUnit={weightUnit}
            equipment={plateEquipment}
            onOpenCalculator={() =>
              onOpenPlateCalculator(plateSetId, plateTarget)
            }
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

        <ActiveWorkoutFocusSets
          exercise={exercise}
          weightUnit={weightUnit}
          assumedSetValues={assumedSetValues}
          previousSets={previousSets}
          holdSetId={holdHere ? hold.setId : readySetId}
          holdCard={holdCard}
          holdReadyCard={holdReadyCard}
          {...setEditorProps}
        />

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
      </View>
    </FocusScrollTargetContext.Provider>
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
/** The shared not-the-current-exercise look; the current page is not framed. */
function AwayFrame({
  away,
  children,
}: {
  away: boolean;
  children: React.ReactNode;
}) {
  return away ? (
    <FocusAwayFrame className="gap-2">{children}</FocusAwayFrame>
  ) : (
    <>{children}</>
  );
}

function ActiveWorkoutFocusView({
  session,
  prSetIds,
  activeExerciseId,
  supersetBorders,
  hold,
  nowBanner,
  getImageSource,
  onPressOverflow,
  onAddExercise,
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
  topSlot,
  guidedCard,
  children,
  ...setEditorProps
}: Props) {
  const accentColor = String(useCSSVariable('--color-accent-primary'));
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
  const supersetRuns = useMemo(() => getSupersetRuns(exercises), [exercises]);
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
  const shownId = exercises[selectedIndex]?.id ?? null;
  const shownDoneCount =
    exercises[selectedIndex]?.sets.filter(
      (set) => completedSetIds[String(set.id)] != null
    ).length ?? 0;
  const stateRef = useRef({
    exercises,
    selectedIndex,
    shownId,
    shownDoneCount,
  });
  useEffect(() => {
    stateRef.current = { exercises, selectedIndex, shownId, shownDoneCount };
  });
  // The shown exercise's logged-set count as of the previous commit, to tell a
  // log made here from a cursor move that came from elsewhere.
  const loggedRef = useRef({ id: shownId, count: shownDoneCount });

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
    const {
      exercises: list,
      selectedIndex: current,
      shownId: shown,
      shownDoneCount: doneCount,
    } = stateRef.current;
    // A set logged in the shown exercise moves the cursor on (a superset
    // partner, the next exercise): the lifter is working here, so the page
    // goes with the cursor even right after they picked it by hand.
    const loggedHere =
      loggedRef.current.id === shown && doneCount > loggedRef.current.count;
    if (
      activeExerciseId == null ||
      (!loggedHere && !shouldFollowActive(lastManualAtRef.current, Date.now()))
    ) {
      return;
    }
    const index = list.findIndex((e) => e.id === activeExerciseId);
    if (index >= 0 && index !== current) {
      showExercise(activeExerciseId, index > current ? 1 : -1);
    }
  }, [activeExerciseId, showExercise]);
  useEffect(() => {
    loggedRef.current = {
      id: stateRef.current.shownId,
      count: stateRef.current.shownDoneCount,
    };
  });

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
  // "Do it now" on a preview: moves the exercise in front, then opens its page.
  const handleDoNow = useCallback(
    (id: string) => {
      useActiveWorkoutStore.getState().doExerciseNow(id);
      showById(id);
    },
    [showById]
  );
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

  // The visible part of the scroll view: its height less what the footer
  // covers (the content's bottom padding), so a set can be scrolled above it.
  const viewportRef = useRef<ScrollViewport>({ height: 0, bottomInset: 0 });
  const footerInset =
    Number(StyleSheet.flatten(scrollContentStyle)?.paddingBottom) || 0;
  useLayoutEffect(() => {
    viewportRef.current.bottomInset = footerInset;
  }, [footerInset]);
  const handleScrollLayout = useCallback((e: LayoutChangeEvent) => {
    viewportRef.current.height = e.nativeEvent.layout.height;
  }, []);

  if (exercise == null) return null;
  // A superset member shows its run's one page.
  const runIndex = supersetRuns.findIndex((r) =>
    r.entryIds.includes(exercise.id)
  );
  const run = runIndex >= 0 ? supersetRuns[runIndex] : null;
  const runMembers =
    run != null
      ? run.entryIds.flatMap((id) => exercises.find((e) => e.id === id) ?? [])
      : [];
  const supersetEligible =
    run != null && runMembers.every(supersetPageSupports);
  // While a hold is running or counting down, every other exercise (a
  // superset page included) is a read-only preview, so nothing can be logged
  // off the held set.
  const holdAway =
    hold.phase !== 'idle' &&
    hold.entryId !== exercise.id &&
    !(
      supersetEligible &&
      run != null &&
      hold.entryId != null &&
      run.entryIds.includes(hold.entryId)
    );
  const showSupersetPage = supersetEligible && !holdAway;
  const viewingCurrent =
    activeExerciseId == null ||
    (showSupersetPage && run != null
      ? run.entryIds.includes(activeExerciseId)
      : activeExerciseId === exercise.id);
  const awayFromCurrent = !viewingCurrent;
  // Another exercise with nothing logged is a dashed preview, not a full page.
  const showPreview =
    !showSupersetPage &&
    (holdAway ||
      (awayFromCurrent &&
        setEditorProps.activeSetId != null &&
        exercise.sets.every((set) => completedSetIds[String(set.id)] == null) &&
        supersetPageSupports(exercise) &&
        !rendersCardioEffortForm(
          exercise.exercise_snapshot,
          exercise.sets.length
        )));
  const pageIsExercise = !showSupersetPage && !showPreview;

  return (
    <>
      <ActiveWorkoutFocusChips
        exercises={exercises}
        completedSetIds={completedSetIds}
        selectedId={exercise.id}
        activeId={activeExerciseId}
        supersetBorders={supersetBorders}
        getImageSource={getImageSource}
        onSelect={handleSelectChip}
        onAdd={onAddExercise}
      />
      {nowBanner != null && awayFromCurrent && hold.phase === 'idle' && (
        <FocusNowBanner {...nowBanner} onBack={handleBackToCurrent} />
      )}
      <KeyboardAwareScrollView
        ref={scrollRef}
        className="flex-1"
        onLayout={handleScrollLayout}
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
        {/* On the exercise page the slot sits under its media instead. */}
        {pageIsExercise ? null : topSlot}
        {/* Stays mounted (it runs the guided session) but only shows on the
            current exercise's page. */}
        {guidedCard != null && (
          <View className={viewingCurrent ? undefined : 'hidden'}>
            {guidedCard}
          </View>
        )}
        <SwipeDetector onSwipe={goBy}>
          <Animated.View style={pageStyle}>
            {showSupersetPage && run != null ? (
              <AwayFrame away={awayFromCurrent}>
                <FocusSupersetPage
                  key={`superset-${run.groupId}`}
                  members={runMembers}
                  letter={String.fromCharCode(65 + runIndex)}
                  color={supersetBorders.get(exercise.id)?.color ?? accentColor}
                  completedSetIds={completedSetIds}
                  activeSetId={setEditorProps.activeSetId}
                  sessionId={sessionId}
                  verifiedSourcePresetId={verifiedSourcePresetId}
                  weightUnit={weightUnit}
                  getImageSource={getImageSource}
                  onCompleteSet={setEditorProps.onCompleteSet}
                  onCommitField={setEditorProps.onCommitField}
                  onPressOverflow={onPressOverflow}
                />
              </AwayFrame>
            ) : showPreview ? (
              <FocusExercisePreview
                key={exercise.id}
                exercise={exercise}
                prSetIds={prSetIds}
                completedSetIds={completedSetIds}
                sessionId={sessionId}
                verifiedSourcePresetId={verifiedSourcePresetId}
                weightUnit={weightUnit}
                getImageSource={getImageSource}
                onAddSet={setEditorProps.onAddSet}
                onDoNow={handleDoNow}
                doNowDisabled={hold.phase !== 'idle'}
                onSwap={onSwap}
                onPressOverflow={onPressOverflow}
              />
            ) : (
              <AwayFrame away={awayFromCurrent}>
                <FocusExercisePage
                  key={exercise.id}
                  exercise={exercise}
                  prSetIds={prSetIds}
                  mediaExpanded={mediaExpanded}
                  scrollRef={scrollRef}
                  viewportRef={viewportRef}
                  footerInset={footerInset}
                  getImageSource={getImageSource}
                  onToggleMedia={toggleMedia}
                  onPressOverflow={onPressOverflow}
                  onSwap={onSwap}
                  onSeeAlternatives={onSeeAlternatives}
                  hold={hold}
                  guided={guidedCard != null && viewingCurrent}
                  belowMedia={topSlot}
                  sessionId={sessionId}
                  verifiedSourcePresetId={verifiedSourcePresetId}
                  {...setEditorProps}
                />
              </AwayFrame>
            )}
          </Animated.View>
        </SwipeDetector>
        {children}
      </KeyboardAwareScrollView>
    </>
  );
}

export default React.memo(ActiveWorkoutFocusView);
