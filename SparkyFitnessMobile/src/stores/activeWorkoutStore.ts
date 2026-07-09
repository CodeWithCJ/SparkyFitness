import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  ExerciseEntryResponse,
  ExerciseEntrySetResponse,
  ExerciseSnapshotResponse,
  PresetSessionResponse,
} from '@workspace/shared';
import type { Exercise } from '../types/exercise';
import {
  DEFAULT_REST_SEC,
  TEMP_EXERCISE_ENTRY_ID_PREFIX,
  getSupersetRuns,
  isPrSet,
  isTempExerciseEntryId,
  moveSessionExerciseItem,
  normalizeSessionSupersetGroups,
  seedPrFromSession,
  supersetSessionExercises,
  ungroupSessionExercise,
} from '../utils/workoutSession';
import type { PrBaselineEntry } from '../utils/workoutSession';
import {
  cancelScheduledNotification,
  fireRestCompleteHaptic,
  scheduleRestNotification,
} from '../services/notifications';
import { fireSelectionHaptic, fireSuccessHaptic } from '../services/haptics';

const STORAGE_KEY = '@SparkyFitness/active-workout';

/** Monotonic counter used to reject stale async schedule resolutions. */
let restInstanceCounter = 0;

/**
 * Monotonic counter stamped onto each `lastPrEvent`. The celebration listener
 * keys its effect on this so one PR fires exactly one toast — and, since the
 * counter and `lastPrEvent` are both transient (never persisted), a cold start
 * can't replay a stale celebration.
 */
let prEventCounter = 0;

export interface WorkoutStep {
  exerciseId: string;
  setId: string;
  exerciseName: string;
  exerciseImage: string | null;
  restSec: number;
}

/**
 * Completed set ids → epoch-ms timestamp of when the set was checked off.
 * This map is the local source of truth for completion during an active
 * workout; the autosave payload derives each set's `completed_at` from it.
 */
export type CompletedSetMap = Record<string, number>;

/**
 * Set ids (stringified) that earned a PR this session → `true`. Mirrors the
 * `completedSetIds` map: seeded from the server's `is_pr` flags on start,
 * merged into the autosave payload at build time (a missing key sends
 * `false`, so unchecking a PR set clears it server-side).
 */
export type PrSetMap = Record<string, true>;

/**
 * Transient one-shot describing the most recent PR, consumed by the
 * celebration toast listener. Excluded from `partialize` so a cold start never
 * replays it. `weightKg` is metric (the toast converts for display); `seq`
 * makes each event distinct so the listener fires once per PR.
 */
export interface PrEvent {
  setId: string;
  exerciseName: string;
  weightKg: number;
  reps: number | null;
  seq: number;
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
  /** Epoch ms when the workout was started. Drives the elapsed clock. */
  startedAt: number | null;
  steps: WorkoutStep[];
  completedSetIds: CompletedSetMap;
  /**
   * The set the user is currently on — the cursor advances strictly forward
   * through `steps`. `null` means the workout is finished (either every step
   * has been completed or there are no steps). `rest` is the rest period
   * before this set.
   */
  activeSetId: string | null;
  rest: Rest;
  /**
   * Transient monotonic counter bumped on every local session edit (and on
   * `reconcileWithSession`). The autosave hook captures it at send time and
   * hands it back to `applyServerSession` so a response can tell whether
   * edits landed while the request was in flight.
   */
  sessionRevision: number;
  /**
   * True while local session edits haven't been confirmed saved. Persisted so
   * edits made just before a cold exit are flushed on next launch.
   */
  hasUnsavedChanges: boolean;
  /**
   * True when the session was created by a live-start flow (instant preset
   * start / empty start) rather than pre-existing in the diary. Discarding
   * such a workout deletes the session instead of leaving it behind.
   * Persisted so the distinction survives a cold-start resume.
   */
  createdByLiveStart: boolean;
  /**
   * Per-exercise historical best captured once at the start of the session
   * (keyed by `exercise_id`). Key absent = not yet captured; `null` = captured
   * with no history (first-ever exercise). The PR baseline is a store snapshot
   * because detection needs synchronous access; the stats query that fills it
   * excludes this session server-side, so it stays historical. Persisted so a
   * resumed workout keeps a clean baseline.
   */
  prBaseline: Record<string, PrBaselineEntry | null>;
  /** Set ids that earned a PR this session. Persisted; see {@link PrSetMap}. */
  prSetIds: PrSetMap;
  /**
   * Transient last-PR one-shot for the celebration listener. NOT persisted —
   * see {@link PrEvent}.
   */
  lastPrEvent: PrEvent | null;

  startWorkout: (
    session: PresetSessionResponse,
    opts?: { createdByLiveStart?: boolean },
  ) => void;
  startWorkoutAtSet: (session: PresetSessionResponse, setId: string) => void;
  /**
   * Capture the historical PR baseline for an exercise, once. No-op unless a
   * live workout is active and the key is absent — so view/edit renders of the
   * card (which also mount it) can't overwrite it, and idempotency holds even
   * if the stats query resolves twice. `baseline` is the server best (session
   * excluded) or `null` when the exercise has no history.
   */
  capturePrBaseline: (exerciseId: string, baseline: PrBaselineEntry | null) => void;
  clearWorkout: () => void;
  /**
   * Complete any set — not just the cursor — and move the next-up highlight to
   * the set right after it, starting the rest before that set. Sets log in any
   * order, so this can leave earlier sets unchecked (holes); each hole stays
   * re-loggable from its own row control.
   */
  completeSet: (setId: string) => void;
  /** Complete the current cursor set. Thin wrapper over {@link completeSet}. */
  completeActiveSet: () => void;
  /**
   * Un-complete a set (undo): drop its completion timestamp and PR stamp. The
   * cursor stays put — every set is independently loggable, so the reopened set
   * is re-logged from its own row control — except when the workout had already
   * finished (no active set), where reopening re-anchors the next-up onto it.
   */
  uncompleteSet: (setId: string) => void;
  /**
   * Un-complete every set of one exercise (checkmarks only; the sets and their
   * values are kept). Restores the cursor invariant like {@link uncompleteSet}.
   */
  clearExerciseCompletions: (entryId: string) => void;
  /** Un-complete every set in the workout and rewind the cursor to the first step. */
  clearAllCompletions: () => void;
  pauseRest: () => void;
  resumeRest: () => void;
  /**
   * Add/remove seconds on the current rest. Resting → shifts the deadline and
   * reschedules the notification; crossing zero behaves like `markRestReady`.
   * Paused → adjusts the captured remaining time. Ready → no-op.
   */
  adjustRest: (deltaSec: number) => void;
  /** Skip the current rest — clears to 'ready' without advancing the cursor. */
  dismissRest: () => void;
  /** Guarded transition fired by the HUD tick when `endsAt` passes. */
  markRestReady: () => void;
  reconcileWithSession: (session: PresetSessionResponse) => void;

