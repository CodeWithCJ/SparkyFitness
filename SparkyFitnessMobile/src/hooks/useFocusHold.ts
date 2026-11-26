import { useCallback, useEffect, useRef, useState } from 'react';
import type { PresetSessionResponse } from '@workspace/shared';

import { fireSuccessHaptic } from '../services/haptics';
import { playIntervalCue } from '../services/sounds';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  effectiveSetDurationSec,
  isWeightDurationModality,
  rendersCardioEffortForm,
  resolveCurrentSetId,
  resolveSnapshotModality,
  type PlannedSetValues,
} from '../utils/workoutSession';

/** The 3-2-1 before a hold starts, as on the watch. */
export const GET_READY_SECONDS = 3;

export interface FocusHold {
  /** `idle` shows the normal set card; the other two take over the page. */
  phase: 'idle' | 'getReady' | 'running';
  /** The timed set the active cursor sits on, null for any other set. */
  setId: string | null;
  /** Entry holding that set. */
  entryId: string | null;
  /** Planned length in seconds; null runs a stopwatch instead. */
  targetSec: number | null;
  /** Epoch ms the Get ready ends (phase `getReady`). */
  getReadyEndsAt: number | null;
  /** Epoch ms the hold started (phase `running`). */
  startedAt: number | null;
  /**
   * Begins the hold: Get ready first when the watch setting has it on. With a
   * set id it holds that timed set instead of the cursor's (a timed exercise
   * opened from the strip), without moving the cursor.
   */
  start: (setId?: string) => void;
  /** Aborts Get ready without starting the hold (no effect once running). */
  cancel: () => void;
  /**
   * Skips the rest of Get ready, or stops a running hold and logs the set with
   * the time held (before or after the planned length).
   */
  tap: () => void;
}

export interface TimedTarget {
  setId: string;
  entryId: string;
  targetSec: number | null;
}

/** The set as a timed hold (not a cardio form or a distance set), else null. */
export function timedTargetForSet(
  exercise: PresetSessionResponse['exercises'][number],
  setId: string,
  plannedSetValues: Record<string, PlannedSetValues>
): TimedTarget | null {
  const set = exercise.sets.find((s) => String(s.id) === setId);
  if (set == null) return null;
  const snapshot = exercise.exercise_snapshot;
  const modality = resolveSnapshotModality(snapshot);
  const timed = modality === 'duration' || isWeightDurationModality(modality);
  if (!timed || rendersCardioEffortForm(snapshot, exercise.sets.length)) {
    return null;
  }
  // The set's own length wins (an edit); a set started from a plan keeps
  // its length in the planned values until then.
  const planned = plannedSetValues[setId];
  const target =
    effectiveSetDurationSec(set, modality) ??
    (planned != null ? effectiveSetDurationSec(planned, modality) : null);
  return {
    setId,
    entryId: exercise.id,
    targetSec: target != null && target > 0 ? target : null,
  };
}

/** The given set when it is a timed hold. */
function findTimedTarget(
  session: PresetSessionResponse | null,
  activeSetId: string | null,
  plannedSetValues: Record<string, PlannedSetValues>
): TimedTarget | null {
  if (session == null || activeSetId == null) return null;
  for (const exercise of session.exercises) {
    if (exercise.sets.some((s) => String(s.id) === activeSetId)) {
      return timedTargetForSet(exercise, activeSetId, plannedSetValues);
    }
  }
  return null;
}

/**
 * The focus view's timed hold: an optional 3-2-1 Get ready (the watch's
 * "Countdown before holds"), then a countdown to the planned length, or a
 * stopwatch when none is planned. The running timer is the store's per-set
 * timer, so the watch still sees it and the list's own stopwatch button stays
 * in step; this adds Get ready, the cue at zero (the hold then counts up until
 * a tap) and the tap that ends the hold. A timer the watch started is shown but never logged from here.
 * `onFinish` runs when a hold started here ends, to log the set.
 */
