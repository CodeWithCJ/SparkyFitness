import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { WatchRunLivePayload } from '../../modules/watch-connectivity';

/**
 * A run on the watch that has gone quiet this long is treated as over for the
 * live view (the watch left Bluetooth range, or the app was closed there). The
 * run itself is unaffected: it reaches the diary when it finishes.
 */
export const WATCH_RUN_LIVE_MAX_AGE_MS = 20_000;

/** What the watch last said about the run it is recording, as it arrived. */
export interface WatchRunLive {
  runId: string;
  kind: 'run' | 'walk' | 'jumpRope';
  place: 'indoor' | 'outdoor';
  status: 'running' | 'paused';
  autoPaused: boolean;
  /** The run's switches; null when the watch build does not report them. */
  autoPause: boolean | null;
  voiceCues: boolean | null;
  /** Whether a pace or heart-rate range is being watched; null from an older watch build. */
  paceAlert: boolean | null;
  heartRateAlert: boolean | null;
  /** Active seconds when the watch sent it. */
  elapsed: number;
  distanceMeters: number;
  heartRate: number | null;
  energyKcal: number;
  lapCount: number;
  stepLabel: string | null;
  /** Seconds left in the step when the watch sent it. */
  stepRemaining: number | null;
  nextLabel: string | null;
  /** When the watch sent it, epoch ms (the watch's clock). */
  sentAt: number;
  /** When this phone received it, epoch ms. */
  receivedAt: number;
}

/** How long a start request waits for the watch to answer before the phone gives up on it. */
export const WATCH_RUN_PENDING_MAX_AGE_MS = 90_000;

/** A run the phone asked the watch to start that the watch has not yet confirmed. */
export interface WatchRunPending {
  requestId: string;
  kind: 'run' | 'walk';
  place: 'indoor' | 'outdoor';
  /** Epoch ms the request was sent. */
  at: number;
}

interface WatchRunLiveState {
  run: WatchRunLive | null;
  pending: WatchRunPending | null;
  setPending: (pending: WatchRunPending | null) => void;
  /**
   * Takes a live message. `ended` clears the run; a message older than the
   * one held for the same run is ignored (messages can arrive out of order).
   */
  receive: (payload: WatchRunLivePayload, receivedAt?: number) => void;
  clear: () => void;
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** In memory only: a live view of something happening right now. */
export const useWatchRunLiveStore = create<WatchRunLiveState>((set) => ({
  run: null,
  pending: null,
  setPending: (pending) => set({ pending }),
  receive: (payload, receivedAt = Date.now()) =>
    set((state) => {
      if (payload.status === 'ended') {
        return state.run == null || state.run.runId === payload.runId
          ? { run: null }
          : state;
      }
      if (
        !payload.runId ||
        (payload.status !== 'running' && payload.status !== 'paused') ||
        (payload.kind !== 'run' &&
          payload.kind !== 'walk' &&
          payload.kind !== 'jumpRope') ||
        (payload.place !== 'indoor' && payload.place !== 'outdoor') ||
        !finite(payload.elapsed) ||
        !finite(payload.distanceMeters)
      ) {
        return state;
      }
      if (
        state.run?.runId === payload.runId &&
        finite(payload.sentAt) &&
        payload.sentAt < state.run.sentAt
      ) {
        return state;
      }
      return {
        // The watch answering the request settles it, whichever run it is.
        pending:
          state.pending && state.pending.requestId === payload.requestId
            ? null
            : state.pending,
        run: {
          runId: payload.runId,
          kind: payload.kind,
          place: payload.place,
          status: payload.status,
          autoPaused: Boolean(payload.autoPaused),
          autoPause:
            typeof payload.autoPause === 'boolean' ? payload.autoPause : null,
          voiceCues:
            typeof payload.voiceCues === 'boolean' ? payload.voiceCues : null,
          paceAlert:
            typeof payload.paceAlert === 'boolean' ? payload.paceAlert : null,
          heartRateAlert:
            typeof payload.heartRateAlert === 'boolean'
              ? payload.heartRateAlert
              : null,
          elapsed: Math.max(0, payload.elapsed),
          distanceMeters: Math.max(0, payload.distanceMeters),
          heartRate:
            finite(payload.heartRate) && payload.heartRate > 0
              ? payload.heartRate
              : null,
          energyKcal: finite(payload.energyKcal) ? payload.energyKcal : 0,
          lapCount: finite(payload.lapCount) ? payload.lapCount : 0,
          stepLabel: payload.stepLabel ?? null,
          stepRemaining: finite(payload.stepRemaining)
            ? payload.stepRemaining
            : null,
          nextLabel: payload.nextLabel ?? null,
          sentAt: finite(payload.sentAt) ? payload.sentAt : receivedAt,
          receivedAt,
        },
      };
    }),
  clear: () => set({ run: null, pending: null }),
}));

/** The clock and step countdown now, counted on from when the message came. */
export interface WatchRunNow extends WatchRunLive {
  elapsedNow: number;
  stepRemainingNow: number | null;
}

/**
 * The run the watch is recording, with its clock moved on locally between
 * messages (only while it is running), or null when there is none or the
 * watch has gone quiet. Re-renders once a second while a run shows.
 */
export function useWatchRunLive(): WatchRunNow | null {
  const run = useWatchRunLiveStore((s) => s.run);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!run) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [run]);

  if (!run) return null;
  const age = Math.max(0, now - run.receivedAt);
  if (age > WATCH_RUN_LIVE_MAX_AGE_MS) return null;
  const sinceSeconds = run.status === 'running' ? age / 1000 : 0;
  return {
    ...run,
    elapsedNow: run.elapsed + sinceSeconds,
    stepRemainingNow:
      run.stepRemaining == null
        ? null
        : Math.max(0, run.stepRemaining - sinceSeconds),
  };
}

/** Whether a live run is showing, without re-rendering every second. */
export function useHasWatchRunLive(): boolean {
  return useWatchRunLiveStore((s) => s.run != null);
}

/**
 * The start request the watch has not answered yet, or null once it has, was
 * cancelled, or has waited too long (the watch is off the wrist or out of
 * range; the request stays queued and the run still starts when it wakes).
 */
export function useWatchRunPending(): WatchRunPending | null {
  const pending = useWatchRunLiveStore((s) => s.pending);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pending]);

  if (!pending || now - pending.at > WATCH_RUN_PENDING_MAX_AGE_MS) return null;
  return pending;
}
