import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Play,
  Pause,
  Plus,
  Minus,
  Flame,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  buildGuidedIntervalPhaseCues,
  buildIntervalPhases,
  resolveGuidedSetTarget,
  resolvePhaseAt,
  type GuidedSetTarget,
  type WorkoutFormat,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { playIntervalCue } from '@/utils/workoutSounds';
import { resolveExerciseImageSrc } from '@/utils/exercises';
import { useGuidedWorkoutPreferences } from '@/utils/guidedWorkoutPreferences';
import { useImageSlideshow } from '@/hooks/useImageSlideshow';
import { guidedExerciseImages } from './useWorkoutPlaybackGuided';
import {
  renderGuidedCues,
  resetGuidedSpeechSession,
  setGuidedSpeechMuted,
  speakGuided,
  stopGuidedSpeech,
  useGuidedCaption,
  useGuidedSpeechMuted,
} from '@/utils/guidedWorkoutSpeech';

import type { WorkoutPlaybackExerciseDraft } from '@/utils/workoutPlayback';

interface WorkoutPlaybackIntervalHudProps {
  workoutFormat: WorkoutFormat;
  timeCapSeconds?: number | null;
  startedAtIso: string;
  roundsCompleted: number;
  repsCompleted: number;
  status: 'rx' | 'scaled';
  exercises?: WorkoutPlaybackExerciseDraft[];
  onAddRound: () => void;
  onDecrementRound: () => void;
  onSetReps: (reps: number) => void;
  onSetStatus: (status: 'rx' | 'scaled') => void;
  onCompletePhaseWork?: (phase: {
    kind: string;
    stepIndex: number | null;
    round: number;
  }) => void;
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

export default function WorkoutPlaybackIntervalHud({
  workoutFormat,
  timeCapSeconds,
  startedAtIso,
  roundsCompleted,
  repsCompleted,
  status,
  exercises,
  onAddRound,
  onDecrementRound,
  onSetReps,
  onSetStatus,
  onCompletePhaseWork,
}: WorkoutPlaybackIntervalHudProps) {
  const { t, i18n } = useTranslation();
  const { enabled: guidedEnabled } = useGuidedWorkoutPreferences();
  const [now, setNow] = useState<number>(() => Date.now());
  const [isPaused, setIsPaused] = useState(false);
  const [pauseStartedAt, setPauseStartedAt] = useState<number | null>(null);

  const handleTogglePause = () => {
    if (isPaused) {
      setIsPaused(false);
      setPauseStartedAt(null);
    } else {
      // A paused clock must not keep talking.
      stopGuidedSpeech();
      setIsPaused(true);
      setPauseStartedAt(Date.now());
    }
  };

  // Keep a local 200ms ticker for smooth timer updates
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const startedAtMs = useMemo(() => {
    const parsed = Date.parse(startedAtIso);
    return Number.isNaN(parsed) ? 0 : parsed;
  }, [startedAtIso]);

  // Map exercises to interval engine steps (1 step per exercise in each round for Tabata/EMOM; all steps for custom interval)
  const steps = useMemo(() => {
    if (!exercises || exercises.length === 0) return [];
    if (workoutFormat === 'tabata' || workoutFormat === 'emom') {
      return exercises.map((ex) => {
        const firstSet = ex.sets[0];
        return {
          exerciseName: ex.exercise_name,
          durationSec:
            firstSet?.duration ?? (workoutFormat === 'tabata' ? 20 : null),
          restSec:
            firstSet?.rest_time ?? (workoutFormat === 'tabata' ? 10 : null),
          reps: firstSet?.reps ?? null,
        };
      });
    }
    return exercises.flatMap((ex) =>
      ex.sets.map((s) => ({
        exerciseName: ex.exercise_name,
        durationSec: s.duration ?? null,
        restSec: s.rest_time ?? null,
        reps: s.reps ?? null,
      }))
    );
  }, [exercises, workoutFormat]);

  // Engine step index → exercise, mirroring `steps` above: one per exercise
  // for Tabata/EMOM, one per set otherwise.
  const getGuidedStep = useCallback(
    (stepIndex: number): GuidedIntervalStep | null => {
      if (!exercises) return null;
      let exerciseIndex = stepIndex;
      let setIndex = 0;
      if (workoutFormat !== 'tabata' && workoutFormat !== 'emom') {
        let remaining = stepIndex;
        exerciseIndex = exercises.findIndex((ex) => {
          if (remaining < ex.sets.length) return true;
          remaining -= ex.sets.length;
          return false;
        });
        setIndex = remaining;
      }
      const exercise = exercises[exerciseIndex];
      if (!exercise) return null;
      return {
        exerciseName: exercise.exercise_name,
        images: guidedExerciseImages(exercise),
        target: resolveGuidedSetTarget(
          exercise.modality ?? 'weight_reps',
          exercise.sets[setIndex] ?? {}
        ),
      };
    },
    [exercises, workoutFormat]
  );

  // Generate interval phases
  const intervalPhases = useMemo(() => {
    return buildIntervalPhases(
      {
        format: workoutFormat,
        timeCapSeconds: timeCapSeconds ?? undefined,
        countdownSeconds: 0,
        steps,
      },
      startedAtMs
    );
  }, [workoutFormat, startedAtMs, timeCapSeconds, steps]);

  const effectiveNow =
    isPaused && pauseStartedAt != null ? pauseStartedAt : now;

  const elapsedSec = Math.max(
    0,
    Math.floor((effectiveNow - startedAtMs) / 1000)
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

  // Audio Cue Tracking & Auto Set Completion
  const lastCuePhaseIndexRef = useRef<number | null>(null);
  const lastCountdownSecRef = useRef<number | null>(null);

  useEffect(() => {
    if (isPaused || !phase) return;

    // Phase transition cue
    if (lastCuePhaseIndexRef.current !== phase.phaseIndex) {
      const prevPhaseIndex = lastCuePhaseIndexRef.current;
      lastCuePhaseIndexRef.current = phase.phaseIndex;
      lastCountdownSecRef.current = null;

      if (prevPhaseIndex != null && prevPhaseIndex < phase.phaseIndex) {
        for (let idx = prevPhaseIndex; idx < phase.phaseIndex; idx++) {
          const missedPhase = intervalPhases[idx];
          if (missedPhase && missedPhase.kind === 'work') {
            onCompletePhaseWork?.(missedPhase);
          }
        }
      }

      if (guidedEnabled) {
        speakGuided(
          renderGuidedCues(
            buildGuidedIntervalPhaseCues(phase, intervalPhases, getGuidedStep),
            t
          ),
          { interrupt: true, lang: i18n.language }
        );
      }

      if (phase.kind === 'work') {
        playIntervalCue('work');
      } else if (phase.kind === 'rest') {
        playIntervalCue('rest');
      } else if (phase.kind === 'finished') {
        playIntervalCue('finish');
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
      playIntervalCue('countdown');
    }
  }, [
    phase,
    remainingSec,
    isPaused,
    intervalPhases,
    onCompletePhaseWork,
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

  if (workoutFormat === 'standard') {
    return null;
  }

  const phaseKind = phase?.kind ?? (isFinished ? 'finished' : 'work');

  let pillClasses =
    'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700';
  let pillLabel = t('interval.ready', 'Ready');

  if (phaseKind === 'countdown') {
    pillClasses =
      'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800';
    pillLabel = t('interval.countdown', 'Get Ready');
  } else if (phaseKind === 'work') {
    pillClasses =
      'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800';
    pillLabel = t('interval.work', 'Work');
  } else if (phaseKind === 'rest') {
    pillClasses =
      'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400 border-sky-300 dark:border-sky-800';
    pillLabel = t('interval.rest', 'Rest');
  } else if (phaseKind === 'finished') {
    pillClasses =
      'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-800';
    pillLabel = t('interval.finished', 'Time Cap Reached');
  }

  const formatTitle = workoutFormat.toUpperCase().replace('_', ' ');

  const currentRound = phase?.round ?? 1;
  const totalRounds = phase?.totalRounds;
  const roundLabel = totalRounds
    ? t('interval.roundOfTotal', 'Round {{current}} of {{total}}', {
        current: currentRound,
        total: totalRounds,
      })
    : t('interval.round', 'Round {{current}}', {
        current: currentRound,
      });

  const durationSec = phase?.durationSec ?? 1;
  const progressPercent = Math.max(
    0,
    Math.min(100, ((durationSec - remainingSec) / durationSec) * 100)
  );

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 mb-6 border border-gray-200 dark:border-gray-800 shadow-sm transition-all">
      {/* Top Bar: Format Header, Round badge, and Pause/Resume */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 tracking-wider">
            {formatTitle}
          </span>
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {roundLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {guidedEnabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setGuidedSpeechMuted(!guidedMuted)}
              aria-label={
                guidedMuted
                  ? t('guidedWorkout.card.unmute', 'Unmute voice')
                  : t('guidedWorkout.card.mute', 'Mute voice')
              }
              aria-pressed={guidedMuted}
              className="h-8 w-8 p-0 rounded-lg"
            >
              {guidedMuted ? (
                <VolumeX className="w-3.5 h-3.5 text-gray-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </Button>
          )}
          <Button
            variant={isPaused ? 'default' : 'outline'}
            size="sm"
            onClick={handleTogglePause}
            className={`gap-1.5 font-semibold text-xs h-8 px-3 rounded-lg ${
              isPaused
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            {isPaused ? (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                {t('interval.resume', 'Resume')}
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                {t('interval.pause', 'Pause')}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main HUD: Countdown Clock & Phase Pill */}
      <div className="flex flex-col items-center justify-center my-3 text-center">
        <div
          className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold border mb-2 ${pillClasses}`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>{pillLabel}</span>
        </div>

        <div className="text-5xl sm:text-6xl font-black text-gray-900 dark:text-gray-50 font-mono tracking-tight my-1">
          {formatClock(displayClockSec)}
        </div>

        {timeCapSeconds != null && (
          <div className="text-xs font-medium text-gray-400 dark:text-gray-500 mt-1">
            {t('interval.timeCapLabel', 'Cap: {{cap}}', {
              cap: formatClock(timeCapSeconds),
            })}
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mb-5">
        <div
          className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-300 rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {guidedStep && (
        <div
          data-testid="interval-guided-step"
          className="flex flex-col items-center text-center mb-5"
        >
          {guidedImage ? (
            <div className="relative w-full aspect-[3/2] max-h-[60vh] overflow-hidden rounded-xl bg-gray-50 dark:bg-gray-800">
              <img
                src={resolveExerciseImageSrc(guidedImage)}
                alt={guidedStep.exerciseName}
                className="h-full w-full object-contain"
              />
              {guidedCaption && (
                <div className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-2">
                  <p
                    data-testid="guided-caption"
                    className="text-sm sm:text-base font-medium text-white"
                  >
                    {guidedCaption}
                  </p>
                </div>
              )}
            </div>
          ) : (
            guidedCaption && (
              <div className="w-full rounded-xl bg-black/70 px-3 py-2">
                <p
                  data-testid="guided-caption"
                  className="text-sm sm:text-base font-medium text-white"
                >
                  {guidedCaption}
                </p>
              </div>
            )
          )}
          {guidedIsNext && (
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-2">
              {t('guidedWorkout.card.nextUp', 'Next up')}
            </p>
          )}
          <p className="text-lg font-bold mt-1">{guidedStep.exerciseName}</p>
        </div>
      )}

      {/* WOD Scoring Controls */}
      <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-3">
        {/* Rx / Scaled Toggle */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {t('interval.wodScoring', 'WOD Scoring')}
          </span>
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 border border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => onSetStatus('rx')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                status === 'rx'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
              }`}
            >
              {t('interval.rx', 'Rx')}
            </button>
            <button
              type="button"
              onClick={() => onSetStatus('scaled')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                status === 'scaled'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
              }`}
            >
              {t('interval.scaled', 'Scaled')}
            </button>
          </div>
        </div>

        {/* AMRAP-Only Controls: Large Round Incrementer & Additional Reps */}
        {workoutFormat === 'amrap' && (
          <>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={onAddRound}
                className="flex-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/80 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-bold py-3.5 h-auto text-sm rounded-xl transition-transform active:scale-[0.99] gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {t(
                    'interval.roundPlusOne',
                    '+1 Round ({{current}} Completed)',
                    {
                      current: roundsCompleted,
                    }
                  )}
                </span>
              </Button>

              {roundsCompleted > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onDecrementRound}
                  className="px-3.5 py-3.5 h-auto text-xs font-semibold rounded-xl text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 border-gray-200 dark:border-gray-700"
                  title={t('interval.decrementRound', 'Undo 1 round')}
                >
                  <Minus className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/60 px-3.5 py-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                {t('interval.additionalReps', 'Additional Reps:')}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onSetReps(Math.max(0, repsCompleted - 5))}
                  className="h-7 px-2 text-xs font-bold text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                >
                  -5
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onSetReps(Math.max(0, repsCompleted - 1))}
                  className="h-7 px-2 text-xs font-bold text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                >
                  -1
                </Button>
                <span className="text-sm font-bold text-gray-900 dark:text-gray-50 px-2 font-mono min-w-[2rem] text-center">
                  {repsCompleted}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onSetReps(repsCompleted + 1)}
                  className="h-7 px-2 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  +1
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onSetReps(repsCompleted + 5)}
                  className="h-7 px-2 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  +5
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
