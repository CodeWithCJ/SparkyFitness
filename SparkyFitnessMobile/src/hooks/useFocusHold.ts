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
  resolveSnapshotModality,
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
  /** Begins the hold: Get ready first when the watch setting has it on. */
  start: () => void;
  /** Skips the rest of Get ready, or stops a running hold and logs the set. */
  tap: () => void;
}

interface TimedTarget {
  setId: string;
  entryId: string;
  targetSec: number | null;
}

/** The active set when it is a timed hold (not a cardio form or a distance set). */
function findTimedTarget(
  session: PresetSessionResponse | null,
  activeSetId: string | null
): TimedTarget | null {
  if (session == null || activeSetId == null) return null;
  for (const exercise of session.exercises) {
    const set = exercise.sets.find((s) => String(s.id) === activeSetId);
    if (set == null) continue;
    const snapshot = exercise.exercise_snapshot;
    const modality = resolveSnapshotModality(snapshot);
    const timed = modality === 'duration' || isWeightDurationModality(modality);
    if (!timed || rendersCardioEffortForm(snapshot, exercise.sets.length)) {
      return null;
    }
    const target = effectiveSetDurationSec(set, modality);
    return {
      setId: activeSetId,
      entryId: exercise.id,
      targetSec: target != null && target > 0 ? target : null,
    };
  }
  return null;
}

/**
 * The focus view's timed hold: an optional 3-2-1 Get ready (the watch's
 * "Countdown before holds"), then a countdown to the planned length, or a
 * stopwatch when none is planned. The running timer is the store's per-set
 * timer, so the watch still sees it and the list's own stopwatch button stays
 * in step; this adds Get ready, the countdown's auto-log at zero and a tap to
 * end early. A timer the watch started is shown but never logged from here.
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
  const target = enabled ? findTimedTarget(session, activeSetId) : null;
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

  // Moving the cursor off the set drops a pending Get ready.
  if (getReady != null && getReady.setId !== setId) setGetReady(null);
  // A timer started elsewhere (the watch) ends Get ready: the hold is already
  // running and is not this view's to own or log.
  if (getReady != null && startedAt != null) setGetReady(null);
  const activeGetReady =
    getReady != null && getReady.setId === setId ? getReady : null;
  const phase: FocusHold['phase'] =
    startedAt != null
      ? 'running'
      : activeGetReady != null
        ? 'getReady'
        : 'idle';
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
    if (getReady == null || getReadyEndsAt == null) return;
    const timer = setTimeout(
      () => run(getReady.setId),
      Math.max(0, getReadyEndsAt - Date.now())
    );
    return () => clearTimeout(timer);
  }, [getReady, getReadyEndsAt, run]);

  const finish = useCallback((id: string, ranOut = false) => {
    if (ranOut) {
      playIntervalCue('finish');
      fireSuccessHaptic();
    }
    useActiveWorkoutStore.getState().stopSetTimer(id);
    ownedRef.current = null;
    onFinishRef.current(id);
  }, []);

  // A countdown started here logs the set when it reaches zero.
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
    const timer = setTimeout(
      () => finish(setId, true),
      Math.max(0, startedAt + targetSec * 1000 - Date.now())
    );
    return () => clearTimeout(timer);
  }, [setId, startedAt, targetSec, finish]);

  const start = useCallback(() => {
    if (setId == null || phase !== 'idle') return;
    if (holdGetReady) {
      setGetReady({
        setId,
        endsAt: Date.now() + GET_READY_SECONDS * 1000,
      });
    } else {
      run(setId);
    }
  }, [setId, phase, holdGetReady, run]);

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
    tap,
  };
}
