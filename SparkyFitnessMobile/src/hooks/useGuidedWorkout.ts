import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildGuidedReplayCues,
  buildGuidedRestCues,
  buildGuidedSessionStartCues,
  buildGuidedSetStartCues,
  buildGuidedWorkoutCompleteCues,
  resolveGuidedSetTarget,
  shouldSpeakGuidedHalfway,
  type GuidedCue,
  type GuidedSetTarget,
} from '@workspace/shared';
import {
  useActiveWorkoutStore,
  type ActiveWorkoutState,
} from '../stores/activeWorkoutStore';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { playIntervalCue } from '../services/sounds';
import {
  resetGuidedSpeechSession,
  speakGuided,
  stopGuidedSpeech,
} from '../services/speech';
import { fireSelectionHaptic } from '../services/haptics';
import { renderGuidedCues } from '../utils/guidedWorkoutSpeech';
import {
  describeActiveSetAssumed,
  isWeightDurationModality,
  resolveSnapshotModality,
} from '../utils/workoutSession';

export interface GuidedSetView {
  setId: string;
  exerciseName: string;
  /** Library images (start/end positions), cycled as a slideshow. */
  images: string[];
  instructions: string[];
  target: GuidedSetTarget;
  /**
   * A timed hold with no planned length: guided mode runs a stopwatch for it
   * and logs the time held, instead of waiting on a bare DONE tap.
   */
  stopwatch: boolean;
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
  /** A hold with no planned time: the stopwatch counts up until DONE. */
  | { kind: 'stopwatch'; set: GuidedSetView; elapsedSec: number }
  /** A new set guided mode hasn't started yet (until the next tick). */
  | { kind: 'starting'; set: GuidedSetView }
  | { kind: 'reps'; set: GuidedSetView }
  | { kind: 'rest'; next: GuidedSetView | null }
  | { kind: 'done' };

const TICK_MS = 250;

/** Usable image paths: blanks and the legacy '[]' sentinel dropped. */
export function guidedExerciseImages(
  images: readonly string[] | null | undefined
): string[] {
  return (images ?? []).filter((img) => {
    const trimmed = typeof img === 'string' ? img.trim() : '';
    return trimmed !== '' && trimmed !== '[]';
  });
}

type DescribeSource = Pick<
  ActiveWorkoutState,
  | 'session'
  | 'previousSessionSets'
  | 'plannedSetValues'
  | 'exerciseConfigs'
  | 'weightUnit'
  | 'workoutFormat'
>;

function describeGuidedSet(
  state: DescribeSource,
  setId: string | null
): GuidedSetView | null {
  const session = state.session;
  if (session == null || setId == null) return null;
  const exercise = session.exercises.find((e) =>
    e.sets.some((s) => String(s.id) === setId)
  );
  if (!exercise) return null;
  const desc = describeActiveSetAssumed(session, setId, state);
  const modality = resolveSnapshotModality(exercise.exercise_snapshot);
  const snapshot = exercise.exercise_snapshot;
  const target = resolveGuidedSetTarget(modality, {
    reps: desc?.reps,
    duration: desc?.durationSec,
  });
  return {
    setId,
    exerciseName: desc?.exerciseName ?? snapshot?.name ?? '',
    images: guidedExerciseImages(snapshot?.images),
    instructions: snapshot?.instructions ?? [],
    target,
    stopwatch:
      target.kind === 'open' &&
      (modality === 'duration' || isWeightDurationModality(modality)),
    setNumber: desc?.setNumber ?? 1,
    totalSets: desc?.setCount ?? exercise.sets.length,
  };
}

interface GetReady {
  setId: string;
  endsAt: number;
}

interface GuidedMemo {
  announcedSetId: string | null;
  halfwaySetId: string | null;
  completingSetId: string | null;
  lastBeep: string | null;
  getReady: GetReady | null;
  /** Epoch ms guided mode was paused; null while running. */
  pausedAt: number | null;
  /** Whether Pause also paused a running rest (so Resume resumes it). */
  pausedRest: boolean;
}

function freshMemo(): GuidedMemo {
  return {
    announcedSetId: null,
    halfwaySetId: null,
    completingSetId: null,
    lastBeep: null,
    getReady: null,
    pausedAt: null,
    pausedRest: false,
  };
}

/**
 * Drives guided mode (#1507) for a standard (set-based) workout. Mount it only
 * while guided mode is on: it announces sets, runs the get-ready countdown,
 * starts and finishes timed sets on the clock, and narrates rests. Rep-based
 * sets wait for `finish()`, which the card's DONE — NEXT button calls.
 *
 * Everything runs through the existing store actions (startSetTimer,
 * stopSetTimer, completeSet), so rest timers, PRs, autosave and the watch see
 * exactly what a manual log produces. Transitions run in one ticker callback
 * reading absolute timestamps, so a backgrounded app catches up on return
 * instead of drifting.
 */
export function useGuidedWorkout(onCompleteSet: (setId: string) => void): {
  phase: GuidedPhase;
  finish: () => void;
  paused: boolean;
  pause: () => void;
  resume: () => void;
  replay: () => void;
} {
  const { t, i18n } = useTranslation();
  const activeSetId = useActiveWorkoutStore((s) => s.activeSetId);
  const restState = useActiveWorkoutStore((s) => s.rest.state);
  const session = useActiveWorkoutStore((s) => s.session);
  const previousSessionSets = useActiveWorkoutStore(
    (s) => s.previousSessionSets
  );
  const plannedSetValues = useActiveWorkoutStore((s) => s.plannedSetValues);
  const exerciseConfigs = useActiveWorkoutStore((s) => s.exerciseConfigs);
  const weightUnit = useActiveWorkoutStore((s) => s.weightUnit);
  const workoutFormat = useActiveWorkoutStore((s) => s.workoutFormat);
  const timerStartedAt = useActiveWorkoutStore((s) =>
    s.activeSetId != null ? s.setTimerStartedAt[s.activeSetId] : undefined
  );
  const countdownSec = useAppPreferencesStore((s) => s.guidedCountdownSec);

  const [now, setNow] = useState(() => Date.now());
  const [getReady, setGetReady] = useState<GetReady | null>(null);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  // Mirrors memo.announcedSetId for rendering: until the ticker has handled a
  // new set, the card must not offer DONE for a set about to count down.
  const [announcedSetId, setAnnouncedSetId] = useState<string | null>(null);
  const memoRef = useRef<GuidedMemo>(freshMemo());

  const activeSet = useMemo(
    () =>
      describeGuidedSet(
        {
          session,
          previousSessionSets,
          plannedSetValues,
          exerciseConfigs,
          weightUnit,
          workoutFormat,
        },
        activeSetId
      ),
    [
      session,
      previousSessionSets,
      plannedSetValues,
      exerciseConfigs,
      weightUnit,
      workoutFormat,
      activeSetId,
    ]
  );

  // Latest render values for the long-lived ticker and store subscription.
  const latestRef = useRef({
    t,
    language: i18n.language,
    countdownSec,
    onCompleteSet,
  });
  useEffect(() => {
    latestRef.current = {
      t,
      language: i18n.language,
      countdownSec,
      onCompleteSet,
    };
  });

  useEffect(() => {
    memoRef.current = freshMemo();
    const memo = memoRef.current;

    const speak = (cues: GuidedCue[], interrupt: boolean) => {
      const { t: tr, language } = latestRef.current;
      speakGuided(renderGuidedCues(cues, tr), { interrupt, language });
    };
    const beep = (key: string) => {
      if (memo.lastBeep === key) return;
      memo.lastBeep = key;
      playIntervalCue('countdown');
      fireSelectionHaptic();
    };
    const updateGetReady = (value: GetReady | null) => {
      memo.getReady = value;
      setGetReady(value);
    };
    const beginSet = (set: GuidedSetView) => {
      memo.completingSetId = null;
      memo.halfwaySetId = null;
      speak(buildGuidedSetStartCues(set), true);
      if (set.target.kind === 'time' || set.stopwatch) {
        useActiveWorkoutStore.getState().startSetTimer(set.setId);
      }
    };

    const tick = () => {
      // Paused: every clock is frozen and nothing advances.
      if (memo.pausedAt != null) return;
      const nowMs = Date.now();
      setNow(nowMs);
      const state = useActiveWorkoutStore.getState();
      const set = describeGuidedSet(state, state.activeSetId);
      if (set == null || state.rest.state !== 'ready') {
        if (memo.getReady) updateGetReady(null);
        return;
      }
      // The cursor moved off the counting-down set (logged by hand, edited).
      if (memo.getReady && memo.getReady.setId !== set.setId) {
        updateGetReady(null);
      }

      if (memo.announcedSetId !== set.setId) {
        memo.announcedSetId = set.setId;
        setAnnouncedSetId(set.setId);
        // Remounted mid-set (navigated away and back): the timer is already
        // running, so resume silently instead of restarting it.
        if (state.setTimerStartedAt[set.setId] != null) return;
        const isSessionStart = Object.keys(state.completedSetIds).length === 0;
        if (isSessionStart || set.target.kind === 'time' || set.stopwatch) {
          updateGetReady({
            setId: set.setId,
            endsAt: nowMs + latestRef.current.countdownSec * 1000,
          });
          if (isSessionStart) speak(buildGuidedSessionStartCues(set), true);
          return;
        }
        beginSet(set);
        return;
      }

      if (memo.getReady) {
        const remaining = Math.ceil((memo.getReady.endsAt - nowMs) / 1000);
        if (remaining <= 0) {
          updateGetReady(null);
          beginSet(set);
        } else if (remaining <= 3) {
          beep(`ready:${set.setId}:${remaining}`);
        }
        return;
      }

      const startedAt = state.setTimerStartedAt[set.setId];
      if (set.target.kind !== 'time' || startedAt == null) return;
      const totalSec = set.target.seconds;
      const remaining = Math.ceil((startedAt + totalSec * 1000 - nowMs) / 1000);
      if (remaining <= 0) {
        if (memo.completingSetId === set.setId) return;
        memo.completingSetId = set.setId;
        state.stopSetTimer(set.setId);
        // Log the target, not the wall clock: a set that ran out while the
        // app was backgrounded must not record the extra time.
        useActiveWorkoutStore
          .getState()
          .updateSetField(set.setId, { duration: totalSec });
        latestRef.current.onCompleteSet(set.setId);
        return;
      }
      if (
        shouldSpeakGuidedHalfway(
          totalSec,
          remaining,
          memo.halfwaySetId === set.setId
        )
      ) {
        memo.halfwaySetId = set.setId;
        speak([{ type: 'halfway' }], false);
      }
      if (remaining <= 3) beep(`set:${set.setId}:${remaining}`);
    };

    const intervalId = setInterval(tick, TICK_MS);

    // Rests and the end of the workout are store events, not clock ones.
    const unsubscribe = useActiveWorkoutStore.subscribe((state, prev) => {
      if (
        state.activeSetId == null &&
        prev.activeSetId != null &&
        state.sessionId != null &&
        Object.keys(state.completedSetIds).length > 0
      ) {
        speak(buildGuidedWorkoutCompleteCues(), true);
        return;
      }
      if (prev.rest.state === 'ready' && state.rest.state === 'resting') {
        const next = describeGuidedSet(state, state.activeSetId);
        speak(
          buildGuidedRestCues(
            state.rest.durationSec,
            next ? { exerciseName: next.exerciseName } : null
          ),
          true
        );
      }
    });

    return () => {
      clearInterval(intervalId);
      unsubscribe();
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
    const store = useActiveWorkoutStore.getState();
    if (store.rest.state === 'resting') {
      store.pauseRest();
      memo.pausedRest = true;
    }
  }, []);

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
    const store = useActiveWorkoutStore.getState();
    if (store.activeSetId != null) {
      store.shiftSetTimer(store.activeSetId, pausedMs);
    }
    if (memo.pausedRest && store.rest.state === 'paused') store.resumeRest();
    memo.pausedRest = false;
  }, []);

