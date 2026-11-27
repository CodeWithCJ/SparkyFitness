import { LOG_LOCKED_OPACITY, useFocusLogLocked } from './focusLogLock';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { PresetSessionResponse } from '@workspace/shared';
import FocusHoldPanel from './FocusHoldPanel';
import FocusHoldReadyCard from './FocusHoldReadyCard';
import Icon from './Icon';
import SafeImage from './SafeImage';
import { useExerciseStats } from '../hooks/useExerciseStats';
import type { GetImageSource } from '../hooks/useExerciseImageSource';
import { timedTargetForSet, type FocusHold } from '../hooks/useFocusHold';
import { useLiveAssumedSetValues } from '../hooks/useLiveExerciseCoaching';
import type {
  ActiveSetPatch,
  CompletedSetMap,
} from '../stores/activeWorkoutStore';
import { DEFAULT_WARMUP_PLATE_ROUNDING } from '@workspace/shared';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { withAlpha } from '../utils/colors';
import { resolveWarmupOptions } from '../utils/warmupSettings';
import { formatFocusWeight } from '../utils/focusView';
import { storedWeightInUnit, weightToKg } from '../utils/unitConversions';
import {
  alignPreviousSets,
  CATEGORY_ICON_MAP,
  effectiveSetDurationSec,
  formatDurationSeconds,
  isWeightDurationModality,
  quantizeSetWeightKg,
  rendersCardioEffortForm,
  resolveSnapshotModality,
} from '../utils/workoutSession';

type FocusExercise = PresetSessionResponse['exercises'][number];
type FocusSet = FocusExercise['sets'][number];

/** Modalities the round card's weight and reps steppers can edit. */
export function supersetPageSupports(exercise: FocusExercise): boolean {
  const modality = resolveSnapshotModality(exercise.exercise_snapshot);
  return (
    modality === 'weight_reps' ||
    modality === 'reps_only' ||
    modality === 'bodyweight_reps'
  );
}

/** A timed hold (plank): its round card carries the hold timer, not steppers. */
export function isTimedHoldMember(exercise: FocusExercise): boolean {
  const snapshot = exercise.exercise_snapshot;
  const modality = resolveSnapshotModality(snapshot);
  return (
    (modality === 'duration' || isWeightDurationModality(modality)) &&
    !rendersCardioEffortForm(snapshot, exercise.sets.length)
  );
}

/** Members a superset's one page can run: weight and reps sets, or timed holds. */
export function supersetRunSupports(exercise: FocusExercise): boolean {
  return supersetPageSupports(exercise) || isTimedHoldMember(exercise);
}

/** Whether the exercise's sets carry a weight to edit. */
function carriesWeight(exercise: FocusExercise): boolean {
  const modality = resolveSnapshotModality(exercise.exercise_snapshot);
  return modality !== 'reps_only' && modality !== 'duration';
}

export interface SupersetStep {
  /** The member's position in the run, 0 for A1. */
  memberIndex: number;
  /** 0-based round. */
  round: number;
  exercise: FocusExercise;
  set: FocusSet;
}

/** The run's sets in the order they are done: round by round, A1 then A2. */
export function buildSupersetSteps(members: FocusExercise[]): SupersetStep[] {
  const rounds = Math.max(0, ...members.map((m) => m.sets.length));
  const steps: SupersetStep[] = [];
  for (let round = 0; round < rounds; round++) {
    members.forEach((exercise, memberIndex) => {
      const set = exercise.sets[round];
      if (set != null) steps.push({ memberIndex, round, exercise, set });
    });
  }
  return steps;
}

/** The set the lifter is on: the cursor's when it is in the run, else the first not done. */
export function currentSupersetStep(
  steps: SupersetStep[],
  activeSetId: string | null,
  completedSetIds: CompletedSetMap
): SupersetStep | null {
  return (
    steps.find((s) => String(s.set.id) === activeSetId) ??
    steps.find((s) => !completedSetIds[String(s.set.id)]) ??
    null
  );
}

