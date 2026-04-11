import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { PresetSessionResponse } from '@workspace/shared';
import {
  cancelScheduledNotification,
  fireRestCompleteHaptic,
  scheduleRestNotification,
} from '../services/notifications';

const DEFAULT_REST_SEC = 90;
const STORAGE_KEY = '@SparkyFitness/active-workout';

/** Monotonic counter used to reject stale async schedule resolutions. */
let restInstanceCounter = 0;

export interface WorkoutStep {
  exerciseId: string;
  setId: string;
  exerciseName: string;
  exerciseImage: string | null;
  restSec: number;
}

/**
 * Rest-timer state for the currently-active workout. The rest always
 * represents "the rest period before `activeSetId`" — i.e., when the user
 * completes a set, `activeSetId` immediately advances to the next set and
 * `rest` starts counting down the break before that next set.
 *
 * - `ready`   — no rest timer running; user is ready to tap the active set
 * - `resting` — rest timer counting down before the active set
 * - `paused`  — rest timer paused before the active set
 */
export interface Rest {
  state: 'ready' | 'resting' | 'paused';
  durationSec: number;
  /** Absolute deadline (ms since epoch). Non-null only while `state === 'resting'`. */
  endsAt: number | null;
  /** Remaining ms captured at pause. Non-null only while `state === 'paused'`. */
  pausedRemainingMs: number | null;
  scheduledNotificationId: string | null;
  instanceToken: number;
}

const READY_REST: Rest = {
  state: 'ready',
  durationSec: 0,
  endsAt: null,
  pausedRemainingMs: null,
  scheduledNotificationId: null,
  instanceToken: 0,
};

export interface ActiveWorkoutState {
  sessionId: string | null;
  /**
   * Full session snapshot for the currently-active workout. Persisted alongside
   * `steps` so the HUD can reopen WorkoutDetail after a cold start or from
   * screens where the history cache hasn't been warmed yet.
   */
  session: PresetSessionResponse | null;
  steps: WorkoutStep[];
  completedSetIds: Record<string, true>;
  /**
   * The set the user is currently on — the cursor advances strictly forward
   * through `steps`. `null` means the workout is finished (either every step
   * has been completed or there are no steps). `rest` is the rest period
   * before this set.
   */
  activeSetId: string | null;
  rest: Rest;

  startWorkout: (session: PresetSessionResponse) => void;
  startWorkoutAtSet: (session: PresetSessionResponse, setId: string) => void;
  /** Forward-only jump. Marks priors complete; no-op if target is before activeSetId. */
  jumpToSet: (setId: string) => void;
  clearWorkout: () => void;
  /** Complete the active set and advance the cursor. Starts rest before the next set. */
  completeActiveSet: () => void;
  /** Remove a set from the completed map. Does not move the cursor. */
  uncompleteSet: (setId: string) => void;
  /** Re-mark a set complete without advancing the cursor. Used to undo an accidental uncheck. */
  recompleteSet: (setId: string) => void;
  pauseRest: () => void;
  resumeRest: () => void;
  /** Skip the current rest — clears to 'ready' without advancing the cursor. */
  dismissRest: () => void;
  /** Guarded transition fired by the HUD tick when `endsAt` passes. */
  markRestReady: () => void;
  reconcileWithSession: (session: PresetSessionResponse) => void;
}

const initialData: Pick<
  ActiveWorkoutState,
  'sessionId' | 'session' | 'steps' | 'completedSetIds' | 'activeSetId' | 'rest'
> = {
  sessionId: null,
  session: null,
  steps: [],
  completedSetIds: {},
  activeSetId: null,
  rest: READY_REST,
};

function buildStepsFromSession(session: PresetSessionResponse): WorkoutStep[] {
  const steps: WorkoutStep[] = [];
  for (const exercise of session.exercises) {
    const exerciseName = exercise.exercise_snapshot?.name ?? 'Exercise';
    const exerciseImage = exercise.exercise_snapshot?.images?.[0] ?? null;
    const firstSet = exercise.sets[0];
    const restSec = firstSet?.rest_time ?? DEFAULT_REST_SEC;
    for (const set of exercise.sets) {
      steps.push({
        exerciseId: exercise.id,
        setId: String(set.id),
        exerciseName,
        exerciseImage,
        restSec,
      });
    }
  }
  return steps;
}