  /** Patch value fields on a set. Weight is in kg — UI converts before calling. */
  updateSetField: (setId: string, patch: ActiveSetPatch) => void;
  /** Append a set to an exercise, cloning the last set's plan. Uses a negative temp id. */
  addSetToExercise: (entryId: string) => void;
  /**
   * Delete a set, renumbering the rest. Deleting an exercise's last remaining
   * set removes the exercise from the session entirely.
   */
  deleteSet: (setId: string) => void;
  /**
   * Set rest_time on every set of an exercise. For a superset member the
   * write covers every set of every member — rest is per-round, so the
   * chips must stay in agreement.
   */
  setExerciseRest: (entryId: string, seconds: number) => void;
  /**
   * Rename the live session. A no-op for an empty or unchanged name; otherwise
   * marks the session dirty so autosave persists the new name to the server.
   */
  renameSession: (name: string) => void;
  /** Append a client-built exercise entry (temp string id) with one default set. */
  addExercise: (exercise: Exercise) => void;
  /**
   * Delete an exercise entry entirely, reconciling steps, completion/PR maps,
   * cursor, rest, and superset grouping (a leftover 1-member group dissolves).
   */
  removeExercise: (entryId: string) => void;
  /**
   * Swap an entry's exercise for another, resetting it to a single default set
   * (the old sets no longer describe the new movement). The entry keeps its
   * position and superset grouping.
   */
  replaceExercise: (entryId: string, exercise: Exercise) => void;
  /**
   * Superset `picked` with `current`: create a group of the two, or add
   * `picked` as a member of current's existing group. `picked` moves to sit
   * immediately after the last member of current's run, and every member's
   * rest_time is harmonized to the anchor's (deliberately lossy — rest is
   * per-round). `picked` must be ungrouped; grouped exercises must be
   * ungrouped first.
   */
  supersetWith: (currentEntryId: string, pickedEntryId: string) => void;
  /**
   * Remove an exercise from its superset. A middle member also moves to
   * just after the run so the remaining members stay adjacent; a remaining
   * 1-member group is dissolved by normalization.
   */
  ungroupExercise: (entryId: string) => void;
  /**
   * Reorder exercises by draggable item — a solo exercise or a whole superset
   * run, which moves as one indivisible block. `fromItemIndex`/`toItemIndex`
   * index the item list from `buildExerciseReorderItems`. A no-op / out-of-range
   * move or a null session leaves state untouched.
   */
  reorderExercises: (fromItemIndex: number, toItemIndex: number) => void;
  /**
   * Fold an autosave response back into the store. `sentRevision` is the
   * `sessionRevision` captured when the request's payload was built: if no
   * edits landed mid-flight the server session is adopted wholesale (and the
   * dirty flag cleared); otherwise only server ids are grafted positionally
   * into the local session, which keeps its newer values and stays dirty.
   * `sentEntryIds` is the exercise-entry id order captured at the same
   * moment: a mid-flight reorder or delete breaks the positional graft, so
   * the graft is skipped when the local prefix no longer matches (the still-
   * dirty session is resent by the pending debounce or trailing save).
   */
  applyServerSession: (
    serverSession: PresetSessionResponse,
    sentRevision: number,
    sentEntryIds: string[],
  ) => void;
}

/** Fields the active-workout screen can edit on a set. */
export type ActiveSetPatch = Partial<
  Pick<ExerciseEntrySetResponse, 'weight' | 'reps' | 'rpe' | 'set_type'>
>;

const initialData: Pick<
  ActiveWorkoutState,
  | 'sessionId'
  | 'session'
  | 'startedAt'
  | 'steps'
  | 'completedSetIds'
  | 'activeSetId'
  | 'rest'
  | 'sessionRevision'
  | 'hasUnsavedChanges'
  | 'createdByLiveStart'
  | 'prBaseline'
  | 'prSetIds'
  | 'lastPrEvent'
> = {
  sessionId: null,
  session: null,
  startedAt: null,
  steps: [],
  completedSetIds: {},
  activeSetId: null,
  rest: READY_REST,
  sessionRevision: 0,
  hasUnsavedChanges: false,
  createdByLiveStart: false,
  prBaseline: {},
  prSetIds: {},
  lastPrEvent: null,
};

/**
 * Flatten a session into the step sequence the cursor walks.
 *
 * Solo exercises contribute one step per set. Superset runs (adjacent 2+
 * exercises sharing a `superset_group`) are interleaved into rounds: round
 * `n` is one set of each member in order (positional — members whose sets
 * are exhausted drop out). `restSec` is the rest taken *before* a step, so
 * each round's first step carries the group rest and the rest of the round
 * carries 0 — rest happens after a full round, not between partners.
 */
