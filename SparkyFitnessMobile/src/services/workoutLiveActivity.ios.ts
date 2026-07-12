import type { LiveActivity } from 'expo-widgets';
import { useActiveWorkoutStore, type ActiveWorkoutState } from '../stores/activeWorkoutStore';
import {
  describeActiveSet,
  formatElapsed,
  formatRestCountdown,
} from '../utils/workoutSession';
import { createConcurrencyLimiter } from '../utils/concurrency';
import { addLog } from './LogService';
import WorkoutLiveActivityFactory, {
  type WorkoutLiveActivityProps,
} from './WorkoutLiveActivityLayout';

/**
 * Keeps the workout Live Activity (Lock Screen + Dynamic Island) in sync with
 * the active-workout store. Display-only: the OS ticks the elapsed/rest timers
 * from the absolute timestamps in the props, so no polling or background
 * updates are needed; the app only pushes an update when the workout state
 * actually changes shape (set advance, rest start/pause/adjust, rename, end).
 *
 * A failure to start/update/end the activity must never break the workout
 * flow — every operation is caught and logged.
 */

const ACTIVE_WORKOUT_URL = 'sparkyfitnessmobile://active-workout';

let initialized = false;
let reconciled = false;
let unsubscribeStore: (() => void) | null = null;
let unsubscribeHydration: (() => void) | null = null;
let activity: LiveActivity<WorkoutLiveActivityProps> | null = null;
let lastSentProps: WorkoutLiveActivityProps | null = null;

/**
 * Serial queue for all activity operations. `start`/`update`/`end` are async
 * native calls; rapid pause/resume/adjust/clear must reach the native layer
 * in order, and a rejected op must not wedge the ones behind it.
 */
let enqueue = createConcurrencyLimiter(1);

function logActivityError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  void addLog(`[WorkoutLiveActivity] ${context}: ${message}`, 'ERROR');
}

/**
 * Derive the Live Activity props from store state, or null when no activity
 * should be shown. Pure function of state — the frozen `elapsedLabel` for a
 * completed workout comes from the newest completion timestamp (not "now"),
 * so recomputation after a relaunch or autosave can't extend the clock.
 */
export function computeWorkoutLiveActivityProps(
  state: Pick<
    ActiveWorkoutState,
    'sessionId' | 'session' | 'startedAt' | 'steps' | 'completedSetIds' | 'activeSetId' | 'rest'
  >,
): WorkoutLiveActivityProps | null {
  const { sessionId, session, startedAt, steps, completedSetIds, activeSetId, rest } = state;
  if (sessionId == null || startedAt == null) return null;

  const workoutName = session?.name ?? 'Workout';

  // A null cursor with steps means every set is logged. An empty live-start
  // workout (no exercises yet) also has a null cursor but is just beginning —
  // keep its clock running.
  if (activeSetId == null && steps.length > 0) {
    const completedTimes = Object.values(completedSetIds);
    const frozenAt = completedTimes.length > 0 ? Math.max(...completedTimes) : startedAt;
    return {
      workoutName,
      startedAt,
      phase: 'complete',
      restStartedAt: null,
      restEndsAt: null,
      pausedRemainingLabel: null,
      setLine: null,
      elapsedLabel: formatElapsed(startedAt, frozenAt),
    };
  }

  const desc = describeActiveSet(session, activeSetId);
  const setLine = desc
    ? `${desc.exerciseName ?? 'Exercise'} · Set ${desc.setNumber} of ${desc.setCount}`
    : null;

  if (rest.state === 'resting' && rest.endsAt != null) {
    return {
      workoutName,
      startedAt,
      phase: 'resting',
      restStartedAt: rest.endsAt - rest.durationSec * 1000,
      restEndsAt: rest.endsAt,
      pausedRemainingLabel: null,
      setLine,
      elapsedLabel: null,
    };
  }

  if (rest.state === 'paused' && rest.pausedRemainingMs != null) {
    return {
      workoutName,
      startedAt,
      phase: 'paused',
      restStartedAt: null,
      restEndsAt: null,
      pausedRemainingLabel: formatRestCountdown(rest.pausedRemainingMs),
      setLine,
      elapsedLabel: null,
    };
  }

  return {
    workoutName,
    startedAt,
    phase: 'active',
    restStartedAt: null,
    restEndsAt: null,
    pausedRemainingLabel: null,
    setLine,
    elapsedLabel: null,
  };
}

