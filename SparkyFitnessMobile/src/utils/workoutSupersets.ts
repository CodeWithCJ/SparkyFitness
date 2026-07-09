import type { ExerciseEntryResponse } from '@workspace/shared';
import type { WorkoutDraftExercise } from '../types/drafts';

/** Default rest period between sets, in seconds. */
export const DEFAULT_REST_SEC = 90;

// --- Supersets ---

export interface SupersetRun {
  groupId: number;
  entryIds: string[];
}

/**
 * Derive superset groups as adjacent runs of 2+ exercises sharing a non-null
 * `superset_group`. Singletons and non-adjacent repeats of the same value
 * (possible after external edits) are not valid groups: they are ignored here
 * — and therefore by all display/step logic — but their stored values are
 * still round-tripped by the payload builders.
 */
export function getSupersetRuns(
  exercises: { id: string; superset_group?: number | null }[],
): SupersetRun[] {
  const runs: SupersetRun[] = [];
  const flush = (run: SupersetRun | null) => {
    if (run !== null && run.entryIds.length >= 2) runs.push(run);
  };

  let current: SupersetRun | null = null;
  for (const exercise of exercises) {
    // `!= null` also covers `undefined` from sessions persisted before the
    // superset upgrade, which the response type can't express.
    const groupId = exercise.superset_group ?? null;
    if (groupId != null && current !== null && current.groupId === groupId) {
      current.entryIds.push(exercise.id);
      continue;
    }
    flush(current);
    current = groupId != null ? { groupId, entryIds: [exercise.id] } : null;
  }
  flush(current);
  return runs;
}

/** Runs over form drafts, keyed by `clientId` instead of entry id. */
export function getDraftSupersetRuns(exercises: WorkoutDraftExercise[]): SupersetRun[] {
  return getSupersetRuns(
    exercises.map(e => ({ id: e.clientId, superset_group: e.supersetGroup ?? null })),
  );
}

/**
 * Field accessors that let one superset core serve both shapes: live-session
 * entries (`id`/`superset_group`, sets with `rest_time`) and form drafts
 * (`clientId`/`supersetGroup`, sets with `restTime`). Same parameterization
 * idea as {@link moveExerciseItemByFields}, extended with a rest harmonizer
 * because grouping rewrites every member's per-set rest.
 */
interface SupersetFields<T> {
  idField: keyof T & string;
  groupField: keyof T & string;
  /** First set's rest — the anchor's value becomes the whole group's. */
  firstRestSec: (exercise: T) => number | null | undefined;
  /** Copy of the exercise with every set's rest replaced. */
  withRest: (exercise: T, restSec: number) => T;
}

const SESSION_SUPERSET_FIELDS: SupersetFields<ExerciseEntryResponse> = {
  idField: 'id',
  groupField: 'superset_group',
  firstRestSec: e => e.sets[0]?.rest_time,
  withRest: (e, restSec) => ({ ...e, sets: e.sets.map(s => ({ ...s, rest_time: restSec })) }),
};

const DRAFT_SUPERSET_FIELDS: SupersetFields<WorkoutDraftExercise> = {
  idField: 'clientId',
  groupField: 'supersetGroup',
  firstRestSec: e => e.sets[0]?.restTime,
  withRest: (e, restSec) => ({ ...e, sets: e.sets.map(s => ({ ...s, restTime: restSec })) }),
};

function runsByFields<T extends object>(
  exercises: T[],
  fields: SupersetFields<T>,
): SupersetRun[] {
  return getSupersetRuns(
    exercises.map(e => ({
      id: e[fields.idField] as unknown as string,
      superset_group: (e[fields.groupField] as unknown as number | null | undefined) ?? null,
    })),
  );
}

/**
 * Clear the group value on any exercise not part of an adjacent 2+ run —
 * the one choke point that dissolves 1-member remainders after
 * ungroup/member removal and scrubs stale values from external edits.
 * Returns the input array unchanged when nothing needs clearing.
 */
