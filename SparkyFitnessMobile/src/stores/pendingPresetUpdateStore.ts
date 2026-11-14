import { create } from 'zustand';
import type { WorkoutCelebration } from '../utils/workoutCelebration';

/**
 * A workout the wearer finished on the watch while the phone was somewhere
 * other than the Active Workout screen. It never reached the completion
 * screen, so its "Update preset?" check waits here until the app shows the
 * prompt. Kept in memory only: it is a one-time question, not data.
 */
export interface PendingPresetUpdate {
  celebration: WorkoutCelebration;
  /** The watch's id for the workout, to match its answer. */
  sessionId: string;
}

/** How long the phone holds its own "Update preset?" prompt for a watch summary. */
export const WATCH_PRESET_ANSWER_TIMEOUT_MS = 10 * 60 * 1000;

interface PendingPresetUpdateState {
  pending: PendingPresetUpdate | null;
  /** Finishes that arrived while a prompt was already waiting. */
  pendingQueue: PendingPresetUpdate[];
  /**
   * What the wearer answered on the watch's "Update Workout?" question, by the
   * watch's workout id. It is asked when Finish is tapped, so it can arrive
   * before or after the finished workout does.
   */
  answers: Record<string, boolean>;
  /**
   * Workouts whose watch summary is open with the question on it, by the
   * watch's workout id, and when the watch said so. The phone holds its own
   * prompt for them until the answer arrives or the timeout passes.
   */
  waiting: Record<string, number>;
  setPending: (pending: PendingPresetUpdate) => void;
  clearPending: () => void;
  setAnswer: (sessionId: string, update: boolean) => void;
  setWaiting: (sessionId: string) => void;
  clearWaiting: (sessionId: string) => void;
  clearAnswer: (sessionId: string) => void;
}

export const usePendingPresetUpdateStore = create<PendingPresetUpdateState>(
  (set) => ({
    pending: null,
    pendingQueue: [],
    answers: {},
    waiting: {},
    setPending: (pending) =>
      set((state) =>
        state.pending == null
          ? { pending }
          : { pendingQueue: [...state.pendingQueue, pending] }
      ),
    clearPending: () =>
      set((state) => ({
        pending: state.pendingQueue[0] ?? null,
        pendingQueue: state.pendingQueue.slice(1),
      })),
    setAnswer: (sessionId, update) =>
      set((state) => {
        const { [sessionId]: _waited, ...waiting } = state.waiting;
        return { answers: { ...state.answers, [sessionId]: update }, waiting };
      }),
    setWaiting: (sessionId) =>
      set((state) => ({
        waiting: { ...state.waiting, [sessionId]: Date.now() },
      })),
    clearWaiting: (sessionId) =>
      set((state) => {
        const { [sessionId]: _removed, ...rest } = state.waiting;
        return { waiting: rest };
      }),
    clearAnswer: (sessionId) =>
      set((state) => {
        const { [sessionId]: _removed, ...rest } = state.answers;
        return { answers: rest };
      }),
  })
);