/** A member's values for the card and rows: last time's sets and the assumed (grey) values. */
function useMemberValues(
  exercise: FocusExercise,
  sessionId: string | null,
  verifiedSourcePresetId: number | undefined,
  weightUnit: 'kg' | 'lbs'
) {
  const { data: stats } = useExerciseStats(
    exercise.exercise_id,
    sessionId ?? undefined,
    verifiedSourcePresetId
  );
  const previousSessionSets = (stats?.recentSessions ?? [])[0]?.sets;
  const previousSets = useMemo(
    () => alignPreviousSets(exercise.sets, previousSessionSets),
    [exercise.sets, previousSessionSets]
  );
  const assumed = useLiveAssumedSetValues(
    exercise,
    previousSessionSets,
    weightUnit,
    true
  );
  return { previousSets, assumed };
}

/** Seconds a hold's -/+ tap moves its length. */
const HOLD_STEP_SEC = 5;

interface MemberProps {
  step: SupersetStep;
  badge: string;
  sessionId: string | null;
  verifiedSourcePresetId: number | undefined;
  weightUnit: 'kg' | 'lbs';
}

function formatLoad(
  weightKg: number | null,
  reps: number | null,
  weightUnit: 'kg' | 'lbs',
  showWeight: boolean
): string {
  const repsText = reps != null ? String(reps) : '–';
  if (!showWeight) return repsText;
  const weightText =
    weightKg != null
      ? formatFocusWeight(storedWeightInUnit(weightKg, weightUnit), weightUnit)
      : '–';
  return `${weightText} ${weightUnit} × ${repsText}`;
}