function normalizeSupersetGroupsByFields<T extends object>(
  exercises: T[],
  fields: SupersetFields<T>,
): T[] {
  const grouped = new Set(runsByFields(exercises, fields).flatMap(run => run.entryIds));
  const isStale = (e: T) =>
    (e[fields.groupField] as unknown as number | null | undefined) != null &&
    !grouped.has(e[fields.idField] as unknown as string);
  if (!exercises.some(isStale)) return exercises;
  return exercises.map(e => (isStale(e) ? ({ ...e, [fields.groupField]: null } as T) : e));
}

/**
 * Group `picked` with `current`: grouped exercises can't be picked, new group
 * ids are max(existing non-null)+1 (including stale values, so a fresh id can
 * never collide into an accidental run), the picked member moves to sit
 * immediately after the current run so the group is one adjacent block, and
 * every member's per-set rest is harmonized to the anchor's (deliberately
 * lossy — rest is per-round, and ungrouping does not restore it). Returns the
 * input array unchanged when the pick is invalid.
 */
function supersetWithByFields<T extends object>(
  exercises: T[],
  currentId: string,
  pickedId: string,
  fields: SupersetFields<T>,
): T[] {
  const getId = (e: T) => e[fields.idField] as unknown as string;
  const getGroup = (e: T) => (e[fields.groupField] as unknown as number | null | undefined) ?? null;

  if (currentId === pickedId) return exercises;
  const picked = exercises.find(e => getId(e) === pickedId);
  if (!picked || !exercises.some(e => getId(e) === currentId)) return exercises;

  const runs = runsByFields(exercises, fields);
  if (runs.some(r => r.entryIds.includes(pickedId))) return exercises;

  const currentRun = runs.find(r => r.entryIds.includes(currentId));
  let groupId: number;
  if (currentRun) {
    groupId = currentRun.groupId;
  } else {
    let maxGroupId = 0;
    for (const e of exercises) {
      const group = getGroup(e);
      if (group != null && group > maxGroupId) maxGroupId = group;
    }
    groupId = maxGroupId + 1;
  }

  const memberIds = currentRun
    ? [...currentRun.entryIds, pickedId]
    : [currentId, pickedId];
  const memberIdSet = new Set(memberIds);

  const anchor = exercises.find(e => getId(e) === memberIds[0])!;
  const groupRest = fields.firstRestSec(anchor) ?? DEFAULT_REST_SEC;

  const lastMemberId = currentRun
    ? currentRun.entryIds[currentRun.entryIds.length - 1]
    : currentId;
  const without = exercises.filter(e => getId(e) !== pickedId);
  const insertAt = without.findIndex(e => getId(e) === lastMemberId) + 1;
  const reordered = [...without.slice(0, insertAt), picked, ...without.slice(insertAt)];

  return reordered.map(e =>
    memberIdSet.has(getId(e))
      ? ({ ...fields.withRest(e, groupRest), [fields.groupField]: groupId } as T)
      : e,
  );
}

/**
 * Remove one exercise from its superset run: a middle member is moved to just
 * after the run so the remaining members stay adjacent. Leftover 1-member
 * remainders are dissolved by the caller's normalization pass.
 */
function ungroupExerciseByFields<T extends object>(
  exercises: T[],
  targetId: string,
  fields: SupersetFields<T>,
): T[] {
  const getId = (e: T) => e[fields.idField] as unknown as string;
  const run = runsByFields(exercises, fields).find(r => r.entryIds.includes(targetId));
  if (!run) return exercises;

  let next = exercises.map(e =>
    getId(e) === targetId ? ({ ...e, [fields.groupField]: null } as T) : e,
  );

  const position = run.entryIds.indexOf(targetId);
  if (position > 0 && position < run.entryIds.length - 1) {
    const moved = next.find(e => getId(e) === targetId)!;
    const without = next.filter(e => getId(e) !== targetId);
    const lastMemberId = run.entryIds[run.entryIds.length - 1];
    const insertAt = without.findIndex(e => getId(e) === lastMemberId) + 1;
    next = [...without.slice(0, insertAt), moved, ...without.slice(insertAt)];
  }
  return next;
}