export function useFocusHold({
  session,
  activeSetId,
  enabled,
  onFinish,
}: {
  session: PresetSessionResponse | null;
  activeSetId: string | null;
  /** Focus view on and no readOnly surface. */
  enabled: boolean;
  onFinish: (setId: string) => void;
}): FocusHold {
  const plannedSetValues = useActiveWorkoutStore((s) => s.plannedSetValues);
  const setRenderKeys = useActiveWorkoutStore((s) => s.setRenderKeys);
  // A set started from another exercise's page; null follows the cursor.
  const [manualId, setManualId] = useState<string | null>(null);
  const manualCurrentId =
    manualId != null
      ? resolveCurrentSetId(session, setRenderKeys, manualId)
      : null;
  const target = enabled
    ? findTimedTarget(session, manualCurrentId ?? activeSetId, plannedSetValues)
    : null;
  const setId = target?.setId ?? null;
  const startedAt = useActiveWorkoutStore((s) =>
    setId != null ? (s.setTimerStartedAt[setId] ?? null) : null
  );
  const holdGetReady = useAppPreferencesStore((s) => s.watchHoldCountdown);
  const [getReady, setGetReady] = useState<{
    setId: string;
    endsAt: number;
  } | null>(null);
  // The hold this view started, the only one it logs on its own: the set and
  // that timer's start, so a stopwatch restarted elsewhere (the list view, the
  // watch) on the same set is not taken for it.
  const ownedRef = useRef<{ setId: string; startedAt: number } | null>(null);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  // Get ready was started for the id the set had then; autosave can swap it,
  // so compare and run it by the set's current id.
  const getReadyId =
    getReady != null
      ? resolveCurrentSetId(session, setRenderKeys, getReady.setId)
      : null;
  // Moving the cursor off the set drops a pending Get ready.
  if (getReady != null && getReadyId !== setId) setGetReady(null);
  // A timer started elsewhere (the watch) ends Get ready: the hold is already
  // running and is not this view's to own or log.
  if (getReady != null && startedAt != null) setGetReady(null);
  const activeGetReady =
    getReady != null && getReadyId === setId ? getReady : null;
  const phase: FocusHold['phase'] =
    startedAt != null
      ? 'running'
      : activeGetReady != null
        ? 'getReady'
        : 'idle';
  // Once the hold is over (logged, cancelled or the set gone) the cursor
  // leads again.
  if (manualId != null && phase === 'idle') setManualId(null);
  const targetSec = target?.targetSec ?? null;

  const run = useCallback((id: string) => {
    setGetReady(null);
    const store = useActiveWorkoutStore.getState();
    // Already running: started elsewhere, so not this view's to own or cue.
    if (store.setTimerStartedAt[id] != null) return;
    // The start cue, as the watch plays at the end of Get ready.
    playIntervalCue('work');
    const startedAt = Date.now();
    store.startSetTimer(id, startedAt);
    ownedRef.current = { setId: id, startedAt };
  }, []);

  // Get ready runs out into the hold.
  const getReadyEndsAt = activeGetReady?.endsAt ?? null;
  useEffect(() => {
    if (getReadyId == null || getReadyEndsAt == null) return;
    const timer = setTimeout(
      () => run(getReadyId),
      Math.max(0, getReadyEndsAt - Date.now())
    );
    return () => clearTimeout(timer);
  }, [getReadyId, getReadyEndsAt, run]);

  const finish = useCallback((id: string) => {
    useActiveWorkoutStore.getState().stopSetTimer(id);
    ownedRef.current = null;
    onFinishRef.current(id);
  }, []);

  // A countdown started here cues at zero and then keeps counting up: the set
  // is logged by the tap that ends the hold, with the time actually held, so
  // going past the plan is possible (a plank held longer than last time).
  useEffect(() => {
    // A stopped timer releases this hold, so a later start elsewhere is not
    // logged from here.
    if (startedAt == null && ownedRef.current?.setId === setId) {
      ownedRef.current = null;
    }
    if (
      setId == null ||
      startedAt == null ||
      targetSec == null ||
      ownedRef.current?.setId !== setId ||
      ownedRef.current.startedAt !== startedAt
    ) {
      return;
    }
    // "Log at zero" ends the hold at the plan; "Keep counting" ends it at twice
    // the plan so a forgotten hold cannot run for hours.
    const timer = setTimeout(
      () => {
        playIntervalCue('finish');
        fireSuccessHaptic();
        if (useAppPreferencesStore.getState().focusHoldAtZero === 'log') {
          finish(setId);
        }
      },
      Math.max(0, startedAt + targetSec * 1000 - Date.now())
    );
    const capTimer = setTimeout(
      () => {
        if (useAppPreferencesStore.getState().focusHoldAtZero === 'keep') {
          finish(setId);
        }
      },
      Math.max(0, startedAt + targetSec * 2000 - Date.now())
    );
    return () => {
      clearTimeout(timer);
      clearTimeout(capTimer);
    };
  }, [setId, startedAt, targetSec, finish]);

  const start = useCallback(
    (otherSetId?: string) => {
      const id = typeof otherSetId === 'string' ? otherSetId : setId;
      if (id == null || phase !== 'idle') return;
      if (id !== setId) setManualId(id);
      if (holdGetReady) {
        setGetReady({
          setId: id,
          endsAt: Date.now() + GET_READY_SECONDS * 1000,
        });
      } else {
        run(id);
      }
    },
    [setId, phase, holdGetReady, run]
  );

  const cancel = useCallback(() => {
    if (phase === 'getReady') setGetReady(null);
  }, [phase]);

  const tap = useCallback(() => {
    if (setId == null) return;
    if (phase === 'getReady') run(setId);
    else if (phase === 'running') finish(setId);
  }, [setId, phase, run, finish]);

  return {
    phase,
    setId,
    entryId: target?.entryId ?? null,
    targetSec,
    getReadyEndsAt,
    startedAt,
    start,
    cancel,
    tap,
  };
}