export function buildStepsFromSession(session: PresetSessionResponse): WorkoutStep[] {
  const steps: WorkoutStep[] = [];
  const runByFirstEntryId = new Map(
    getSupersetRuns(session.exercises).map((run) => [run.entryIds[0], run]),
  );
  const byEntryId = new Map(session.exercises.map((e) => [e.id, e]));
  const consumed = new Set<string>();

  const pushStep = (exercise: ExerciseEntryResponse, setId: number, restSec: number) => {
    steps.push({
      exerciseId: exercise.id,
      setId: String(setId),
      exerciseName: exercise.exercise_snapshot?.name ?? 'Exercise',
      exerciseImage: exercise.exercise_snapshot?.images?.[0] ?? null,
      restSec,
    });
  };

  for (const exercise of session.exercises) {
    if (consumed.has(exercise.id)) continue;

    const run = runByFirstEntryId.get(exercise.id);
    if (!run) {
      const restSec = exercise.sets[0]?.rest_time ?? DEFAULT_REST_SEC;
      for (const set of exercise.sets) {
        pushStep(exercise, set.id, restSec);
      }
      continue;
    }

    const members = run.entryIds.map((id) => byEntryId.get(id)!);
    for (const id of run.entryIds) consumed.add(id);

    // Rest is per-round; group actions harmonize every member's rest_time,
    // so the anchor's first set speaks for the whole group.
    const groupRest = members[0].sets[0]?.rest_time ?? DEFAULT_REST_SEC;
    const roundCount = Math.max(...members.map((m) => m.sets.length));
    for (let round = 0; round < roundCount; round++) {
      let firstInRound = true;
      for (const member of members) {
        const set = member.sets[round];
        if (!set) continue;
        pushStep(member, set.id, firstInRound ? groupRest : 0);
        firstInRound = false;
      }
    }
  }
  return steps;
}

/**
 * Map local set ids → server set ids by position (exercise index, set index).
 *
 * Valid because the autosave payload preserves order and the server recreates
 * in order. Most shape-changing edits are append-only (`addSet`/`addExercise`
 * append, `deleteSet` shifts down), but `supersetWith`/`ungroupExercise` can
 * reorder exercises — so `applyServerSession` guards its graft branch by
 * comparing the local entry-id prefix against the ids captured at send time
 * and skips the graft (staying dirty) when they diverge.
 *
 * Positions beyond the shorter side are unmapped — callers keep the local id
 * (temp ids re-save on the next autosave; id churn only, no data loss).
 */
export function buildPositionalSetIdMap(
  local: PresetSessionResponse,
  server: PresetSessionResponse,
): Map<string, string> {
  const map = new Map<string, string>();
  const exerciseCount = Math.min(local.exercises.length, server.exercises.length);
  for (let i = 0; i < exerciseCount; i++) {
    const localSets = local.exercises[i].sets;
    const serverSets = server.exercises[i].sets;
    const setCount = Math.min(localSets.length, serverSets.length);
    for (let j = 0; j < setCount; j++) {
      map.set(String(localSets[j].id), String(serverSets[j].id));
    }
  }
  return map;
}

/**
 * Return a copy of `local` whose exercise and set ids are replaced by the ids
 * the server assigned at the same positions. Local values (weight/reps/etc.)
 * are kept untouched; entries beyond the server response length keep their
 * (temp) ids. See `buildPositionalSetIdMap` for why positional is safe.
 */
export function graftServerSessionIds(
  local: PresetSessionResponse,
  server: PresetSessionResponse,
): PresetSessionResponse {
  return {
    ...local,
    exercises: local.exercises.map((exercise, i) => {
      const serverExercise = server.exercises[i];
      if (!serverExercise) return exercise;
      return {
        ...exercise,
        id: serverExercise.id,
        sets: exercise.sets.map((set, j) => {
          const serverSet = serverExercise.sets[j];
          return serverSet ? { ...set, id: serverSet.id } : set;
        }),
      };
    }),
  };
}

/**
 * Next negative placeholder id for a client-added set. Derived from the
 * session (not a module counter) so ids stay unique across cold restarts
 * while unsaved temp sets are still present.
 */
function nextTempSetId(session: PresetSessionResponse): number {
  let min = 0;
  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      if (set.id < min) min = set.id;
    }
  }
  return min - 1;
}