// Session-shaped wrappers (the active-workout store). No trailing
// normalization: every store session edit funnels through
// buildSessionEditState, whose normalize pass dissolves remainders.

export function supersetSessionExercises(
  exercises: ExerciseEntryResponse[],
  currentEntryId: string,
  pickedEntryId: string,
): ExerciseEntryResponse[] {
  return supersetWithByFields(exercises, currentEntryId, pickedEntryId, SESSION_SUPERSET_FIELDS);
}

export function ungroupSessionExercise(
  exercises: ExerciseEntryResponse[],
  entryId: string,
): ExerciseEntryResponse[] {
  return ungroupExerciseByFields(exercises, entryId, SESSION_SUPERSET_FIELDS);
}

/** See {@link normalizeSupersetGroupsByFields}; session-entry shape. */
export function normalizeSessionSupersetGroups(
  exercises: ExerciseEntryResponse[],
): ExerciseEntryResponse[] {
  return normalizeSupersetGroupsByFields(exercises, SESSION_SUPERSET_FIELDS);
}

// Draft-shaped wrappers (the form reducers). These normalize inline — the
// reducers have no shared edit tail to do it for them.

/** See {@link normalizeSupersetGroupsByFields}; draft shape. */
export function normalizeDraftSupersetGroups(
  exercises: WorkoutDraftExercise[],
): WorkoutDraftExercise[] {
  return normalizeSupersetGroupsByFields(exercises, DRAFT_SUPERSET_FIELDS);
}

export function supersetDraftExercises(
  exercises: WorkoutDraftExercise[],
  currentClientId: string,
  pickedClientId: string,
): WorkoutDraftExercise[] {
  return normalizeDraftSupersetGroups(
    supersetWithByFields(exercises, currentClientId, pickedClientId, DRAFT_SUPERSET_FIELDS),
  );
}

export function ungroupDraftExercise(
  exercises: WorkoutDraftExercise[],
  clientId: string,
): WorkoutDraftExercise[] {
  const next = ungroupExerciseByFields(exercises, clientId, DRAFT_SUPERSET_FIELDS);
  if (next === exercises) return exercises;
  return normalizeDraftSupersetGroups(next);
}

// --- Exercise reordering (drag-and-drop) ---

/**
 * One draggable unit in the reorder UI: a solo exercise or a whole adjacent
 * superset run (its members drag as one indivisible block). `key` is the first
 * member's id (stable within a render); `entryIds` are the member ids in order;
 * `groupId` is the run's superset group, or `null` for a solo item.
 */
export interface ExerciseReorderItem {
  key: string;
  entryIds: string[];
  groupId: number | null;
}

/**
 * Collapse an exercise list into draggable items — solos plus one item per
 * adjacent 2+ superset run (same walk as `buildStepsFromSession`). Stale
 * same-value singletons (non-adjacent repeats) aren't runs, so they surface as
 * solo items. Shape matches both session entries and `WorkoutCardExercise`.
 */
export function buildExerciseReorderItems(
  exercises: { id: string; superset_group?: number | null }[],
): ExerciseReorderItem[] {
  const runByFirstId = new Map(
    getSupersetRuns(exercises).map((run) => [run.entryIds[0], run]),
  );
  const consumed = new Set<string>();
  const items: ExerciseReorderItem[] = [];
  for (const exercise of exercises) {
    if (consumed.has(exercise.id)) continue;
    const run = runByFirstId.get(exercise.id);
    if (run) {
      for (const id of run.entryIds) consumed.add(id);
      items.push({ key: run.entryIds[0], entryIds: [...run.entryIds], groupId: run.groupId });
    } else {
      items.push({ key: exercise.id, entryIds: [exercise.id], groupId: null });
    }
  }
  return items;
}

/**
 * True when a draft exercise list has 2+ draggable items — the gate the form
 * screens use to show their header reorder trigger. Two exercises fused into
 * one superset run collapse to a single item, so they don't count.
 */
export function canReorderDraftExercises(exercises: WorkoutDraftExercise[]): boolean {
  return (
    buildExerciseReorderItems(
      exercises.map((e) => ({ id: e.clientId, superset_group: e.supersetGroup ?? null })),
    ).length >= 2
  );
}

