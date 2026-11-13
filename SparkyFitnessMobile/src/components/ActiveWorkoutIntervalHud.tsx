import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  buildGuidedIntervalPhaseCues,
  resolveGuidedSetTarget,
  resolvePhaseAt,
  type GuidedSetTarget,
} from '@workspace/shared';
import { useClockTick } from '../hooks/useClockTick';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { playIntervalCue } from '../services/sounds';
import {
  resetGuidedSpeechSession,
  setGuidedSpeechMuted,
  speakGuided,
  stopGuidedSpeech,
  useGuidedCaption,
  useGuidedSpeechMuted,
} from '../services/speech';
import { fireSelectionHaptic, fireImpactHaptic } from '../services/haptics';
import type { GetImageSource } from '../hooks/useExerciseImageSource';
import { renderGuidedCues } from '../utils/guidedWorkoutSpeech';
import { guidedExerciseImages } from '../hooks/useGuidedWorkout';
import { useImageSlideshow } from '../hooks/useImageSlideshow';
import { resolveSnapshotModality } from '../utils/workoutSession';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import SafeImage from './SafeImage';

interface Props {
  /** Needed only for the guided-mode exercise image. */
  getImageSource?: GetImageSource;
}

interface GuidedIntervalStep {
  exerciseName: string;
  images: string[];
  target: GuidedSetTarget;
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const remS = s % 60;
  return `${String(m).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
}

export default function ActiveWorkoutIntervalHud({ getImageSource }: Props) {
  const { t, i18n } = useTranslation();
  const guidedEnabled = useAppPreferencesStore((s) => s.guidedWorkoutEnabled);

  const workoutFormat = useActiveWorkoutStore((s) => s.workoutFormat);
  // The shared 1s clock drives the phase, its cues and the countdown. A
  // standard workout renders no HUD, so it does not tick.
  const now = useClockTick(workoutFormat !== 'standard');
  const timeCapSeconds = useActiveWorkoutStore((s) => s.timeCapSeconds);
  const intervalPhases = useActiveWorkoutStore((s) => s.intervalPhases);
  const intervalPhaseIndex = useActiveWorkoutStore((s) => s.intervalPhaseIndex);
  const isIntervalPaused = useActiveWorkoutStore((s) => s.isIntervalPaused);
  const intervalPauseStartedAt = useActiveWorkoutStore(
    (s) => s.intervalPauseStartedAt
  );
  const intervalRoundsCompleted = useActiveWorkoutStore(
    (s) => s.intervalRoundsCompleted
  );
  const intervalRepsCompleted = useActiveWorkoutStore(
    (s) => s.intervalRepsCompleted
  );
  const intervalStatus = useActiveWorkoutStore((s) => s.intervalStatus);

  const startedAt = useActiveWorkoutStore((s) => s.startedAt);
  const pauseInterval = useActiveWorkoutStore((s) => s.pauseInterval);
  const resumeInterval = useActiveWorkoutStore((s) => s.resumeInterval);
  const incrementIntervalRound = useActiveWorkoutStore(
    (s) => s.incrementIntervalRound
  );
  const decrementIntervalRound = useActiveWorkoutStore(
    (s) => s.decrementIntervalRound
  );
  const setIntervalReps = useActiveWorkoutStore((s) => s.setIntervalReps);
  const setIntervalStatus = useActiveWorkoutStore((s) => s.setIntervalStatus);
  const updateIntervalPhaseIndex = useActiveWorkoutStore(
    (s) => s.updateIntervalPhaseIndex
  );

  const completeSet = useActiveWorkoutStore((s) => s.completeSet);
  const session = useActiveWorkoutStore((s) => s.session);
  const steps = useActiveWorkoutStore((s) => s.steps);

  // Engine step index → exercise, mirroring how startWorkout built the
  // steps: one per exercise for Tabata/EMOM, one per set otherwise.
  const getGuidedStep = useCallback(
    (stepIndex: number): GuidedIntervalStep | null => {
      if (session == null) return null;
      if (workoutFormat === 'tabata' || workoutFormat === 'emom') {
        const exercise = session.exercises[stepIndex];
        if (!exercise) return null;
        const snapshot = exercise.exercise_snapshot;
        return {
          exerciseName: snapshot?.name ?? '',
          images: guidedExerciseImages(snapshot?.images),
          target: resolveGuidedSetTarget(
            resolveSnapshotModality(snapshot),
            exercise.sets[0] ?? {}
          ),
        };
      }
      const step = steps[stepIndex];
      if (!step) return null;
      const exercise = session.exercises.find((e) => e.id === step.exerciseId);
      const set = exercise?.sets.find((x) => String(x.id) === step.setId);
      return {
        exerciseName: step.exerciseName,
        images: guidedExerciseImages(
          exercise?.exercise_snapshot?.images ??
            (step.exerciseImage ? [step.exerciseImage] : [])
        ),
        target: resolveGuidedSetTarget(
          resolveSnapshotModality(exercise?.exercise_snapshot),
          set ?? {}
        ),
      };
    },
    [session, steps, workoutFormat]
  );

  const effectiveNow =
    isIntervalPaused && intervalPauseStartedAt != null
      ? intervalPauseStartedAt
      : now;

  const elapsedSec = Math.max(
    0,
    Math.floor((effectiveNow - (startedAt ?? effectiveNow)) / 1000)
  );

  const { phase, isFinished, remainingMs } = useMemo(
    () => resolvePhaseAt(intervalPhases, effectiveNow),
    [intervalPhases, effectiveNow]
  );

  const remainingSec = Math.ceil(remainingMs / 1000);

  // For open-ended For Time without cap, display elapsed stopwatch time
  const displayClockSec =
    workoutFormat === 'for_time' && timeCapSeconds == null
      ? elapsedSec
      : remainingSec;

  // Synchronize phase index into store
  useEffect(() => {
    if (phase && phase.phaseIndex !== intervalPhaseIndex) {
      updateIntervalPhaseIndex(phase.phaseIndex);
    }
  }, [phase, intervalPhaseIndex, updateIntervalPhaseIndex]);

  // Audio and Haptic Cue Tracking & Auto Set Completion
  const lastCuePhaseIndexRef = useRef<number | null>(null);
  const lastCountdownSecRef = useRef<number | null>(null);

  useEffect(() => {
    if (isIntervalPaused || !phase) return;

    // Phase transition cue & auto set completion
    if (lastCuePhaseIndexRef.current !== phase.phaseIndex) {
      const prevPhaseIndex = lastCuePhaseIndexRef.current;
      lastCuePhaseIndexRef.current = phase.phaseIndex;
      lastCountdownSecRef.current = null;

      if (prevPhaseIndex != null && prevPhaseIndex < phase.phaseIndex) {
        for (let idx = prevPhaseIndex; idx < phase.phaseIndex; idx++) {
          const missedPhase = intervalPhases[idx];
          if (missedPhase && missedPhase.kind === 'work') {
            const state = useActiveWorkoutStore.getState();
            const curSession = state.session;
            if (curSession) {
              if (workoutFormat === 'tabata' || workoutFormat === 'emom') {
                const exerciseIndex = missedPhase.stepIndex ?? 0;
                const setIndex = missedPhase.round - 1;
                const exercise = curSession.exercises[exerciseIndex];
                if (exercise) {
                  const missingSets = setIndex + 1 - exercise.sets.length;
                  for (let i = 0; i < missingSets; i++) {
                    state.addSetToExercise(exercise.id);
                  }
                  const updatedSession =
                    useActiveWorkoutStore.getState().session;
                  const targetSet =
                    updatedSession?.exercises[exerciseIndex]?.sets[setIndex];
                  if (targetSet) {
                    state.completeSet(String(targetSet.id));
                  }
                }
              } else if (workoutFormat === 'interval') {
                const stepIdx = missedPhase.stepIndex ?? missedPhase.round - 1;
                const targetStep = state.steps[stepIdx];
                if (targetStep) {
                  state.completeSet(String(targetStep.setId));
                }
              }
            }
          }
        }
      }

      if (guidedEnabled) {
        speakGuided(
          renderGuidedCues(
            buildGuidedIntervalPhaseCues(phase, intervalPhases, getGuidedStep),
            t
          ),
          { interrupt: true, language: i18n.language }
        );
      }

      if (phase.kind === 'work') {
        void playIntervalCue('work');
        fireImpactHaptic();
      } else if (phase.kind === 'rest') {
        void playIntervalCue('rest');
        fireSelectionHaptic();
      } else if (phase.kind === 'finished') {
        void playIntervalCue('finish');
        fireImpactHaptic();
      }
      return;
    }

    // 3, 2, 1 Countdown Beeps
    if (
      remainingSec >= 1 &&
      remainingSec <= 3 &&
      lastCountdownSecRef.current !== remainingSec
    ) {
      lastCountdownSecRef.current = remainingSec;
      void playIntervalCue('countdown');
      fireSelectionHaptic();
    }
  }, [
    phase,
    remainingSec,
    isIntervalPaused,
    intervalPhases,
    workoutFormat,
    session,
    steps,
    completeSet,
    guidedEnabled,
    getGuidedStep,
    t,
    i18n.language,
  ]);

  useEffect(() => {
    if (!guidedEnabled) return;
    return () => {
      stopGuidedSpeech();
      resetGuidedSpeechSession();
    };
  }, [guidedEnabled]);
  const guidedMuted = useGuidedSpeechMuted();
  const guidedCaption = useGuidedCaption();
  const [textMuted, textPrimary] = useCSSVariable([
    '--color-text-muted',
    '--color-text-primary',
  ]) as [string, string];

  // Guided mode shows the exercise being worked, or the one coming up.
  let guidedStep: GuidedIntervalStep | null = null;
  let guidedIsNext = false;
  if (guidedEnabled && phase) {
    if (phase.kind === 'work' && phase.stepIndex != null) {
      guidedStep = getGuidedStep(phase.stepIndex);
    } else if (phase.kind === 'rest' || phase.kind === 'countdown') {
      const nextWork = intervalPhases.find(
        (p) => p.phaseIndex > phase.phaseIndex && p.kind === 'work'
      );
      if (nextWork?.stepIndex != null) {
        guidedStep = getGuidedStep(nextWork.stepIndex);
        guidedIsNext = true;
      }
    }
  }
  const guidedImages = guidedStep?.images ?? [];
  const guidedImage = guidedImages[useImageSlideshow(guidedImages.length)];
  const guidedImageSource =
    guidedImage && getImageSource ? getImageSource(guidedImage) : null;

  if (workoutFormat === 'standard') {
    return null;
  }

  const phaseKind = phase?.kind ?? (isFinished ? 'finished' : 'work');

  let pillBg = 'bg-raised';
  let pillText = 'text-text-secondary';
  let pillLabel = t('interval.ready', { defaultValue: 'Ready' });

  if (phaseKind === 'countdown') {
    pillBg = 'bg-amber-500/20 border border-amber-500/40';
    pillText = 'text-amber-500 font-bold';
    pillLabel = t('interval.countdown', { defaultValue: 'Get Ready' });
  } else if (phaseKind === 'work') {
    pillBg = 'bg-emerald-500/20 border border-emerald-500/40';
    pillText = 'text-emerald-500 font-bold';
    pillLabel = t('interval.work', { defaultValue: 'Work' });
  } else if (phaseKind === 'rest') {
    pillBg = 'bg-sky-500/20 border border-sky-500/40';
    pillText = 'text-sky-500 font-bold';
    pillLabel = t('interval.rest', { defaultValue: 'Rest' });
  } else if (phaseKind === 'finished') {
    pillBg = 'bg-accent-primary/20 border border-accent-primary/40';
    pillText = 'text-accent-primary font-bold';
    pillLabel = t('interval.finished', { defaultValue: 'Completed' });
  }

  const formatTitle = workoutFormat.toUpperCase().replace('_', ' ');

  const currentRound = phase?.round ?? 1;
  const totalRounds = phase?.totalRounds;

  const roundLabel = totalRounds
    ? t('interval.roundOfTotal', {
        defaultValue: 'Round {{current}} of {{total}}',
        current: currentRound,
        total: totalRounds,
      })
    : t('interval.round', {
        defaultValue: 'Round {{current}}',
        current: currentRound,
      });

  const durationSec = phase?.durationSec ?? 1;
  const progressPercent = Math.max(
    0,
    Math.min(100, ((durationSec - remainingSec) / durationSec) * 100)
  );

  return (
    <View className="bg-surface rounded-2xl p-4 mb-3 border border-border/40 shadow-sm">
      {/* Top Bar: Format & Round & Pause Button */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          <View className="bg-accent-primary/10 px-2 py-0.5 rounded-md">
            <Text className="text-xs font-bold text-accent-primary tracking-wide">
              {formatTitle}
            </Text>
          </View>
          <Text className="text-sm font-medium text-text-secondary">
            {roundLabel}
          </Text>
        </View>

        <View className="flex-row items-center gap-2">
          {guidedEnabled && (
            <Pressable
              onPress={() => setGuidedSpeechMuted(!guidedMuted)}
              accessibilityRole="button"
              accessibilityLabel={
                guidedMuted
                  ? t('guidedWorkout.card.unmute', {
                      defaultValue: 'Unmute voice',
                    })
                  : t('guidedWorkout.card.mute', { defaultValue: 'Mute voice' })
              }
              hitSlop={8}
              className="w-8 h-8 rounded-full bg-raised items-center justify-center active:opacity-70"
            >
              <Icon
                name={guidedMuted ? 'volume-off' : 'volume-on'}
                size={16}
                color={guidedMuted ? textMuted : textPrimary}
              />
            </Pressable>
          )}
          <Pressable
            className={`px-3 py-1.5 rounded-lg flex-row items-center gap-1.5 ${
              isIntervalPaused ? 'bg-emerald-600' : 'bg-raised'
            }`}
            onPress={() => {
              if (isIntervalPaused) {
                resumeInterval();
              } else {
                // A paused clock must not keep talking.
                stopGuidedSpeech();
                pauseInterval();
              }
            }}
            accessibilityLabel={
              isIntervalPaused
                ? t('interval.resume', { defaultValue: 'Resume' })
                : t('interval.pause', { defaultValue: 'Pause' })
            }
          >
            <Icon
              name={isIntervalPaused ? 'play' : 'pause'}
              size={14}
              color={isIntervalPaused ? '#ffffff' : '#94a3b8'}
            />
            <Text
              className={`text-xs font-semibold ${
                isIntervalPaused ? 'text-white' : 'text-text-secondary'
              }`}
            >
              {isIntervalPaused
                ? t('interval.resume', { defaultValue: 'Resume' })
                : t('interval.pause', { defaultValue: 'Pause' })}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Main HUD: Big Countdown Clock & Phase Pill */}
      <View className="items-center justify-center my-3">
        <View className={`px-3 py-1 rounded-full mb-2 ${pillBg}`}>
          <Text className={`text-xs tracking-wider ${pillText}`}>
            {pillLabel}
          </Text>
        </View>

        <Text className="text-5xl font-black text-text-primary tracking-tight font-mono">
          {formatClock(displayClockSec)}
        </Text>

        {timeCapSeconds != null && (
          <Text className="text-xs text-text-muted mt-1">
            {t('interval.timeCapLabel', {
              defaultValue: 'Cap: {{cap}}',
              cap: formatClock(timeCapSeconds),
            })}
          </Text>
        )}
      </View>

      {/* Progress Bar */}
      <View className="w-full h-1.5 bg-raised rounded-full overflow-hidden mb-3">
        <View
          className="h-full bg-accent-primary rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </View>

      {guidedStep != null && (
        <View testID="interval-guided-step" className="items-center mb-3">
          {guidedImageSource != null ? (
            <View
              className="w-full rounded-xl overflow-hidden bg-raised"
              style={{ aspectRatio: 3 / 2 }}
            >
              <SafeImage
                source={guidedImageSource}
                style={{ width: '100%', height: '100%' }}
                contentFit="contain"
                autoplay
                fallback={null}
              />
              {guidedCaption != null && (
                <View className="absolute left-0 right-0 bottom-0 bg-black/60 px-3 py-2">
                  <Text
                    testID="guided-caption"
                    className="text-sm font-medium text-white text-center"
                    numberOfLines={3}
                  >
                    {guidedCaption}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            guidedCaption != null && (
              <View className="w-full rounded-xl bg-black/70 px-3 py-2">
                <Text
                  testID="guided-caption"
                  className="text-sm font-medium text-white text-center"
                  numberOfLines={3}
                >
                  {guidedCaption}
                </Text>
              </View>
            )
          )}
          {guidedIsNext && (
            <Text className="text-xs font-semibold text-text-muted uppercase tracking-wider mt-2">
              {t('guidedWorkout.card.nextUp', { defaultValue: 'Next up' })}
            </Text>
          )}
          <Text
            className="text-lg font-bold text-text-primary text-center mt-1"
            numberOfLines={2}
          >
            {guidedStep.exerciseName}
          </Text>
        </View>
      )}

      {/* WOD Scoring HUD Controls */}
      <View className="mt-2 pt-3 border-t border-border/30">
        {/* Rx / Scaled Toggle */}
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            {t('interval.wodScoring', { defaultValue: 'WOD Scoring' })}
          </Text>
          <View className="flex-row bg-raised rounded-lg p-0.5 border border-border/30">
            <Pressable
              className={`px-3 py-1 rounded-md ${
                intervalStatus === 'rx' ? 'bg-accent-primary' : ''
              }`}
              onPress={() => setIntervalStatus('rx')}
            >
              <Text
                className={`text-xs font-bold ${
                  intervalStatus === 'rx' ? 'text-white' : 'text-text-muted'
                }`}
              >
                {t('interval.rx', { defaultValue: 'Rx' })}
              </Text>
            </Pressable>
            <Pressable
              className={`px-3 py-1 rounded-md ${
                intervalStatus === 'scaled' ? 'bg-amber-600' : ''
              }`}
              onPress={() => setIntervalStatus('scaled')}
            >
              <Text
                className={`text-xs font-bold ${
                  intervalStatus === 'scaled' ? 'text-white' : 'text-text-muted'
                }`}
              >
                {t('interval.scaled', { defaultValue: 'Scaled' })}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* AMRAP-Only Controls: Large Round Incrementer & Additional Reps */}
        {workoutFormat === 'amrap' && (
          <>
            <View className="flex-row items-center gap-2 mb-2">
              <Pressable
                className="flex-1 bg-accent-primary/15 border border-accent-primary/40 rounded-xl py-3 items-center justify-center active:opacity-70 active:scale-[0.99]"
                onPress={() => {
                  fireSelectionHaptic();
                  incrementIntervalRound();
                }}
              >
                <Text className="text-sm font-bold text-accent-primary">
                  {t('interval.roundPlusOne', {
                    defaultValue: '+1 Round ({{current}})',
                    current: intervalRoundsCompleted,
                  })}
                </Text>
              </Pressable>

              {intervalRoundsCompleted > 0 && (
                <Pressable
                  className="bg-raised border border-border/30 px-3 py-3 rounded-xl items-center justify-center active:opacity-70"
                  onPress={() => {
                    fireSelectionHaptic();
                    decrementIntervalRound();
                  }}
                >
                  <Text className="text-xs font-semibold text-text-muted">
                    -1
                  </Text>
                </Pressable>
              )}
            </View>

            <View className="flex-row items-center justify-between bg-raised/60 px-3 py-2 rounded-xl">
              <Text className="text-xs text-text-secondary font-medium">
                {t('interval.extraReps', { defaultValue: 'Additional Reps' })}:
              </Text>
              <View className="flex-row items-center gap-1.5">
                <Pressable
                  className="w-7 h-7 bg-raised rounded-lg items-center justify-center border border-border/30"
                  onPress={() =>
                    setIntervalReps(Math.max(0, intervalRepsCompleted - 5))
                  }
                >
                  <Text className="text-xs font-bold text-text-muted">-5</Text>
                </Pressable>
                <Pressable
                  className="w-7 h-7 bg-raised rounded-lg items-center justify-center border border-border/30"
                  onPress={() =>
                    setIntervalReps(Math.max(0, intervalRepsCompleted - 1))
                  }
                >
                  <Text className="text-xs font-bold text-text-muted">-1</Text>
                </Pressable>
                <Text className="text-sm font-bold text-text-primary px-2 font-mono">
                  {intervalRepsCompleted}
                </Text>
                <Pressable
                  className="w-7 h-7 bg-raised rounded-lg items-center justify-center border border-border/30"
                  onPress={() => setIntervalReps(intervalRepsCompleted + 1)}
                >
                  <Text className="text-xs font-bold text-text-primary">
                    +1
                  </Text>
                </Pressable>
                <Pressable
                  className="w-7 h-7 bg-raised rounded-lg items-center justify-center border border-border/30"
                  onPress={() => setIntervalReps(intervalRepsCompleted + 5)}
                >
                  <Text className="text-xs font-bold text-text-primary">
                    +5
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
}