  /**
   * Reads the current set's announcement and all its instructions again (the
   * next set's, during a rest). Timers are untouched; ignored while paused.
   */
  const replay = useCallback(() => {
    if (memoRef.current.pausedAt != null) return;
    const state = useActiveWorkoutStore.getState();
    const set = describeGuidedSet(state, state.activeSetId);
    if (set == null) return;
    const { t: tr, language } = latestRef.current;
    speakGuided(
      renderGuidedCues(
        buildGuidedReplayCues(set, state.rest.state !== 'ready'),
        tr
      ),
      { interrupt: true, language }
    );
  }, []);

  const finish = useCallback(() => {
    const setId = useActiveWorkoutStore.getState().activeSetId;
    // Logging a set ends any pause; the rest that follows runs normally.
    memoRef.current.pausedAt = null;
    memoRef.current.pausedRest = false;
    setPausedAt(null);
    if (setId == null) return;
    // A stopwatch hold logs the time held; stopping it writes the duration.
    const state = useActiveWorkoutStore.getState();
    if (describeGuidedSet(state, setId)?.stopwatch) state.stopSetTimer(setId);
    onCompleteSet(setId);
  }, [onCompleteSet]);

  // While paused, the clocks read the moment they were frozen.
  const clockNow = pausedAt ?? now;