/** Next `temp-N` placeholder id for a client-added exercise entry. */
function nextTempExerciseEntryId(session: PresetSessionResponse): string {
  let max = 0;
  for (const exercise of session.exercises) {
    if (isTempExerciseEntryId(exercise.id)) {
      const n = parseInt(exercise.id.slice(TEMP_EXERCISE_ENTRY_ID_PREFIX.length), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return `${TEMP_EXERCISE_ENTRY_ID_PREFIX}${max + 1}`;
}

function makeDefaultSet(id: number, setNumber: number): ExerciseEntrySetResponse {
  return {
    id,
    set_number: setNumber,
    set_type: 'normal',
    reps: null,
    weight: null,
    duration: null,
    rest_time: DEFAULT_REST_SEC,
    notes: null,
    rpe: null,
    completed_at: null,
    is_pr: false,
  };
}

/**
 * Seed the completion map from server-persisted `completed_at` timestamps so
 * a workout started from a session with prior progress resumes where it left
 * off. Missing or unparseable timestamps count as not completed. Also used by
 * read-only session views to derive done/upcoming per set.
 */
/** Find a set anywhere in the session by its stringified id. */
function findSessionSet(
  session: PresetSessionResponse,
  setId: string,
): ExerciseEntrySetResponse | undefined {
  for (const exercise of session.exercises) {
    const found = exercise.sets.find((s) => String(s.id) === setId);
    if (found) return found;
  }
  return undefined;
}

/**
 * Locate a set's owning exercise and its index within that exercise. The index
 * doubles as the superset round the set belongs to (round `n` is the `n`th set
 * of each member). Returns null when the id isn't in the session.
 */
function locateSet(
  session: PresetSessionResponse,
  setId: string,
): { exercise: ExerciseEntryResponse; setIndex: number } | null {
  for (const exercise of session.exercises) {
    const setIndex = exercise.sets.findIndex((s) => String(s.id) === setId);
    if (setIndex >= 0) return { exercise, setIndex };
  }
  return null;
}

/**
 * The rest to run before `nextSetId` given that `completedSetId` was just
 * logged. Rest is per-round: superset partners in the same round go
 * back-to-back (0), and the group rest is taken before moving on to a new
 * round or exercise. The step-baked `restSec` also encodes this, but only for
 * the planned interleaving — out-of-order logging makes the cursor land on an
 * interior partner (baked 0) when a real between-rounds rest is actually owed,
 * so derive the rest from the true relationship between the two sets instead.
 * Solo exercises always rest their configured duration.
 */
function restSecBeforeNextSet(
  session: PresetSessionResponse,
  completedSetId: string,
  nextSetId: string,
): number {
  const to = locateSet(session, nextSetId);
  if (!to) return DEFAULT_REST_SEC;
  const toRest = to.exercise.sets[0]?.rest_time ?? DEFAULT_REST_SEC;

  const from = locateSet(session, completedSetId);
  if (!from) return toRest;

  // Back-to-back superset partners: same run, different member, same round.
  const toRun = getSupersetRuns(session.exercises).find((r) =>
    r.entryIds.includes(to.exercise.id),
  );
  if (
    toRun != null &&
    toRun.entryIds.includes(from.exercise.id) &&
    from.exercise.id !== to.exercise.id &&
    from.setIndex === to.setIndex
  ) {
    return 0;
  }
  return toRest;
}

export function seedCompletionFromSession(session: PresetSessionResponse): CompletedSetMap {
  const seeded: CompletedSetMap = {};
  for (const exercise of session.exercises) {
    for (const s of exercise.sets) {
      if (s.completed_at == null) continue;
      const ms = Date.parse(s.completed_at);
      if (!Number.isNaN(ms)) seeded[String(s.id)] = ms;
    }
  }
  return seeded;
}

/**
 * Session-level wrapper over `normalizeSessionSupersetGroups` — the one choke
 * point that dissolves 1-member remainders after ungroup/member deletion and
 * scrubs stale values from external edits. Returns the input object unchanged
 * when nothing needs clearing.
 *
 * Note this also *preserves* any adjacent 2+ run: making stale same-value
 * singletons adjacent would fuse them into a group here. The reorder helpers
 * (`moveSessionExerciseItem`/`moveDraftExerciseItem`) pre-clear such stale
 * values before moving, so a drag reorder can't trigger that fusion; any future
 * insert-in-middle feature would need the same guard.
 */
function normalizeSupersetGroups(session: PresetSessionResponse): PresetSessionResponse {
  const exercises = normalizeSessionSupersetGroups(session.exercises);
  if (exercises === session.exercises) return session;
  return { ...session, exercises };
}

/**
 * Shared tail of every session-edit action: rebuild steps from the edited
 * session, prune/repoint completion and cursor (same rules as
 * `reconcileWithSession`), bump the revision, and mark unsaved changes.
 * Returns the partial state for the caller to `set()`.
 */
function buildSessionEditState(
  state: Pick<
    ActiveWorkoutState,
    'completedSetIds' | 'prSetIds' | 'activeSetId' | 'rest' | 'sessionRevision'
  >,
  editedSession: PresetSessionResponse,
): Partial<ActiveWorkoutState> {
  const nextSession = normalizeSupersetGroups(editedSession);
  const newSteps = buildStepsFromSession(nextSession);
  const newSetIds = new Set(newSteps.map((s) => s.setId));

  const nextCompleted: CompletedSetMap = {};
  for (const id of Object.keys(state.completedSetIds)) {
    if (newSetIds.has(id)) nextCompleted[id] = state.completedSetIds[id];
  }

  // Prune PR stamps alongside completions: a set removed from the session (or
  // whose temp id was re-minted) must not resurrect a stale `is_pr: true` into
  // the next payload.
  const nextPr: PrSetMap = {};
  for (const id of Object.keys(state.prSetIds)) {
    if (newSetIds.has(id)) nextPr[id] = true;
  }

  // If the cursor's set was deleted (or the workout was finished and a new
  // set appeared), fall back to the first uncompleted step.
  let nextActiveSetId = state.activeSetId;
  if (nextActiveSetId == null || !newSetIds.has(nextActiveSetId)) {
    const fallback = newSteps.find((s) => !nextCompleted[s.setId]);
    nextActiveSetId = fallback?.setId ?? null;
  }

  let nextRest = state.rest;
  if (nextActiveSetId !== state.activeSetId) {
    cancelCurrentRestNotification(state.rest);
    nextRest = READY_REST;
  }

  return {
    session: nextSession,
    steps: newSteps,
    completedSetIds: nextCompleted,
    prSetIds: nextPr,
    activeSetId: nextActiveSetId,
    rest: nextRest,
    sessionRevision: state.sessionRevision + 1,
    hasUnsavedChanges: true,
  };
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
 * Build the rest-complete notification's title/body from the upcoming set, so
 * the alert says what's next (exercise, set N of M, rep target) instead of just
 * the exercise name.
 */
function buildRestNotificationContent(
  session: PresetSessionResponse | null,
  setId: string | null,
  fallbackExerciseName: string,
): { title: string; body: string } {
  if (session != null && setId != null) {
    for (const exercise of session.exercises) {
      const set = exercise.sets.find((s) => String(s.id) === setId);
      if (set != null) {
        const name = exercise.exercise_snapshot?.name ?? fallbackExerciseName;
        let body = `${name} · Set ${set.set_number} of ${exercise.sets.length}`;
        if (set.reps != null) {
          body += ` · ${set.reps} rep${set.reps === 1 ? '' : 's'} target`;
        }
        return { title: 'Rest complete — next set up', body };
      }
    }
  }
  return { title: 'Rest complete', body: fallbackExerciseName };
}

/**
 * Schedule the rest-complete notification for the rest identified by `token`,
 * writing the notification id back into state only if that exact rest is still
 * running by the time the async schedule resolves. Otherwise (paused, cleared,
 * dismissed, or replaced) the late-arriving OS notification is cancelled.
 */
function scheduleGuardedRestNotification(
  exerciseName: string,
  seconds: number,
  token: number,
  content?: { title?: string; body?: string },
): void {
  void scheduleRestNotification(exerciseName, seconds, content).then((notifId) => {
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
}

/**
 * Start a rest timer for the step identified by `setId`, scheduling the local
 * notification and wiring up the stale-resolution guard on the returned
 * promise. Returns the new Rest value the caller should commit to state.
 */
function startRestForStep(
  steps: WorkoutStep[],
  setId: string,
  session: PresetSessionResponse | null,
  durationSecOverride?: number,
): Rest {
  const step = steps.find((s) => s.setId === setId);
  const durationSec = durationSecOverride ?? step?.restSec ?? DEFAULT_REST_SEC;
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
  const content = buildRestNotificationContent(session, setId, exerciseName);
  scheduleGuardedRestNotification(exerciseName, durationSec, token, content);

  return rest;
}

export const useActiveWorkoutStore = create<ActiveWorkoutState>()(
  persist(
    (set, get) => ({
      ...initialData,

      startWorkout: (session, opts) => {
        cancelCurrentRestNotification(get().rest);
        const steps = buildStepsFromSession(session);
        // Server-persisted completions seed the map, and the cursor lands on
        // the first uncompleted step (null = every step already done). The
        // store stays clean — the server already knows these completions.
        const completedSetIds = seedCompletionFromSession(session);
        set({
          sessionId: session.id,
          session,
          startedAt: Date.now(),
          steps,
          completedSetIds,
          activeSetId: steps.find((s) => completedSetIds[s.setId] == null)?.setId ?? null,
          rest: READY_REST,
          sessionRevision: 0,
          hasUnsavedChanges: false,
          createdByLiveStart: opts?.createdByLiveStart ?? false,
          // Baseline is captured lazily per exercise by the live card; stamps
          // resume from the server. A fresh start clears any prior event.
          prBaseline: {},
          prSetIds: seedPrFromSession(session),
          lastPrEvent: null,
        });
      },

      startWorkoutAtSet: (session, setId) => {
        cancelCurrentRestNotification(get().rest);
        const steps = buildStepsFromSession(session);
        const targetIndex = steps.findIndex((s) => s.setId === setId);
        if (targetIndex < 0) return;

        // Server-persisted completions are preserved wholesale — restarting
        // at a middle set resumes with holes rather than clearing later
        // checkmarks. Priors the server doesn't know about are stamped now,
        // and only those make the session dirty.
        const completedSetIds = seedCompletionFromSession(session);
        let addedPriors = false;
        for (let i = 0; i < targetIndex; i++) {
          const id = steps[i].setId;
          if (completedSetIds[id] == null) {
            completedSetIds[id] = Date.now();
            addedPriors = true;
          }
        }

        set({
          sessionId: session.id,
          session,
          startedAt: Date.now(),
          steps,
          completedSetIds,
          activeSetId: setId,
          rest: READY_REST,
          sessionRevision: addedPriors ? 1 : 0,
          hasUnsavedChanges: addedPriors,
          createdByLiveStart: false,
          // Backfilled priors are never PRs (detection lives only in
          // completeActiveSet); stamps resume from the server.
          prBaseline: {},
          prSetIds: seedPrFromSession(session),
          lastPrEvent: null,
        });
      },

      capturePrBaseline: (exerciseId, baseline) => {
        const state = get();
        // Only capture during a live workout, and only once per exercise —
        // the store owns idempotency so view/edit card renders can't clobber
        // it and a re-resolved stats query is a no-op. Not a session edit:
        // no revision bump, no dirty flag.
        if (state.sessionId == null) return;
        if (exerciseId in state.prBaseline) return;
        set({ prBaseline: { ...state.prBaseline, [exerciseId]: baseline } });
      },

      clearWorkout: () => {
        cancelCurrentRestNotification(get().rest);
        set({ ...initialData });
      },

      completeSet: (setId) => {
        const state = get();
        const targetIndex = state.steps.findIndex((s) => s.setId === setId);
        if (targetIndex < 0) return;
        // Already logged — the done row owns its own un-complete control.
        if (state.completedSetIds[setId] != null) return;

        cancelCurrentRestNotification(state.rest);

        const completedSetIds: CompletedSetMap = {
          ...state.completedSetIds,
          [setId]: Date.now(),
        };

        // PR detection runs against the pre-completion map (the candidate is
        // excluded internally). On a hit: stamp the set, fire the strong
        // success haptic, and publish the one-shot the celebration listener
        // consumes. A regular log fires only the light selection tick, so the
        // PR buzz still stands out against it.
        let prSetIds = state.prSetIds;
        let lastPrEvent = state.lastPrEvent;
        if (
          state.session != null &&
          isPrSet(state.session, setId, state.completedSetIds, state.prBaseline)
        ) {
          prSetIds = { ...state.prSetIds, [setId]: true };
          fireSuccessHaptic();
          const set0 = findSessionSet(state.session, setId);
          lastPrEvent = {
            setId,
            exerciseName: state.steps[targetIndex].exerciseName,
            weightKg: set0?.weight ?? 0,
            reps: set0?.reps ?? null,
            seq: ++prEventCounter,
          };
        } else {
          fireSelectionHaptic();
        }

        // Next-up follows the just-logged set: the first uncompleted step after
        // it (its "next set"), else the earliest uncompleted hole anywhere (so
        // logging the last set with earlier holes circles back to them), else
        // null when every set is done.
        const nextStep =
          state.steps.slice(targetIndex + 1).find((s) => completedSetIds[s.setId] == null) ??
          state.steps.find((s) => completedSetIds[s.setId] == null) ??
          null;

        if (!nextStep) {
          // No uncompleted step remains: workout is done. No final rest timer.
          set({
            completedSetIds,
            prSetIds,
            lastPrEvent,
            activeSetId: null,
            rest: READY_REST,
            sessionRevision: state.sessionRevision + 1,
            hasUnsavedChanges: true,
          });
          return;
        }

        // The rest is the break before the next-up set, derived from the true
        // relationship between the two sets rather than the step-baked
        // `restSec` — so out-of-order logging still rests between superset
        // rounds instead of skipping the timer on an interior partner.
        const restSec =
          state.session != null
            ? restSecBeforeNextSet(state.session, setId, nextStep.setId)
            : nextStep.restSec;

        set({
          completedSetIds,
          prSetIds,
          lastPrEvent,
          activeSetId: nextStep.setId,
          // Zero rest (back-to-back superset partners, or an explicit rest_time
          // of 0) advances straight to ready — no timer flash.
          rest:
            restSec > 0
              ? startRestForStep(state.steps, nextStep.setId, state.session, restSec)
              : READY_REST,
          sessionRevision: state.sessionRevision + 1,
          hasUnsavedChanges: true,
        });
      },

      completeActiveSet: () => {
        const { activeSetId } = get();
        if (activeSetId != null) get().completeSet(activeSetId);
      },

      uncompleteSet: (setId) => {
        const state = get();
        if (state.completedSetIds[setId] == null) return;
        const next = { ...state.completedSetIds };
        delete next[setId];
        // Unchecking a set retracts its PR stamp too — a set that isn't
        // completed can't hold a record.
        const nextPr = { ...state.prSetIds };
        delete nextPr[setId];

        // The cursor stays where the user is working: every set is
        // independently loggable, so the reopened set is re-logged from its own
        // row control rather than needing the cursor to rewind onto it. The one
        // exception is a finished workout (no active set) — reopening a set
        // there re-anchors the next-up onto it so there's somewhere to resume.
        // A running rest belongs to the cursor, which isn't moving here, so it
        // is left untouched.
        const nextActiveSetId = state.activeSetId ?? setId;

        set({
          completedSetIds: next,
          prSetIds: nextPr,
          activeSetId: nextActiveSetId,
          sessionRevision: state.sessionRevision + 1,
          hasUnsavedChanges: true,
        });
      },

      clearExerciseCompletions: (entryId) => {
        const state = get();
        const session = state.session;
        if (!session) return;
        const exercise = session.exercises.find((e) => e.id === entryId);
        if (!exercise) return;

        const next = { ...state.completedSetIds };
        const nextPr = { ...state.prSetIds };
        let changed = false;
        for (const s of exercise.sets) {
          const id = String(s.id);
          if (next[id] != null) {
            delete next[id];
            delete nextPr[id];
            changed = true;
          }
        }
        if (!changed) return;

        // Same cursor invariant as uncompleteSet: land on the earliest
        // uncompleted step, clearing a now-stale rest if the cursor moved.
        const nextActiveSetId = state.steps.find((s) => next[s.setId] == null)?.setId ?? null;
        let nextRest = state.rest;
        if (nextActiveSetId !== state.activeSetId) {
          cancelCurrentRestNotification(state.rest);
          nextRest = READY_REST;
        }

        set({
          completedSetIds: next,
          prSetIds: nextPr,
          activeSetId: nextActiveSetId,
          rest: nextRest,
          sessionRevision: state.sessionRevision + 1,
          hasUnsavedChanges: true,
        });
      },

      clearAllCompletions: () => {
        const state = get();
        if (Object.keys(state.completedSetIds).length === 0) return;
        cancelCurrentRestNotification(state.rest);
        set({
          completedSetIds: {},
          prSetIds: {},
          // Rewind the cursor to the first step and drop any running rest.
          activeSetId: state.steps[0]?.setId ?? null,
          rest: READY_REST,
          sessionRevision: state.sessionRevision + 1,
          hasUnsavedChanges: true,
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
        const content = buildRestNotificationContent(state.session, activeSetId, exerciseName);
        scheduleGuardedRestNotification(exerciseName, seconds, token, content);
      },

      adjustRest: (deltaSec) => {
        const state = get();
        const { rest, steps, activeSetId } = state;
        const deltaMs = deltaSec * 1000;

        if (rest.state === 'resting' && rest.endsAt != null) {
          const newEndsAt = rest.endsAt + deltaMs;
          if (newEndsAt <= Date.now()) {
            // Shrunk past zero — same outcome as the countdown hitting zero.
            cancelCurrentRestNotification(rest);
            set({ rest: READY_REST });
            fireRestCompleteHaptic();
            return;
          }

          cancelCurrentRestNotification(rest);
          const token = ++restInstanceCounter;
          set({
            rest: {
              ...rest,
              durationSec: Math.max(1, rest.durationSec + deltaSec),
              endsAt: newEndsAt,
              scheduledNotificationId: null,
              instanceToken: token,
            },
          });

          const step = activeSetId != null ? steps.find((s) => s.setId === activeSetId) : null;
          const exerciseName = step?.exerciseName ?? 'Rest';
          const seconds = Math.max(1, Math.ceil((newEndsAt - Date.now()) / 1000));
          const content = buildRestNotificationContent(state.session, activeSetId, exerciseName);
          scheduleGuardedRestNotification(exerciseName, seconds, token, content);
          return;
        }

        if (rest.state === 'paused' && rest.pausedRemainingMs != null) {
          const newRemainingMs = rest.pausedRemainingMs + deltaMs;
          if (newRemainingMs <= 0) {
            set({ rest: READY_REST });
            fireRestCompleteHaptic();
            return;
          }
          set({
            rest: {
              ...rest,
              durationSec: Math.max(1, rest.durationSec + deltaSec),
              pausedRemainingMs: newRemainingMs,
            },
          });
        }
        // 'ready' → no-op.
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

        const nextCompleted: CompletedSetMap = {};
        for (const id of Object.keys(state.completedSetIds)) {
          if (newSetIds.has(id)) nextCompleted[id] = state.completedSetIds[id];
        }

        // Prune PR stamps to the surviving set ids, same as completions.
        const nextPr: PrSetMap = {};
        for (const id of Object.keys(state.prSetIds)) {
          if (newSetIds.has(id)) nextPr[id] = true;
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
          prSetIds: nextPr,
          activeSetId: nextActiveSetId,
          rest: nextRest,
          // Reconcile is the second session writer (WorkoutDetail edit-save).
          // Bumping the revision forces an in-flight autosave response into
          // applyServerSession's graft branch instead of letting it adopt a
          // stale server session wholesale over the newer reconciled one.
          sessionRevision: state.sessionRevision + 1,
        });
      },

      updateSetField: (setId, patch) => {
        const state = get();
        const session = state.session;
        if (!session) return;

        let changed = false;
        const next: PresetSessionResponse = {
          ...session,
          exercises: session.exercises.map((exercise) => {
            if (!exercise.sets.some((s) => String(s.id) === setId)) return exercise;
            changed = true;
            return {
              ...exercise,
              sets: exercise.sets.map((s) =>
                String(s.id) === setId ? { ...s, ...patch } : s,
              ),
            };
          }),
        };
        if (!changed) return;
        set(buildSessionEditState(state, next));
      },

      addSetToExercise: (entryId) => {
        const state = get();
        const session = state.session;
        if (!session) return;
        const exercise = session.exercises.find((e) => e.id === entryId);
        if (!exercise) return;

        const tempId = nextTempSetId(session);
        const lastSet = exercise.sets[exercise.sets.length - 1];
        // Clone the last set's plan (weight/reps/rest/type/duration) but not
        // its outcomes (notes/rpe/completed_at/is_pr) — those describe a
        // performed set.
        const newSet: ExerciseEntrySetResponse = lastSet
          ? {
              ...lastSet,
              id: tempId,
              set_number: exercise.sets.length + 1,
              notes: null,
              rpe: null,
              completed_at: null,
              is_pr: false,
            }
          : makeDefaultSet(tempId, 1);

        const next: PresetSessionResponse = {
          ...session,
          exercises: session.exercises.map((e) =>
            e.id === entryId ? { ...e, sets: [...e.sets, newSet] } : e,
          ),
        };
        set(buildSessionEditState(state, next));
      },

      deleteSet: (setId) => {
        const state = get();
        const session = state.session;
        if (!session) return;
        const exercise = session.exercises.find((e) =>
          e.sets.some((s) => String(s.id) === setId),
        );
        if (!exercise) return;

        // Deleting an exercise's last remaining set removes the exercise —
        // this doubles as the escape hatch for a mistakenly added exercise.
        const next: PresetSessionResponse =
          exercise.sets.length <= 1
            ? {
                ...session,
                exercises: session.exercises.filter((e) => e.id !== exercise.id),
              }
            : {
                ...session,
                exercises: session.exercises.map((e) =>
                  e.id !== exercise.id
                    ? e
                    : {
                        ...e,
                        sets: e.sets
                          .filter((s) => String(s.id) !== setId)
                          .map((s, idx) => ({ ...s, set_number: idx + 1 })),
                      },
                ),
              };
        set(buildSessionEditState(state, next));
      },

      setExerciseRest: (entryId, seconds) => {
        const state = get();
        const session = state.session;
        if (!session) return;
        if (!session.exercises.some((e) => e.id === entryId)) return;

        // Superset rest is per-round: a member's chip writes every member.
        const run = getSupersetRuns(session.exercises).find((r) =>
          r.entryIds.includes(entryId),
        );
        const targetIds = new Set(run ? run.entryIds : [entryId]);

        const next: PresetSessionResponse = {
          ...session,
          exercises: session.exercises.map((e) =>
            targetIds.has(e.id)
              ? { ...e, sets: e.sets.map((s) => ({ ...s, rest_time: seconds })) }
              : e,
          ),
        };
        set(buildSessionEditState(state, next));
      },

      renameSession: (name) => {
        const state = get();
        const session = state.session;
        if (!session) return;
        const trimmed = name.trim();
        if (trimmed.length === 0 || trimmed === session.name) return;
        set(buildSessionEditState(state, { ...session, name: trimmed }));
      },

      addExercise: (exercise) => {
        const state = get();
        const session = state.session;
        if (!session) return;

        const snapshot: ExerciseSnapshotResponse = {
          id: exercise.id,
          name: exercise.name,
          category: exercise.category ?? null,
          images: exercise.images ?? null,
          primary_muscles: exercise.primary_muscles ?? null,
          secondary_muscles: exercise.secondary_muscles ?? null,
          equipment: exercise.equipment ?? null,
          instructions: exercise.instructions ?? null,
          force: exercise.force ?? null,
          level: exercise.level ?? null,
          mechanic: exercise.mechanic ?? null,
          calories_per_hour: exercise.calories_per_hour ?? null,
        };

        const entry: ExerciseEntryResponse = {
          id: nextTempExerciseEntryId(session),
          exercise_id: exercise.id,
          duration_minutes: 0,
          calories_burned: 0,
          entry_date: session.entry_date,
          notes: null,
          distance: null,
          avg_heart_rate: null,
          source: null,
          superset_group: null,
          exercise_snapshot: snapshot,
          activity_details: [],
          sets: [makeDefaultSet(nextTempSetId(session), 1)],
        };

        const next: PresetSessionResponse = {
          ...session,
          exercises: [...session.exercises, entry],
        };
        set(buildSessionEditState(state, next));
      },

      removeExercise: (entryId) => {
        const state = get();
        const session = state.session;
        if (!session) return;
        if (!session.exercises.some((e) => e.id === entryId)) return;
        const next: PresetSessionResponse = {
          ...session,
          exercises: session.exercises.filter((e) => e.id !== entryId),
        };
        set(buildSessionEditState(state, next));
      },

      replaceExercise: (entryId, exercise) => {
        const state = get();
        const session = state.session;
        if (!session) return;
        if (!session.exercises.some((e) => e.id === entryId)) return;

        const snapshot: ExerciseSnapshotResponse = {
          id: exercise.id,
          name: exercise.name,
          category: exercise.category ?? null,
          images: exercise.images ?? null,
          primary_muscles: exercise.primary_muscles ?? null,
          secondary_muscles: exercise.secondary_muscles ?? null,
          equipment: exercise.equipment ?? null,
          instructions: exercise.instructions ?? null,
          force: exercise.force ?? null,
          level: exercise.level ?? null,
          mechanic: exercise.mechanic ?? null,
          calories_per_hour: exercise.calories_per_hour ?? null,
        };

        // Reset to a single default set — the old sets no longer describe the
        // new movement. `?? null` on distance/heart_rate keeps the entry valid.
        const next: PresetSessionResponse = {
          ...session,
          exercises: session.exercises.map((e) =>
            e.id === entryId
              ? {
                  ...e,
                  exercise_id: exercise.id,
                  exercise_snapshot: snapshot,
                  sets: [makeDefaultSet(nextTempSetId(session), 1)],
                }
              : e,
          ),
        };
        set(buildSessionEditState(state, next));
      },

      supersetWith: (currentEntryId, pickedEntryId) => {
        const state = get();
        const session = state.session;
        if (!session) return;
        const exercises = supersetSessionExercises(
          session.exercises,
          currentEntryId,
          pickedEntryId,
        );
        // Identity return = invalid pick (unknown ids, already grouped):
        // leave state untouched so no spurious revision bump is triggered.
        if (exercises === session.exercises) return;
        set(buildSessionEditState(state, { ...session, exercises }));
      },

      ungroupExercise: (entryId) => {
        const state = get();
        const session = state.session;
        if (!session) return;
        const exercises = ungroupSessionExercise(session.exercises, entryId);
        if (exercises === session.exercises) return;
        // buildSessionEditState's normalize pass dissolves a 1-member remainder.
        set(buildSessionEditState(state, { ...session, exercises }));
      },

      reorderExercises: (fromItemIndex, toItemIndex) => {
        const state = get();
        const session = state.session;
        if (!session) return;
        const moved = moveSessionExerciseItem(
          session.exercises,
          fromItemIndex,
          toItemIndex,
        );
        // Identity return = no-op / out-of-range move: leave state untouched so
        // no spurious revision bump or autosave is triggered.
        if (moved === session.exercises) return;
        set(buildSessionEditState(state, { ...session, exercises: moved }));
      },

      applyServerSession: (serverSession, sentRevision, sentEntryIds) => {
        const state = get();
        // The workout may have been cleared or replaced while the save was in
        // flight — a response for a different (or no) session is dropped.
        if (state.sessionId == null || serverSession.id !== state.sessionId) return;
        const local = state.session;
        if (!local) return;

        const setIdMap = buildPositionalSetIdMap(local, serverSession);

        if (state.sessionRevision !== sentRevision) {
          // Edits landed after the payload was built. If they reordered or
          // deleted exercise entries, the positional assumption behind the
          // graft is broken — compare against the *sent* order (an
          // exercise_id comparison would false-pass when the same exercise
          // appears twice and gets swapped). Skipping leaves the session
          // dirty at the bumped revision; the pending debounce or trailing
          // save resends the current shape, whose response grafts cleanly.
          const prefixLength = Math.min(local.exercises.length, sentEntryIds.length);
          for (let i = 0; i < prefixLength; i++) {
            if (local.exercises[i].id !== sentEntryIds[i]) return;
          }
          if (local.exercises.length < sentEntryIds.length) return;

          // Keep the newer local values; only graft the server-assigned ids
          // into place. Every logical set survives this, so the rest timer
          // is never touched.
          const grafted = graftServerSessionIds(local, serverSession);
          const newSteps = buildStepsFromSession(grafted);

          const nextCompleted: CompletedSetMap = {};
          for (const id of Object.keys(state.completedSetIds)) {
            nextCompleted[setIdMap.get(id) ?? id] = state.completedSetIds[id];
          }
          const nextPr: PrSetMap = {};
          for (const id of Object.keys(state.prSetIds)) {
            nextPr[setIdMap.get(id) ?? id] = true;
          }
          const nextActiveSetId =
            state.activeSetId == null
              ? null
              : (setIdMap.get(state.activeSetId) ?? state.activeSetId);

          set({
            session: grafted,
            steps: newSteps,
            completedSetIds: nextCompleted,
            prSetIds: nextPr,
            activeSetId: nextActiveSetId,
            // hasUnsavedChanges stays true — the newer edits still need a save.
          });
          return;
        }

        // No edits landed mid-flight: adopt the server session wholesale.
        const newSteps = buildStepsFromSession(serverSession);
        const newSetIds = new Set(newSteps.map((s) => s.setId));

        const nextCompleted: CompletedSetMap = {};
        for (const id of Object.keys(state.completedSetIds)) {
          const mapped = setIdMap.get(id) ?? id;
          if (newSetIds.has(mapped)) nextCompleted[mapped] = state.completedSetIds[id];
        }

        const nextPr: PrSetMap = {};
        for (const id of Object.keys(state.prSetIds)) {
          const mapped = setIdMap.get(id) ?? id;
          if (newSetIds.has(mapped)) nextPr[mapped] = true;
        }

        // Remap the cursor in place: an id change that still points at the
        // same logical set must NOT clear a running rest. Only when the
        // logical target set is gone does the cursor fall back (and the rest
        // clear with it).
        let nextActiveSetId =
          state.activeSetId == null
            ? null
            : (setIdMap.get(state.activeSetId) ?? state.activeSetId);
        let nextRest = state.rest;
        if (nextActiveSetId != null && !newSetIds.has(nextActiveSetId)) {
          const fallback = newSteps.find((s) => !nextCompleted[s.setId]);
          nextActiveSetId = fallback?.setId ?? null;
          cancelCurrentRestNotification(state.rest);
          nextRest = READY_REST;
        }

        set({
          session: serverSession,
          steps: newSteps,
          completedSetIds: nextCompleted,
          prSetIds: nextPr,
          activeSetId: nextActiveSetId,
          rest: nextRest,
          hasUnsavedChanges: false,
        });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 4,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        sessionId: state.sessionId,
        session: state.session,
        startedAt: state.startedAt,
        steps: state.steps,
        completedSetIds: state.completedSetIds,
        activeSetId: state.activeSetId,
        rest: state.rest,
        // Persisted so edits made just before a cold exit are flushed on the
        // next launch. sessionRevision is deliberately transient.
        hasUnsavedChanges: state.hasUnsavedChanges,
        createdByLiveStart: state.createdByLiveStart,
        // Baseline and stamps survive a cold-start resume; `lastPrEvent` is
        // deliberately omitted so a resume never replays a celebration.
        prBaseline: state.prBaseline,
        prSetIds: state.prSetIds,
      }),
      migrate: (persistedState, version) => {
        // v4 changed `completedSetIds` values from `true` to epoch-ms tap
        // timestamps (backing the server-persisted `completed_at` column).
        // Pre-v4 state predates any release of the active-workout feature
        // and only holds local progress for an in-flight workout — the
        // session itself lives on the server — so it is discarded rather
        // than migrated.
        if (version < 4) {
          return { ...initialData } as ActiveWorkoutState;
        }
        return persistedState as ActiveWorkoutState;
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
  prEventCounter = 0;
  useActiveWorkoutStore.setState({ ...initialData });
  void AsyncStorage.removeItem(STORAGE_KEY);
}
