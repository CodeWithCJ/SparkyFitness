import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildGuidedReplayCues,
  buildGuidedRestCues,
  buildGuidedSessionStartCues,
  buildGuidedSetStartCues,
  buildGuidedWorkoutCompleteCues,
  normalizeGuidedInstructions,
  resolveGuidedSetTarget,
  shouldSpeakGuidedHalfway,
  type GuidedCue,
  type GuidedSetTarget,
} from '@workspace/shared';
import {
  getCurrentWorkoutSetPointer,
  getSetByPointer,
  isWorkoutPlaybackComplete,
  updateWorkoutSetAtPointer,
  type WorkoutPlaybackDraft,
  type WorkoutSetPointer,
} from '@/utils/workoutPlayback';
import { getGuidedWorkoutPreferences } from '@/utils/guidedWorkoutPreferences';
import {
  renderGuidedCues,
  resetGuidedSpeechSession,
  speakGuided,
  stopGuidedSpeech,
} from '@/utils/guidedWorkoutSpeech';
import { playIntervalCue } from '@/utils/workoutSounds';
import { filterValidExerciseImages } from '@/utils/exercises';

export interface GuidedSetView {
  pointer: WorkoutSetPointer;
  exerciseName: string;
  /** Library images, cycled as a slideshow; empty when there are none. */
  images: string[];
  instructions: string[];
  target: GuidedSetTarget;
  setNumber: number;
  totalSets: number;
}

export type GuidedPhase =
  | {
      kind: 'getReady';
      set: GuidedSetView;
      remainingSec: number;
      totalSec: number;
    }
  | {
      kind: 'timed';
      set: GuidedSetView;
      remainingSec: number;
      totalSec: number;
    }
  | { kind: 'reps'; set: GuidedSetView }
  | { kind: 'rest'; next: GuidedSetView | null }
  | { kind: 'done' };

const TICK_MS = 250;

/**
 * The exercise's library images (start/end positions), else its single
 * custom image.
 */
export function guidedExerciseImages(exercise: {
  images?: string[];
  image_url?: string;
}): string[] {
  const library = filterValidExerciseImages(exercise.images);
  if (library.length > 0) return library;
  return filterValidExerciseImages(exercise.image_url);
}

function pointerKey(pointer: WorkoutSetPointer): string {
  return `${pointer.exerciseIndex}:${pointer.setIndex}`;
}

export function describeGuidedSet(
  draft: WorkoutPlaybackDraft
): GuidedSetView | null {
  const pointer = getCurrentWorkoutSetPointer(draft);
  const exercise = draft.exercises[pointer.exerciseIndex];
  const set = getSetByPointer(draft, pointer);
  if (!exercise || !set) return null;
  return {
    pointer,
    exerciseName: exercise.exercise_name,
    images: guidedExerciseImages(exercise),
    instructions: normalizeGuidedInstructions(exercise.instructions),
    target: resolveGuidedSetTarget(exercise.modality ?? 'weight_reps', set),
    setNumber: pointer.setIndex + 1,
    totalSets: exercise.sets.length,
  };
}

interface GetReady {
  key: string;
  endsAt: number;
}

interface GuidedMemo {
  announcedKey: string | null;
  halfwayKey: string | null;
  completingKey: string | null;
  lastBeep: string | null;
  getReady: GetReady | null;
  restState: WorkoutPlaybackDraft['rest_timer']['state'];
  wasComplete: boolean;
  /** Epoch ms guided mode was paused; null while running. */
  pausedAt: number | null;
  /** Whether Pause also paused a running rest (so Resume resumes it). */
  pausedRest: boolean;
}

function freshMemo(initial: WorkoutPlaybackDraft | null): GuidedMemo {
  return {
    announcedKey: null,
    halfwayKey: null,
    completingKey: null,
    lastBeep: null,
    getReady: null,
    restState: initial?.rest_timer.state ?? 'idle',
    wasComplete: initial ? isWorkoutPlaybackComplete(initial) : false,
    pausedAt: null,
    pausedRest: false,
  };
}

export interface WorkoutPlaybackGuided {
  phase: GuidedPhase;
  paused: boolean;
  pause: () => void;
  resume: () => void;
  /** Reads the current set and all its instructions again. */
  replay: () => void;
  /** DONE — NEXT: logs the current set and ends any pause. */
  finish: (pointer: WorkoutSetPointer) => void;
}

/**
 * Guided mode (#1507) for a standard web workout. Mount it only while guided
 * mode is on. It announces sets, runs the get-ready countdown, starts and
 * finishes timed sets on the clock, and narrates rests; rep-based sets wait
 * for `onCompleteSet` from the DONE — NEXT button. It only ever writes through
 * the runner's own draft helpers and completion handler, so drafts, rest
 * timers and saving behave exactly as for a manual log.
 */