const SupersetStepRow = React.memo(function SupersetStepRow({
  step,
  badge,
  badgeColor,
  done,
  expanded,
  onToggle,
  onCommitField,
  sessionId,
  verifiedSourcePresetId,
  weightUnit,
}: MemberProps & {
  badgeColor: string;
  done: boolean;
  expanded: boolean;
  onToggle: (setId: string) => void;
  onCommitField: (setId: string, patch: ActiveSetPatch) => void;
}) {
  const { t } = useTranslation();
  const { assumed } = useMemberValues(
    step.exercise,
    sessionId,
    verifiedSourcePresetId,
    weightUnit
  );
  const index = step.exercise.sets.findIndex((s) => s.id === step.set.id);
  const showWeight = carriesWeight(step.exercise);
  const timed = isTimedHoldMember(step.exercise);
  const seconds = effectiveSetDurationSec(
    step.set,
    resolveSnapshotModality(step.exercise.exercise_snapshot)
  );
  const name =
    step.exercise.exercise_snapshot?.name ??
    t('workout.exercise', { defaultValue: 'Exercise' });
  const setId = String(step.set.id);
  const content = (
    <View
      className="flex-row items-center gap-3 py-1.5"
      style={{ opacity: done && !expanded ? 0.5 : 1 }}
    >
      <Text
        className="w-4 text-center text-[15px] font-bold text-text-secondary"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {step.round + 1}
      </Text>
      <View
        className="h-7 min-w-[40px] items-center justify-center rounded-full px-2"
        style={{ backgroundColor: badgeColor }}
      >
        <Text className="text-[13px] font-extrabold text-black">{badge}</Text>
      </View>
      <Text
        numberOfLines={1}
        className="min-w-0 flex-1 text-[17px] font-bold text-text-primary"
      >
        {name}
      </Text>
      {done ? (
        <Icon name="checkmark" size={18} color={badgeColor} />
      ) : (
        <Text
          className="text-[15px] text-text-secondary"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {timed
            ? seconds != null
              ? formatDurationSeconds(seconds)
              : '–'
            : formatLoad(
                step.set.weight ?? assumed?.[index]?.weight ?? null,
                step.set.reps ?? assumed?.[index]?.reps ?? null,
                weightUnit,
                showWeight
              )}
        </Text>
      )}
    </View>
  );
  return (
    <View testID={`focus-superset-step-${step.set.id}`}>
      {done ? (
        <Pressable
          onPress={() => onToggle(setId)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          className="active:opacity-70"
        >
          {content}
        </Pressable>
      ) : (
        content
      )}
      {done && expanded && (
        <View className="gap-2 pb-2">
          <StepEditor
            step={step}
            sessionId={sessionId}
            verifiedSourcePresetId={verifiedSourcePresetId}
            weightUnit={weightUnit}
            onCommitField={onCommitField}
          />
        </View>
      )}
    </View>
  );
});

function RoundStepper({
  label,
  text,
  onDecrement,
  onIncrement,
}: {
  label: string;
  text: string;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  const [textPrimary] = useCSSVariable(['--color-text-primary']) as [string];
  return (
    <View className="min-w-0 flex-1 items-center gap-1">
      <Text className="text-[12px] font-bold uppercase text-text-secondary">
        {label}
      </Text>
      <View className="h-14 w-full flex-row items-center justify-between rounded-2xl bg-raised px-1.5">
        <Pressable
          onPress={onDecrement}
          accessibilityRole="button"
          accessibilityLabel={`${label} −`}
          className="h-11 w-11 items-center justify-center rounded-full bg-surface active:opacity-70"
        >
          <Icon name="remove" size={20} color={textPrimary} weight="bold" />
        </Pressable>
        <Text
          className="text-[26px] font-bold text-text-primary"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {text}
        </Text>
        <Pressable
          onPress={onIncrement}
          accessibilityRole="button"
          accessibilityLabel={`${label} +`}
          className="h-11 w-11 items-center justify-center rounded-full bg-surface active:opacity-70"
        >
          <Icon name="add" size={20} color={textPrimary} weight="bold" />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The weight and reps steppers of one set, committing through `onCommitField`;
 * shared by the current round card and an expanded finished row.
 */
function StepEditor({
  step,
  sessionId,
  verifiedSourcePresetId,
  weightUnit,
  onCommitField,
  omitDuration = false,
}: Omit<MemberProps, 'badge'> & {
  onCommitField: (setId: string, patch: ActiveSetPatch) => void;
  /** Leave the seconds stepper out (the hold card edits the length). */
  omitDuration?: boolean;
}) {
  const { t } = useTranslation();
  const { exercise, set } = step;
  // The +/- step is the lifter's own warm-up rounding for this equipment.
  const warmupMethod = useAppPreferencesStore((s) => s.warmupMethod);
  const warmupPlateRounding = useAppPreferencesStore(
    (s) => s.warmupPlateRounding
  );
  const warmupDumbbellRounding = useAppPreferencesStore(
    (s) => s.warmupDumbbellRounding
  );
  const weightStep =
    resolveWarmupOptions(
      { warmupMethod, warmupPlateRounding, warmupDumbbellRounding },
      weightUnit,
      exercise.exercise_snapshot?.equipment
    ).increment ?? DEFAULT_WARMUP_PLATE_ROUNDING[weightUnit];
  const { assumed } = useMemberValues(
    exercise,
    sessionId,
    verifiedSourcePresetId,
    weightUnit
  );
  const setIndex = exercise.sets.findIndex((s) => s.id === set.id);
  const showWeight = carriesWeight(exercise);
  const timed = isTimedHoldMember(exercise);
  const seconds =
    effectiveSetDurationSec(
      set,
      resolveSnapshotModality(exercise.exercise_snapshot)
    ) ?? 0;
  const weightKg = set.weight ?? assumed?.[setIndex]?.weight ?? null;
  const reps = set.reps ?? assumed?.[setIndex]?.reps ?? null;
  const weightDisplay =
    weightKg != null ? storedWeightInUnit(weightKg, weightUnit) : 0;
  const commitWeight = (nextDisplay: number) =>
    onCommitField(String(set.id), {
      weight: quantizeSetWeightKg(
        weightToKg(Math.max(0, nextDisplay), weightUnit)
      ),
    });
  const commitReps = (nextReps: number) =>
    onCommitField(String(set.id), { reps: Math.max(0, nextReps) });
  const commitSeconds = (next: number) =>
    onCommitField(String(set.id), { duration: Math.max(HOLD_STEP_SEC, next) });
  return (
    <View className="flex-row gap-3">
      {showWeight && (
        <RoundStepper
          label={
            weightUnit === 'kg'
              ? t('workout.kg', { defaultValue: 'kg' })
              : t('workout.lbs', { defaultValue: 'lbs' })
          }
          text={formatFocusWeight(weightDisplay, weightUnit)}
          onDecrement={() => commitWeight(weightDisplay - weightStep)}
          onIncrement={() => commitWeight(weightDisplay + weightStep)}
        />
      )}
      {timed ? (
        !omitDuration && (
          <RoundStepper
            label={t('activeWorkout.focus.superset.seconds', {
              defaultValue: 'Sec',
            })}
            text={String(seconds)}
            onDecrement={() => commitSeconds(seconds - HOLD_STEP_SEC)}
            onIncrement={() => commitSeconds(seconds + HOLD_STEP_SEC)}
          />
        )
      ) : (
        <RoundStepper
          label={t('activeWorkout.focus.preview.reps', {
            defaultValue: 'Reps',
          })}
          text={String(reps ?? 0)}
          onDecrement={() => commitReps((reps ?? 0) - 1)}
          onIncrement={() => commitReps((reps ?? 0) + 1)}
        />
      )}
    </View>
  );
}

interface Props {
  members: FocusExercise[];
  /** A for the first superset of the workout, B for the next. */
  letter: string;
  color: string;
  completedSetIds: CompletedSetMap;
  activeSetId: string | null;
  sessionId: string | null;
  verifiedSourcePresetId: number | undefined;
  weightUnit: 'kg' | 'lbs';
  /** The focus view's timed hold, which a timed member's round card runs. */
  hold: FocusHold;
  getImageSource: GetImageSource;
  onCompleteSet: (setId: string) => void;
  onCommitField: (setId: string, patch: ActiveSetPatch) => void;
  onAddSet: (entryId: string) => void;
  onPressOverflow: (entryId: string) => void;
}

/**
 * One page for a whole superset: every set in its real order (round by round,
 * A1 then A2) with the round card, the set to do now (weight and reps and a
 * Log set button that hands over to the partner), in place among them.
 * Finished rows are compact and tap open to edit or un-log. Logging walks
 * A1, A2, A1, A2.
 */
function FocusSupersetPage({
  members,
  letter,
  color,
  completedSetIds,
  activeSetId,
  sessionId,
  verifiedSourcePresetId,
  weightUnit,
  hold,
  getImageSource,
  onCompleteSet,
  onCommitField,
  onAddSet,
  onPressOverflow,
}: Props) {
  const { t } = useTranslation();
  const logLocked = useFocusLogLocked();
  const plannedSetValues = useActiveWorkoutStore((st) => st.plannedSetValues);
  const [textSecondary, accent, accentOn] = useCSSVariable([
    '--color-text-secondary',
    '--color-accent-primary',
    '--color-accent-text',
  ]) as [string, string, string | undefined];
  const steps = useMemo(() => buildSupersetSteps(members), [members]);
  const current = currentSupersetStep(steps, activeSetId, completedSetIds);
  const rounds = Math.max(0, ...members.map((m) => m.sets.length));
  const badgeOf = (memberIndex: number) => `${letter}${memberIndex + 1}`;
  const order = members
    .map((_, i) => badgeOf(i))
    .join(
      ` ${t('activeWorkout.focus.superset.then', { defaultValue: 'then' })} `
    );

  const currentExercise = current?.exercise ?? members[0];
  // One finished row is open for editing at a time.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleExpanded = useCallback(
    (setId: string) => setExpandedId((prev) => (prev === setId ? null : setId)),
    []
  );
  const { previousSets } = useMemberValues(
    currentExercise,
    sessionId,
    verifiedSourcePresetId,
    weightUnit
  );
  const setIndex =
    current != null
      ? current.exercise.sets.findIndex((s) => s.id === current.set.id)
      : -1;
  const previous = setIndex >= 0 ? previousSets[setIndex] : undefined;
  const showWeight = carriesWeight(currentExercise);

  const next =
    current != null
      ? steps.find(
          (s) =>
            !completedSetIds[String(s.set.id)] &&
            steps.indexOf(s) > steps.indexOf(current)
        )
      : undefined;
  const logLabel =
    next != null && next.exercise.id !== current?.exercise.id
      ? t('activeWorkout.focus.superset.logGoTo', {
          defaultValue: 'Log set · go to {{badge}}',
          badge: badgeOf(next.memberIndex),
        })
      : t('activeWorkout.focus.superset.log', { defaultValue: 'Log set' });

  const image = currentExercise.exercise_snapshot?.images?.[0] ?? null;
  const fallbackIcon =
    (currentExercise.exercise_snapshot?.category &&
      CATEGORY_ICON_MAP[currentExercise.exercise_snapshot.category]) ||
    'exercise-weights';
  const currentName =
    currentExercise.exercise_snapshot?.name ??
    t('workout.exercise', { defaultValue: 'Exercise' });

  // One more round for every member; when the members have unequal sets, the
  // short ones are topped up to the longest instead.
  const uneven = members.some((m) => m.sets.length < rounds);
  const handleAddRound = () => {
    for (const member of members) {
      const missing = uneven ? rounds - member.sets.length : 1;
      for (let i = 0; i < missing; i++) onAddSet(member.id);
    }
  };

  // A timed member's round: the hold timer in place of steppers and Log set.
  const renderHold = (s: SupersetStep) => {
    const setId = String(s.set.id);
    const setLabel = t('activeWorkout.focus.hold.setNumber', {
      defaultValue: 'Set {{number}}',
      number: s.round + 1,
    });
    if (hold.setId === setId && hold.phase !== 'idle') {
      return <FocusHoldPanel compact hold={hold} setLabel={setLabel} />;
    }
    const target =
      hold.setId === setId
        ? hold.targetSec
        : (timedTargetForSet(s.exercise, setId, plannedSetValues)?.targetSec ??
          null);
    return (
      <FocusHoldReadyCard
        compact
        setLabel={setLabel}
        targetSec={target}
        onChangeSeconds={(seconds) =>
          onCommitField(setId, { duration: seconds })
        }
        onStart={() => hold.start(hold.setId === setId ? undefined : setId)}
      />
    );
  };

  return (
    <View testID="focus-superset-page" className="gap-3">
      <View className="flex-row items-center">
        <View className="min-w-0 flex-1">
          <Text
            accessibilityRole="header"
            className="text-[22px] font-extrabold text-text-primary"
          >
            {t('activeWorkout.focus.superset.title', {
              defaultValue: 'Superset {{letter}}',
              letter,
            })}
          </Text>
          <Text className="text-[14px] text-text-secondary">
            {t('activeWorkout.focus.superset.summary', {
              count: rounds,
              order,
              last: badgeOf(members.length - 1),
              defaultValue: '{{count}} rounds · {{order}}, rest after {{last}}',
              defaultValue_one:
                '{{count}} round · {{order}}, rest after {{last}}',
              defaultValue_other:
                '{{count}} rounds · {{order}}, rest after {{last}}',
            })}
          </Text>
        </View>
        <Pressable
          onPress={() => onPressOverflow(currentExercise.id)}
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.exercise.moreOptions', {
            defaultValue: 'More options for {{name}}',
            name: currentName,
          })}
          className="h-11 w-11 items-center justify-center rounded-full bg-raised active:opacity-70"
        >
          <Icon name="ellipsis-horizontal" size={22} color={textSecondary} />
        </Pressable>
      </View>

      <View>
        {steps.map((s) =>
          s === current ? (
            <View
              key={s.set.id}
              testID="focus-superset-round-card"
              className="my-1.5 gap-3 rounded-3xl p-3"
              style={{ backgroundColor: withAlpha(accent, 0.14) }}
            >
              <View className="flex-row items-center gap-2.5">
                <View
                  className="h-10 w-10 items-center justify-center overflow-hidden rounded-[10px] bg-raised"
                  accessible={false}
                >
                  <SafeImage
                    source={image ? getImageSource(image) : null}
                    style={{ width: 40, height: 40 }}
                    fallback={
                      <Icon
                        name={fallbackIcon}
                        size={20}
                        color={textSecondary}
                      />
                    }
                  />
                </View>
                <View className="min-w-0 flex-1">
                  <Text
                    className="text-[13px] font-bold uppercase"
                    style={{ color: accent, letterSpacing: 0.8 }}
                  >
                    {t('activeWorkout.focus.superset.round', {
                      defaultValue: 'Round {{round}} · {{badge}}',
                      round: s.round + 1,
                      badge: badgeOf(s.memberIndex),
                    })}
                  </Text>
                  <Text
                    numberOfLines={2}
                    className="text-[19px] font-bold text-text-primary"
                  >
                    {currentName}
                  </Text>
                </View>
                {previous?.reps != null && (
                  <Text
                    className="text-[13px] text-text-secondary"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {t('activeWorkout.focus.superset.prev', {
                      defaultValue: 'Prev {{value}}',
                      value:
                        previous.weight != null && showWeight
                          ? `${formatFocusWeight(storedWeightInUnit(previous.weight, weightUnit), weightUnit)}×${previous.reps}`
                          : String(previous.reps),
                    })}
                  </Text>
                )}
              </View>
              {isTimedHoldMember(s.exercise) ? (
                <>
                  {carriesWeight(s.exercise) && (
                    <StepEditor
                      step={s}
                      sessionId={sessionId}
                      verifiedSourcePresetId={verifiedSourcePresetId}
                      weightUnit={weightUnit}
                      onCommitField={onCommitField}
                      omitDuration
                    />
                  )}
                  {renderHold(s)}
                </>
              ) : (
                <>
                  <StepEditor
                    step={s}
                    sessionId={sessionId}
                    verifiedSourcePresetId={verifiedSourcePresetId}
                    weightUnit={weightUnit}
                    onCommitField={onCommitField}
                  />
                  <Pressable
                    testID="focus-superset-log"
                    onPress={() => onCompleteSet(String(s.set.id))}
                    disabled={logLocked}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: logLocked }}
                    className="min-h-14 items-center justify-center rounded-full active:opacity-80"
                    style={{
                      backgroundColor: accent,
                      opacity: logLocked ? LOG_LOCKED_OPACITY : 1,
                    }}
                  >
                    <Text
                      className="text-[19px] font-bold"
                      style={{ color: accentOn ?? '#ffffff' }}
                    >
                      {logLabel}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : (
            <SupersetStepRow
              key={s.set.id}
              step={s}
              badge={badgeOf(s.memberIndex)}
              badgeColor={color}
              done={completedSetIds[String(s.set.id)] != null}
              expanded={expandedId === String(s.set.id)}
              onToggle={toggleExpanded}
              onCommitField={onCommitField}
              sessionId={sessionId}
              verifiedSourcePresetId={verifiedSourcePresetId}
              weightUnit={weightUnit}
            />
          )
        )}
      </View>

      <Pressable
        testID="focus-superset-add-round"
        onPress={handleAddRound}
        accessibilityRole="button"
        className="h-11 flex-row items-center justify-center gap-2 rounded-full bg-raised active:opacity-70"
      >
        <Icon name="add" size={18} color={textSecondary} weight="bold" />
        <Text className="text-[15px] font-semibold text-text-secondary">
          {uneven
            ? t('activeWorkout.focus.superset.matchRounds', {
                defaultValue_one: 'Match sets to {{count}} round',
                defaultValue_other: 'Match sets to {{count}} rounds',
                defaultValue: 'Match sets to {{count}} rounds',
                count: rounds,
              })
            : t('activeWorkout.focus.superset.addRound', {
                defaultValue: 'Add round',
              })}
        </Text>
      </Pressable>

      {current == null && (
        <View
          testID="focus-superset-done"
          className="items-center rounded-3xl bg-raised p-4"
        >
          <Text className="text-[17px] font-bold text-text-primary">
            {t('activeWorkout.focus.superset.done', {
              defaultValue: 'Superset done',
            })}
          </Text>
        </View>
      )}
    </View>
  );
}

export default React.memo(FocusSupersetPage);