/**
 * Cancel any pending notification attached to the current rest. Safe to call
 * from any action that replaces or clears the rest state.
 */
function cancelCurrentRestNotification(rest: Rest): void {
  if (rest.scheduledNotificationId) {
    void cancelScheduledNotification(rest.scheduledNotificationId);
  }
}

/**
 * Start a rest timer for the step identified by `setId`, scheduling the local
 * notification and wiring up the stale-resolution guard on the returned
 * promise. Returns the new Rest value the caller should commit to state.
 */
function startRestForStep(steps: WorkoutStep[], setId: string): Rest {
  const step = steps.find((s) => s.setId === setId);
  const durationSec = step?.restSec ?? DEFAULT_REST_SEC;
  const token = ++restInstanceCounter;
  const endsAt = Date.now() + durationSec * 1000;

  const rest: Rest = {
    state: 'resting',
    durationSec,
    endsAt,
    pausedRemainingMs: null,
    scheduledNotificationId: null,
    instanceToken: token,
  };

  const exerciseName = step?.exerciseName ?? 'Rest';
  void scheduleRestNotification(exerciseName, durationSec).then((notifId) => {
    if (!notifId) return;
    const current = useActiveWorkoutStore.getState().rest;
    if (
      current.instanceToken === token &&
      current.state === 'resting' &&
      current.scheduledNotificationId === null
    ) {
      useActiveWorkoutStore.setState({
        rest: { ...current, scheduledNotificationId: notifId },
      });
    } else {
      // Rest was paused, cleared, dismissed, or replaced. Cancel the OS notification.
      void cancelScheduledNotification(notifId);
    }
  });

  return rest;
}