function propsEqual(a: WorkoutLiveActivityProps, b: WorkoutLiveActivityProps): boolean {
  return (
    a.workoutName === b.workoutName &&
    a.startedAt === b.startedAt &&
    a.phase === b.phase &&
    a.restStartedAt === b.restStartedAt &&
    a.restEndsAt === b.restEndsAt &&
    a.pausedRemainingLabel === b.pausedRemainingLabel &&
    a.setLine === b.setLine &&
    a.elapsedLabel === b.elapsedLabel
  );
}

/**
 * Bring the activity in line with `props` (null = no workout → end it).
 * Runs only inside the serial queue. Starting workout B over a still-live
 * workout A goes through the update path on purpose — repainting the same
 * activity avoids an end+start flicker.
 */
async function applyProps(props: WorkoutLiveActivityProps | null): Promise<void> {
  // State only advances after each native call succeeds, so a rejected op
  // leaves the service ready to retry on the next state change instead of
  // believing the send landed.
  if (props == null) {
    if (activity == null) return;
    await activity.end('immediate');
    activity = null;
    lastSentProps = null;
    return;
  }
  if (activity == null) {
    activity = WorkoutLiveActivityFactory.start(props, ACTIVE_WORKOUT_URL);
    lastSentProps = props;
    return;
  }
  if (lastSentProps != null && propsEqual(props, lastSentProps)) return;
  await activity.update(props);
  lastSentProps = props;
}

/** Queue a sync that reads the latest store state when it actually runs. */
function syncFromState(): void {
  void enqueue(async () => {
    await applyProps(computeWorkoutLiveActivityProps(useActiveWorkoutStore.getState()));
  }).catch((error) => logActivityError('sync failed', error));
}

/**
 * Adopt or clean up activities that outlived the app process (force-quit
 * mid-workout, crash). Must not run before persist rehydration — a still-empty
 * store would end a force-quit user's legitimate activity.
 */
async function reconcileInstances(): Promise<void> {
  const instances = WorkoutLiveActivityFactory.getInstances();
  const props = computeWorkoutLiveActivityProps(useActiveWorkoutStore.getState());

  if (props == null) {
    for (const instance of instances) {
      await instance.end('immediate');
    }
  } else if (instances.length > 0) {
    activity = instances[0];
    for (const extra of instances.slice(1)) {
      await extra.end('immediate');
    }
    await activity.update(props);
    lastSentProps = props;
  } else {
    activity = WorkoutLiveActivityFactory.start(props, ACTIVE_WORKOUT_URL);
    lastSentProps = props;
  }
  reconciled = true;
}

function startReconcile(): void {
  void enqueue(reconcileInstances).catch((error) => {
    // Unblock the subscriber even when reconcile fails, so a later state
    // change can still drive the activity.
    reconciled = true;
    logActivityError('reconcile failed', error);
  });
  // Queued behind the reconcile: folds in any state change that landed while
  // it was running (the subscriber drops events until `reconciled` flips).
  syncFromState();
}

/**
 * Wire the Live Activity to the store. Called once from App startup; the
 * init-once guard makes the Fast Refresh re-run of the startup effect a no-op.
 * Subscribes synchronously but holds all activity operations until persist
 * hydration and the instance reconcile have completed — otherwise the
 * rehydration setState (null → session) would start a fresh activity before
 * the reconcile could adopt a force-quit leftover, yielding duplicates.
 */
export async function initWorkoutLiveActivity(): Promise<void> {
  if (initialized) return;
  initialized = true;

  unsubscribeStore = useActiveWorkoutStore.subscribe((state, prevState) => {
    if (!reconciled) return;
    if (
      state.sessionId === prevState.sessionId &&
      state.session === prevState.session &&
      state.startedAt === prevState.startedAt &&
      state.activeSetId === prevState.activeSetId &&
      state.rest === prevState.rest &&
      state.completedSetIds === prevState.completedSetIds
    ) {
      return;
    }
    syncFromState();
  });

  const persistApi = useActiveWorkoutStore.persist;
  if (persistApi.hasHydrated()) {
    startReconcile();
  } else {
    unsubscribeHydration = persistApi.onFinishHydration(() => {
      unsubscribeHydration?.();
      unsubscribeHydration = null;
      startReconcile();
    });
  }
}

/**
 * Test-only helper — drops the subscription and all module state so cases
 * can't bleed last-sent props or the adopted instance into each other.
 */
export function __resetWorkoutLiveActivityForTests(): void {
  unsubscribeStore?.();
  unsubscribeStore = null;
  unsubscribeHydration?.();
  unsubscribeHydration = null;
  initialized = false;
  reconciled = false;
  activity = null;
  lastSentProps = null;
  enqueue = createConcurrencyLimiter(1);
}