/**
 * Shared reorder core for both session entries and form drafts, keyed by the
 * two field names that differ between them (`id`/`superset_group` vs
 * `clientId`/`supersetGroup`).
 *
 * `from`/`to` are *item* indices (see {@link buildExerciseReorderItems}) with
 * remove-then-insert semantics: `to` is the target index in the array after the
 * moved item is removed — matching `computeReorderTargetIndex`'s output
 * convention. A no-op or out-of-range move returns the input array by identity.
 *
 * Before moving, any group value not part of an adjacent 2+ run is cleared:
 * `startWorkout`/form POPULATE paths don't normalize, so stale same-value
 * singletons can exist, and a move that landed two of them adjacent would
 * otherwise fuse them into a spurious group in `normalize*SupersetGroups`.
 *
 * Consciously accepted edge: two *separate* runs sharing the same group id
 * (only reachable via pathological external data) merge into one run when a
 * move makes them adjacent — adjacency is already app-wide truth for grouping.
 */
function moveExerciseItemByFields<T extends object>(
  exercises: T[],
  from: number,
  to: number,
  idField: keyof T & string,
  groupField: keyof T & string,
): T[] {
  const items = buildExerciseReorderItems(
    exercises.map((e) => ({
      id: e[idField] as unknown as string,
      superset_group: (e[groupField] as unknown as number | null | undefined) ?? null,
    })),
  );
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return exercises;
  }

  // Ids that belong to a real run keep their group; every other non-null group
  // value is a stale singleton and is cleared so it can't fuse after the move.
  const grouped = new Set(
    items.filter((item) => item.groupId != null).flatMap((item) => item.entryIds),
  );
  const clearedById = new Map<string, T>();
  for (const exercise of exercises) {
    const id = exercise[idField] as unknown as string;
    const group = exercise[groupField] as unknown as number | null | undefined;
    clearedById.set(
      id,
      group != null && !grouped.has(id) ? ({ ...exercise, [groupField]: null } as T) : exercise,
    );
  }

  const nextItems = [...items];
  const [moved] = nextItems.splice(from, 1);
  nextItems.splice(to, 0, moved);

  return nextItems.flatMap((item) => item.entryIds.map((id) => clearedById.get(id)!));
}

/** Reorder live-session entries by draggable item (see {@link moveExerciseItemByFields}). */
export function moveSessionExerciseItem(
  exercises: ExerciseEntryResponse[],
  from: number,
  to: number,
): ExerciseEntryResponse[] {
  return moveExerciseItemByFields(exercises, from, to, 'id', 'superset_group');
}

/** Reorder form-draft exercises by draggable item (see {@link moveExerciseItemByFields}). */
export function moveDraftExerciseItem(
  exercises: WorkoutDraftExercise[],
  from: number,
  to: number,
): WorkoutDraftExercise[] {
  return moveExerciseItemByFields(exercises, from, to, 'clientId', 'supersetGroup');
}

/**
 * Superset rail colours come from the theme's category palette (the
 * providerColor.ts pattern): fixed var-name order here, resolved through
 * useCSSVariable by consumers so they track the active theme.
 */
export const SUPERSET_PALETTE_VARS = [
  '--color-cat-blue',
  '--color-cat-orange',
  '--color-cat-violet',
  '--color-cat-green',
  '--color-cat-pink',
  '--color-cat-teal',
  '--color-cat-amber',
  '--color-cat-slate',
];

/**
 * Maps each grouped entry id to a palette colour by run position
 * (palette[i % length]) — index assignment, not group-id hashing, so colours
 * stay collision-free while the visible groups fit the palette.
 */
export function buildSupersetColorMap(
  runs: SupersetRun[],
  palette: string[],
): Map<string, string> {
  const byEntryId = new Map<string, string>();
  if (palette.length > 0) {
    runs.forEach((run, index) => {
      const color = palette[index % palette.length];
      for (const entryId of run.entryIds) {
        byEntryId.set(entryId, color);
      }
    });
  }
  return byEntryId;
}