export const useActiveWorkoutStore = create<ActiveWorkoutState>()(
  persist(
    (set, get) => ({
      ...initialData,

      startWorkout: (session) => {
        cancelCurrentRestNotification(get().rest);
        const steps = buildStepsFromSession(session);
        set({
          sessionId: session.id,
          session,
          steps,
          completedSetIds: {},
          activeSetId: steps[0]?.setId ?? null,
          rest: READY_REST,
        });
      },

      startWorkoutAtSet: (session, setId) => {
        cancelCurrentRestNotification(get().rest);
        const steps = buildStepsFromSession(session);
        const targetIndex = steps.findIndex((s) => s.setId === setId);
        if (targetIndex < 0) return;

        const completedSetIds: Record<string, true> = {};
        for (let i = 0; i < targetIndex; i++) {
          completedSetIds[steps[i].setId] = true;
        }

        set({
          sessionId: session.id,
          session,
          steps,
          completedSetIds,
          activeSetId: setId,
          rest: READY_REST,
        });
      },

      jumpToSet: (setId) => {
        const state = get();
        if (state.sessionId == null) return;

        const targetIndex = state.steps.findIndex((s) => s.setId === setId);
        if (targetIndex < 0) return;

        const activeIndex =
          state.activeSetId == null
            ? -1
            : state.steps.findIndex((s) => s.setId === state.activeSetId);
        // Forward-only: reject backward jumps. Jumping to the active set is a
        // no-op (cursor stays, rest stays).
        if (activeIndex >= 0 && targetIndex < activeIndex) return;
        if (targetIndex === activeIndex) return;

        cancelCurrentRestNotification(state.rest);

        const completedSetIds: Record<string, true> = { ...state.completedSetIds };
        for (let i = 0; i < targetIndex; i++) {
          completedSetIds[state.steps[i].setId] = true;
        }

        set({
          completedSetIds,
          activeSetId: setId,
          rest: READY_REST,
        });
      },

      clearWorkout: () => {
        cancelCurrentRestNotification(get().rest);
        set({ ...initialData });
      },

      completeActiveSet: () => {
        const state = get();
        if (state.activeSetId == null) return;

        const activeIndex = state.steps.findIndex((s) => s.setId === state.activeSetId);
        if (activeIndex < 0) return;

        cancelCurrentRestNotification(state.rest);

        const completedSetIds = {
          ...state.completedSetIds,
          [state.activeSetId]: true as const,
        };

        const nextStep = state.steps[activeIndex + 1];
        if (!nextStep) {
          // Last set complete: workout is done. No final rest timer.
          set({
            completedSetIds,
            activeSetId: null,
            rest: READY_REST,
          });
          return;
        }

        set({
          completedSetIds,
          activeSetId: nextStep.setId,
          rest: startRestForStep(state.steps, nextStep.setId),
        });
      },

      uncompleteSet: (setId) => {
        const state = get();
        if (!state.completedSetIds[setId]) return;
        const next = { ...state.completedSetIds };
        delete next[setId];
        set({ completedSetIds: next });
      },

      recompleteSet: (setId) => {
        const state = get();
        if (state.completedSetIds[setId]) return;
        if (!state.steps.some((s) => s.setId === setId)) return;
        set({
          completedSetIds: { ...state.completedSetIds, [setId]: true },
        });
      },

      pauseRest: () => {
        const { rest } = get();
        if (rest.state !== 'resting' || rest.endsAt == null) return;
        cancelCurrentRestNotification(rest);
        set({
          rest: {
            ...rest,
            state: 'paused',
            endsAt: null,
            pausedRemainingMs: Math.max(0, rest.endsAt - Date.now()),
            scheduledNotificationId: null,
          },
        });
      },

      resumeRest: () => {
        const state = get();
        const { rest, steps, activeSetId } = state;
        if (rest.state !== 'paused' || rest.pausedRemainingMs == null) return;

        const remainingMs = rest.pausedRemainingMs;
        const endsAt = Date.now() + remainingMs;
        const token = ++restInstanceCounter;

        set({
          rest: {
            ...rest,
            state: 'resting',
            endsAt,
            pausedRemainingMs: null,
            scheduledNotificationId: null,
            instanceToken: token,
          },
        });

        const step = activeSetId != null ? steps.find((s) => s.setId === activeSetId) : null;
        const exerciseName = step?.exerciseName ?? 'Rest';
        const seconds = Math.max(1, Math.ceil(remainingMs / 1000));

        void scheduleRestNotification(exerciseName, seconds).then((notifId) => {
          if (!notifId) return;
          const current = useActiveWorkoutStore.getState().rest;
          if (
            current.instanceToken === token &&
            current.state === 'resting' &&
            current.scheduledNotificationId === null
          ) {
            useActiveWorkoutStore.setState({
              rest: { ...current, scheduledNotificationId: notifId },
            });
          } else {
            void cancelScheduledNotification(notifId);
          }
        });
      },

      markRestReady: () => {
        const { rest } = get();
        if (
          rest.state !== 'resting' ||
          rest.endsAt == null ||
          Date.now() < rest.endsAt
        ) {
          return;
        }
        cancelCurrentRestNotification(rest);
        set({ rest: READY_REST });
        fireRestCompleteHaptic();
      },

      dismissRest: () => {
        const { rest } = get();
        if (rest.state === 'ready') return;
        cancelCurrentRestNotification(rest);
        set({ rest: READY_REST });
      },

      reconcileWithSession: (session) => {
        const state = get();
        if (session.id !== state.sessionId) return;

        const newSteps = buildStepsFromSession(session);
        const newSetIds = new Set(newSteps.map((s) => s.setId));

        const nextCompleted: Record<string, true> = {};
        for (const id of Object.keys(state.completedSetIds)) {
          if (newSetIds.has(id)) nextCompleted[id] = true;
        }

        // If the cursor points at a set that no longer exists, fall back to
        // the first uncompleted step. If every remaining step is already
        // complete (or there are no steps), the workout is done → null.
        let nextActiveSetId = state.activeSetId;
        if (nextActiveSetId == null || !newSetIds.has(nextActiveSetId)) {
          const fallback = newSteps.find((s) => !nextCompleted[s.setId]);
          nextActiveSetId = fallback?.setId ?? null;
        }

        // If the cursor moved during reconcile, the old rest no longer
        // belongs to the active step — clear it.
        let nextRest = state.rest;
        if (nextActiveSetId !== state.activeSetId) {
          cancelCurrentRestNotification(state.rest);
          nextRest = READY_REST;
        }

        set({
          session,
          steps: newSteps,
          completedSetIds: nextCompleted,
          activeSetId: nextActiveSetId,
          rest: nextRest,
        });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        sessionId: state.sessionId,
        session: state.session,
        steps: state.steps,
        completedSetIds: state.completedSetIds,
        activeSetId: state.activeSetId,
        rest: state.rest,
      }),
      migrate: (persistedState, version) => {
        if (version >= 2 || !persistedState || typeof persistedState !== 'object') {
          return persistedState as ActiveWorkoutState;
        }

        // v1 → v2:
        //  - Split `activeRest` (which tracked "the rest after the just-
        //    completed set") into an `activeSetId` cursor (the *next* set)
        //    plus a `rest` object that sits before it.
        //  - Rename rest states: 'running' → 'resting', 'complete' → 'ready'.
        //  - Drop any final rest timer (v2 doesn't start one after the last
        //    set), which naturally falls out of "first uncompleted step".
        const v1 = persistedState as {
          sessionId?: string | null;
          session?: ActiveWorkoutState['session'];
          steps?: WorkoutStep[];
          completedSetIds?: Record<string, true>;
          activeRest?: {
            setId: string;
            state: 'running' | 'paused' | 'complete';
            durationSec: number;
            endsAt: number | null;
            pausedRemainingMs: number | null;
            scheduledNotificationId: string | null;
            instanceToken: number;
          } | null;
        };

        const steps = Array.isArray(v1.steps) ? v1.steps : [];
        const completedSetIds: Record<string, true> =
          v1.completedSetIds && typeof v1.completedSetIds === 'object'
            ? v1.completedSetIds
            : {};

        // The new cursor is the first uncompleted step. This matches what v1
        // implicitly computed at the call sites of "next pending set", so a
        // user mid-rest in v1 lands on the same set in v2.
        const nextStep = steps.find((s) => !completedSetIds[s.setId]);
        const activeSetId = nextStep?.setId ?? null;

        // Rest carries over only if (a) there's somewhere to point it and
        // (b) it wasn't already finished. 'complete' and null both collapse
        // to READY_REST — the user can just tap the next set.
        let rest: Rest = { ...READY_REST };
        const oldRest = v1.activeRest;
        if (oldRest && activeSetId != null) {
          if (oldRest.state === 'running') {
            rest = {
              state: 'resting',
              durationSec: oldRest.durationSec ?? 0,
              endsAt: oldRest.endsAt ?? null,
              pausedRemainingMs: null,
              scheduledNotificationId: oldRest.scheduledNotificationId ?? null,
              instanceToken: oldRest.instanceToken ?? 0,
            };
          } else if (oldRest.state === 'paused') {
            rest = {
              state: 'paused',
              durationSec: oldRest.durationSec ?? 0,
              endsAt: null,
              pausedRemainingMs: oldRest.pausedRemainingMs ?? null,
              scheduledNotificationId: null,
              instanceToken: oldRest.instanceToken ?? 0,
            };
          }
          // 'complete' → already ready; nothing to migrate.
        }

        return {
          ...initialData,
          sessionId: v1.sessionId ?? null,
          session: v1.session ?? null,
          steps,
          completedSetIds,
          activeSetId,
          rest,
        } as ActiveWorkoutState;
      },
      merge: (persisted, current) => {
        const merged = {
          ...current,
          ...(persisted as Partial<ActiveWorkoutState>),
        };
        // If rehydration brings back a running rest whose deadline has
        // already passed, snap it to 'ready'. The OS notification either
        // already fired or will never fire — no haptic here because the merge
        // path runs on cold start and a phantom buzz would be confusing.
        const r = merged.rest;
        if (r && r.state === 'resting' && r.endsAt != null && r.endsAt < Date.now()) {
          merged.rest = { ...READY_REST };
        }
        return merged;
      },
    },
  ),
);

/**
 * Test-only helper — resets store state to initial data while preserving
 * action references, and clears the persisted AsyncStorage entry.
 */
export function __resetActiveWorkoutStoreForTests(): void {
  restInstanceCounter = 0;
  useActiveWorkoutStore.setState({ ...initialData });
  void AsyncStorage.removeItem(STORAGE_KEY);
}