  const pendingGetReady =
    getReady != null && getReady.setId === activeSetId ? getReady : null;

  let phase: GuidedPhase;
  if (activeSet == null) {
    phase = { kind: 'done' };
  } else if (restState !== 'ready') {
    phase = { kind: 'rest', next: activeSet };
  } else if (announcedSetId !== activeSet.setId) {
    phase = { kind: 'starting', set: activeSet };
  } else if (pendingGetReady != null) {
    phase = {
      kind: 'getReady',
      set: activeSet,
      totalSec: countdownSec,
      remainingSec: Math.max(
        0,
        Math.ceil((pendingGetReady.endsAt - clockNow) / 1000)
      ),
    };
  } else if (activeSet.target.kind === 'time' && timerStartedAt != null) {
    const totalSec = activeSet.target.seconds;
    phase = {
      kind: 'timed',
      set: activeSet,
      totalSec,
      remainingSec: Math.max(
        0,
        Math.ceil((timerStartedAt + totalSec * 1000 - clockNow) / 1000)
      ),
    };
  } else if (activeSet.stopwatch && timerStartedAt != null) {
    phase = {
      kind: 'stopwatch',
      set: activeSet,
      elapsedSec: Math.max(0, Math.floor((clockNow - timerStartedAt) / 1000)),
    };
  } else {
    phase = { kind: 'reps', set: activeSet };
  }

  return { phase, finish, paused: pausedAt != null, pause, resume, replay };
}
