import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useActiveWorkoutStore } from './activeWorkoutStore';

/**
 * How long a reading stays on screen. The watch sends a live reading every few
 * seconds while the phone is reachable, and a batch every 60s and at each
 * exercise change that covers a stretch out of range. A queued batch can lag
 * behind that, so this allows for one missed batch before the chip gives up
 * rather than showing a number that no longer describes the wearer.
 */
export const LIVE_HEART_RATE_MAX_AGE_MS = 150_000;

/** The newest heart-rate sample the watch has sent for the live workout. */
export interface LiveHeartRateReading {
  sessionId: string;
  /** The exercise entry the sample was measured during. */
  exerciseEntryId: string;
  bpm: number;
  /** When the watch measured it, epoch ms. */
  at: number;
}

interface LiveHeartRateState {
  reading: LiveHeartRateReading | null;
  /**
   * Keeps `reading` if it is the newer of the two for the same session. A
   * batch that arrives late (queued while the phone was away) must not put
   * an older number back on screen.
   */
  record: (reading: LiveHeartRateReading) => void;
}

/**
 * In memory only. The upload buffer in `useWatchWorkoutBridge` lives in a ref
 * so batches don't re-render anything; this is the one value from it the
 * active-workout screen shows as it arrives. Never persisted: after a
 * relaunch the next batch supplies a fresh one.
 */
export const useLiveHeartRateStore = create<LiveHeartRateState>((set) => ({
  reading: null,
  record: (reading) =>
    set((state) =>
      state.reading != null &&
      state.reading.sessionId === reading.sessionId &&
      state.reading.at > reading.at
        ? state
        : { reading }
    ),
}));

/**
 * The newest heart rate for this exercise entry in the live workout, or null
 * when there is none, it belongs to another exercise or workout, or it is
 * older than `LIVE_HEART_RATE_MAX_AGE_MS`. Re-checks the age every 15s while
 * a reading is showing, so it disappears on its own when the watch goes quiet.
 */
export function useLiveHeartRate(
  exerciseEntryId: string | null
): number | null {
  const reading = useLiveHeartRateStore((s) => s.reading);
  const liveSessionId = useActiveWorkoutStore((s) => s.sessionId);
  const liveStartedAt = useActiveWorkoutStore((s) => s.startedAt);
  // Restarting a saved workout reuses its session and entry ids, so the ids
  // alone would let the previous run's reading (or a late batch from it) show
  // as this run's. Only a reading measured since this run started counts.
  const matches =
    exerciseEntryId != null &&
    reading != null &&
    reading.sessionId === liveSessionId &&
    reading.exerciseEntryId === exerciseEntryId &&
    liveStartedAt != null &&
    reading.at >= liveStartedAt;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!matches) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [matches, reading]);

  if (!matches || now - reading.at > LIVE_HEART_RATE_MAX_AGE_MS) return null;
  return reading.bpm;
}

/**
 * How long a GPS recording's reading stays on screen. The watch sends one every
 * few seconds while the phone is reachable; a run has no batch to wait for, so
 * a number this old means the watch has gone quiet (out of range, or paused).
 */
export const RECORDING_HEART_RATE_MAX_AGE_MS = 15_000;

/**
 * The newest heart rate the watch has sent for this GPS recording, or null
 * when there is none or it is older than `RECORDING_HEART_RATE_MAX_AGE_MS`.
 * Shares the store with the strength workout's reading: the two never run at
 * once (the watch skips heart rate for a recording while a workout owns its
 * HealthKit session), and the session id keeps them apart.
 */
export function useRecordingHeartRate(
  recordingId: string | null
): number | null {
  const reading = useLiveHeartRateStore((s) => s.reading);
  const matches =
    recordingId != null && reading != null && reading.sessionId === recordingId;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!matches) return;
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, [matches, reading]);

  if (!matches || now - reading.at > RECORDING_HEART_RATE_MAX_AGE_MS) {
    return null;
  }
  return reading.bpm;
}

/**
 * The newest sample among the batch's attributed samples, with the exercise
 * it was attributed to. Null when none has a usable time and heart rate.
 */
export function newestHeartRateSample(
  samplesByExercise: ReadonlyMap<string, readonly { t: string; bpm: number }[]>
): { exerciseEntryId: string; bpm: number; at: number } | null {
  let newest: { exerciseEntryId: string; bpm: number; at: number } | null =
    null;
  for (const [exerciseEntryId, samples] of samplesByExercise) {
    for (const sample of samples) {
      const at = Date.parse(sample?.t);
      if (!Number.isFinite(at) || !(sample.bpm > 0)) continue;
      if (newest == null || at > newest.at) {
        newest = { exerciseEntryId, bpm: Math.round(sample.bpm), at };
      }
    }
  }
  return newest;
}
