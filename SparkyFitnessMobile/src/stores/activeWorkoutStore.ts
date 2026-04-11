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

export interface ActiveRest {
  setId: string;
  state: 'running' | 'paused' | 'complete';
  durationSec: number;
  endsAt: number | null;
  pausedRemainingMs: number | null;
  scheduledNotificationId: string | null;
  instanceToken: number;
}

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
  activeRest: ActiveRest | null;

  startWorkout: (session: PresetSessionResponse) => void;
  startWorkoutAtSet: (session: PresetSessionResponse, setId: string) => void;
  clearWorkout: () => void;
  toggleSetComplete: (setId: string) => void;
  pauseRest: () => void;
  resumeRest: () => void;
  dismissRest: () => boolean;
  markRestComplete: () => void;
  reconcileWithSession: (session: PresetSessionResponse) => void;
}

const initialData: Pick<
  ActiveWorkoutState,
  'sessionId' | 'session' | 'steps' | 'completedSetIds' | 'activeRest'
> = {
  sessionId: null,
  session: null,
  steps: [],
  completedSetIds: {},
  activeRest: null,
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

export const useActiveWorkoutStore = create<ActiveWorkoutState>()(
  persist(
    (set, get) => ({
      ...initialData,

      startWorkout: (session) => {
        const { activeRest } = get();
        if (activeRest?.scheduledNotificationId) {
          void cancelScheduledNotification(activeRest.scheduledNotificationId);
        }
        set({
          sessionId: session.id,
          session,
          steps: buildStepsFromSession(session),
          completedSetIds: {},
          activeRest: null,
        });
      },

      startWorkoutAtSet: (session, setId) => {
        const { activeRest } = get();
        if (activeRest?.scheduledNotificationId) {
          void cancelScheduledNotification(activeRest.scheduledNotificationId);
        }
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
          activeRest: null,
        });
      },

      clearWorkout: () => {
        const { activeRest } = get();
        if (activeRest?.scheduledNotificationId) {
          void cancelScheduledNotification(activeRest.scheduledNotificationId);
        }
        set({ ...initialData });
      },

      toggleSetComplete: (setId) => {
        const state = get();
        const step = state.steps.find((s) => s.setId === setId);
        if (!step) return;

        if (state.completedSetIds[setId]) {
          const next = { ...state.completedSetIds };
          delete next[setId];
          set({ completedSetIds: next });
          return;
        }

        if (state.activeRest?.scheduledNotificationId) {
          void cancelScheduledNotification(state.activeRest.scheduledNotificationId);
        }

        const token = ++restInstanceCounter;
        const durationSec = step.restSec;
        const endsAt = Date.now() + durationSec * 1000;

        set({
          completedSetIds: { ...state.completedSetIds, [setId]: true },
          activeRest: {
            setId,
            state: 'running',
            durationSec,
            endsAt,
            pausedRemainingMs: null,
            scheduledNotificationId: null,
            instanceToken: token,
          },
        });

        void scheduleRestNotification(step.exerciseName, durationSec).then((notifId) => {
          if (!notifId) return;
          const current = useActiveWorkoutStore.getState().activeRest;
          if (
            current &&
            current.instanceToken === token &&
            current.state === 'running' &&
            current.scheduledNotificationId === null
          ) {
            useActiveWorkoutStore.setState({
              activeRest: { ...current, scheduledNotificationId: notifId },
            });
          } else {
            // Rest was paused, cleared, dismissed, or replaced. Cancel the OS notification.
            void cancelScheduledNotification(notifId);
          }
        });
      },

      pauseRest: () => {
        const { activeRest } = get();
        if (!activeRest || activeRest.state !== 'running' || activeRest.endsAt == null) {
          return;
        }
        if (activeRest.scheduledNotificationId) {
          void cancelScheduledNotification(activeRest.scheduledNotificationId);
        }
        set({
          activeRest: {
            ...activeRest,
            state: 'paused',
            endsAt: null,
            pausedRemainingMs: Math.max(0, activeRest.endsAt - Date.now()),
            scheduledNotificationId: null,
          },
        });
      },

      resumeRest: () => {
        const { activeRest, steps } = get();
        if (
          !activeRest ||
          activeRest.state !== 'paused' ||
          activeRest.pausedRemainingMs == null
        ) {
          return;
        }
        const remainingMs = activeRest.pausedRemainingMs;
        const endsAt = Date.now() + remainingMs;
        const token = ++restInstanceCounter;

        set({
          activeRest: {
            ...activeRest,
            state: 'running',
            endsAt,
            pausedRemainingMs: null,
            scheduledNotificationId: null,
            instanceToken: token,
          },
        });

        const step = steps.find((s) => s.setId === activeRest.setId);
        const exerciseName = step?.exerciseName ?? 'Rest';
        const seconds = Math.max(1, Math.ceil(remainingMs / 1000));

        void scheduleRestNotification(exerciseName, seconds).then((notifId) => {
          if (!notifId) return;
          const current = useActiveWorkoutStore.getState().activeRest;
          if (
            current &&
            current.instanceToken === token &&
            current.state === 'running' &&
            current.scheduledNotificationId === null
          ) {
            useActiveWorkoutStore.setState({
              activeRest: { ...current, scheduledNotificationId: notifId },
            });
          } else {
            void cancelScheduledNotification(notifId);
          }
        });
      },

      markRestComplete: () => {
        const { activeRest } = get();
        if (
          !activeRest ||
          activeRest.state !== 'running' ||
          activeRest.endsAt == null ||
          Date.now() < activeRest.endsAt
        ) {
          return;
        }
        if (activeRest.scheduledNotificationId) {
          void cancelScheduledNotification(activeRest.scheduledNotificationId);
        }
        set({
          activeRest: {
            ...activeRest,
            state: 'complete',
            endsAt: null,
            scheduledNotificationId: null,
          },
        });
        fireRestCompleteHaptic();
      },

      dismissRest: () => {
        const state = get();
        if (!state.activeRest) return false;
        if (state.activeRest.scheduledNotificationId) {
          void cancelScheduledNotification(state.activeRest.scheduledNotificationId);
        }

        const allComplete =
          state.steps.length > 0 &&
          state.steps.every((s) => state.completedSetIds[s.setId]);

        if (allComplete) {
          set({ ...initialData });
          return true;
        }

        set({ activeRest: null });
        return false;
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

        let nextActiveRest = state.activeRest;
        if (nextActiveRest && !newSetIds.has(nextActiveRest.setId)) {
          if (nextActiveRest.scheduledNotificationId) {
            void cancelScheduledNotification(nextActiveRest.scheduledNotificationId);
          }
          nextActiveRest = null;
        }

        set({
          session,
          steps: newSteps,
          completedSetIds: nextCompleted,
          activeRest: nextActiveRest,
        });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        sessionId: state.sessionId,
        session: state.session,
        steps: state.steps,
        completedSetIds: state.completedSetIds,
        activeRest: state.activeRest,
      }),
      merge: (persisted, current) => {
        const merged = {
          ...current,
          ...(persisted as Partial<ActiveWorkoutState>),
        };
        const r = merged.activeRest;
        if (r && r.state === 'running' && r.endsAt != null && r.endsAt < Date.now()) {
          merged.activeRest = {
            ...r,
            state: 'complete',
            endsAt: null,
            scheduledNotificationId: null,
          };
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