export function useWorkoutPlaybackGuided({
  draft,
  getDraft,
  updateDraft,
  onCompleteSet,
  onToggleRestPause,
}: {
  draft: WorkoutPlaybackDraft;
  getDraft: () => WorkoutPlaybackDraft | null;
  updateDraft: (
    updater: (current: WorkoutPlaybackDraft) => WorkoutPlaybackDraft
  ) => void;
  onCompleteSet: (pointer: WorkoutSetPointer) => void;
  /** The runner's own rest pause/resume toggle. */
  onToggleRestPause: () => void;
}): WorkoutPlaybackGuided {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const [getReady, setGetReady] = useState<GetReady | null>(null);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const memoRef = useRef<GuidedMemo>(freshMemo(null));

  const latestRef = useRef({
    t,
    lang: i18n.language,
    getDraft,
    updateDraft,
    onCompleteSet,
  });
  useEffect(() => {
    latestRef.current = {
      t,
      lang: i18n.language,
      getDraft,
      updateDraft,
      onCompleteSet,
    };
  });

  useEffect(() => {
    memoRef.current = freshMemo(latestRef.current.getDraft());
    const memo = memoRef.current;

    const speak = (cues: GuidedCue[], interrupt: boolean) => {
      const { t: tr, lang } = latestRef.current;
      speakGuided(renderGuidedCues(cues, tr), { interrupt, lang });
    };
    const beep = (key: string) => {
      if (memo.lastBeep === key) return;
      memo.lastBeep = key;
      if (document.visibilityState === 'visible') playIntervalCue('countdown');
    };
    const updateGetReady = (value: GetReady | null) => {
      memo.getReady = value;
      setGetReady(value);
    };
    const beginSet = (set: GuidedSetView, nowMs: number) => {
      memo.completingKey = null;
      memo.halfwayKey = null;
      speak(buildGuidedSetStartCues(set), true);
      if (set.target.kind === 'time') {
        latestRef.current.updateDraft((current) =>
          updateWorkoutSetAtPointer(current, set.pointer, {
            timer_started_at_ms: nowMs,
          })
        );
      }
    };

    const tick = () => {
      // Paused: every clock is frozen and nothing advances.
      if (memo.pausedAt != null) return;
      const nowMs = Date.now();
      setNow(nowMs);
      const current = latestRef.current.getDraft();
      if (!current) return;

      const complete = isWorkoutPlaybackComplete(current);
      if (complete !== memo.wasComplete) {
        memo.wasComplete = complete;
        if (complete) speak(buildGuidedWorkoutCompleteCues(), true);
      }
      if (complete) {
        if (memo.getReady) updateGetReady(null);
        return;
      }

      const restState = current.rest_timer.state;
      const restStarted = memo.restState === 'idle' && restState === 'running';
      memo.restState = restState;
      const set = describeGuidedSet(current);
      if (restStarted) {
        speak(
          buildGuidedRestCues(
            current.rest_timer.duration_seconds,
            set ? { exerciseName: set.exerciseName } : null
          ),
          true
        );
      }
      if (restState !== 'idle' || set == null) {
        if (memo.getReady) updateGetReady(null);
        return;
      }
      const setDraft = getSetByPointer(current, set.pointer);
      if (!setDraft || setDraft.completed) return;

      const key = pointerKey(set.pointer);
      // The cursor moved off the counting-down set (selected or logged by hand).
      if (memo.getReady && memo.getReady.key !== key) updateGetReady(null);

      if (memo.announcedKey !== key) {
        memo.announcedKey = key;
        // Reloaded mid-set: the timer is already running, so resume silently.
        if (setDraft.timer_started_at_ms != null) return;
        const isSessionStart = !current.exercises.some((e) =>
          e.sets.some((s) => s.completed)
        );
        if (isSessionStart || set.target.kind === 'time') {
          updateGetReady({
            key,
            endsAt: nowMs + getGuidedWorkoutPreferences().countdownSec * 1000,
          });
          if (isSessionStart) speak(buildGuidedSessionStartCues(set), true);
          return;
        }
        beginSet(set, nowMs);
        return;
      }

      if (memo.getReady) {
        const remaining = Math.ceil((memo.getReady.endsAt - nowMs) / 1000);
        if (remaining <= 0) {
          updateGetReady(null);
          beginSet(set, nowMs);
        } else if (remaining <= 3) {
          beep(`ready:${key}:${remaining}`);
        }
        return;
      }

      const startedAt = setDraft.timer_started_at_ms;
      if (set.target.kind !== 'time' || startedAt == null) return;
      const totalSec = set.target.seconds;
      const remaining = Math.ceil((startedAt + totalSec * 1000 - nowMs) / 1000);
      if (remaining <= 0) {
        if (memo.completingKey === key) return;
        memo.completingKey = key;
        // Log the target, not the wall clock: a set that ran out while the
        // tab was hidden must not record the extra time.
        latestRef.current.updateDraft((d) =>
          updateWorkoutSetAtPointer(d, set.pointer, {
            duration: totalSec,
            timer_started_at_ms: null,
          })
        );
        latestRef.current.onCompleteSet(set.pointer);
        return;
      }
      if (
        shouldSpeakGuidedHalfway(totalSec, remaining, memo.halfwayKey === key)
      ) {
        memo.halfwayKey = key;
        speak([{ type: 'halfway' }], false);
      }
      if (remaining <= 3) beep(`set:${key}:${remaining}`);
    };

    const intervalId = window.setInterval(tick, TICK_MS);
    return () => {
      window.clearInterval(intervalId);
      stopGuidedSpeech();
      resetGuidedSpeechSession();
    };
  }, []);

  /**
   * Freezes the session: speech stops, and the get-ready countdown, a running
   * timed set and a running rest all hold their remaining time.
   */
  const pause = useCallback(() => {
    const memo = memoRef.current;
    if (memo.pausedAt != null) return;
    const at = Date.now();
    memo.pausedAt = at;
    setPausedAt(at);
    stopGuidedSpeech();
    if (latestRef.current.getDraft()?.rest_timer.state === 'running') {
      onToggleRestPause();
      memo.pausedRest = true;
    }
  }, [onToggleRestPause]);

  const resume = useCallback(() => {
    const memo = memoRef.current;
    if (memo.pausedAt == null) return;
    const nowMs = Date.now();
    const pausedMs = nowMs - memo.pausedAt;
    memo.pausedAt = null;
    setPausedAt(null);
    setNow(nowMs);
    if (memo.getReady) {
      memo.getReady = {
        ...memo.getReady,
        endsAt: memo.getReady.endsAt + pausedMs,
      };
      setGetReady(memo.getReady);
    }
    const current = latestRef.current.getDraft();
    if (current) {
      const pointer = getCurrentWorkoutSetPointer(current);
      const startedAt = getSetByPointer(current, pointer)?.timer_started_at_ms;
      if (startedAt != null) {
        latestRef.current.updateDraft((d) =>
          updateWorkoutSetAtPointer(d, pointer, {
            timer_started_at_ms: startedAt + pausedMs,
          })
        );
      }
      if (memo.pausedRest && current.rest_timer.state === 'paused') {
        onToggleRestPause();
      }
    }
    memo.pausedRest = false;
  }, [onToggleRestPause]);

  /**
   * Reads the current set's announcement and all its instructions again (the
   * next set's, during a rest). Timers are untouched; ignored while paused.
   */
  const replay = useCallback(() => {
    if (memoRef.current.pausedAt != null) return;
    const current = latestRef.current.getDraft();
    if (!current || isWorkoutPlaybackComplete(current)) return;
    const set = describeGuidedSet(current);
    if (set == null) return;
    const { t: tr, lang } = latestRef.current;
    speakGuided(
      renderGuidedCues(
        buildGuidedReplayCues(set, current.rest_timer.state !== 'idle'),
        tr
      ),
      { interrupt: true, lang }
    );
  }, []);

  const finish = useCallback(
    (pointer: WorkoutSetPointer) => {
      // Logging a set ends any pause; the rest that follows runs normally.
      memoRef.current.pausedAt = null;
      memoRef.current.pausedRest = false;
      setPausedAt(null);
      onCompleteSet(pointer);
    },
    [onCompleteSet]
  );

  const phase = resolvePhase(draft, getReady, pausedAt ?? now);
  return { phase, paused: pausedAt != null, pause, resume, replay, finish };
}

/** The view for `draft` at `clockNow` (the pause moment while paused). */
function resolvePhase(
  draft: WorkoutPlaybackDraft,
  getReady: GetReady | null,
  now: number
): GuidedPhase {
  if (isWorkoutPlaybackComplete(draft)) return { kind: 'done' };
  const set = describeGuidedSet(draft);
  if (draft.rest_timer.state !== 'idle') return { kind: 'rest', next: set };
  if (set == null) return { kind: 'done' };

  const key = pointerKey(set.pointer);
  if (getReady != null && getReady.key === key) {
    return {
      kind: 'getReady',
      set,
      totalSec: getGuidedWorkoutPreferences().countdownSec,
      remainingSec: Math.max(0, Math.ceil((getReady.endsAt - now) / 1000)),
    };
  }
  const startedAt = getSetByPointer(draft, set.pointer)?.timer_started_at_ms;
  if (set.target.kind === 'time' && startedAt != null) {
    const totalSec = set.target.seconds;
    return {
      kind: 'timed',
      set,
      totalSec,
      remainingSec: Math.max(
        0,
        Math.ceil((startedAt + totalSec * 1000 - now) / 1000)
      ),
    };
  }
  return { kind: 'reps', set };
}
