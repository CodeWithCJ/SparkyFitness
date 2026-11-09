import {
  exerciseEntrySetRequestSchema,
  setsDistanceKm,
  type ExerciseEntrySetRequest,
} from '@workspace/shared';

/**
 * Fields of a synced exercise entry that a user can correct in the diary and
 * that a re-sent provider workout would otherwise overwrite. Only these names
 * are ever stored in exercise_entries.manual_fields.
 */
export const SYNC_PROTECTED_FIELDS = [
  'duration_minutes',
  'calories_burned',
  'distance',
  'avg_heart_rate',
  'steps',
  'notes',
  'sets',
] as const;

export type SyncProtectedField = (typeof SYNC_PROTECTED_FIELDS)[number];

const TEXT_FIELDS: ReadonlySet<SyncProtectedField> = new Set(['notes']);

const isProtectedField = (field: string): field is SyncProtectedField =>
  (SYNC_PROTECTED_FIELDS as readonly string[]).includes(field);

const SET_NUMBERS = [
  'set_number',
  'reps',
  'weight',
  'duration',
  'rest_time',
  'rpe',
  'rir',
  'distance',
] as const;

/** Resolve sparse set edits against this entry's stored rows, never other entries. */
export function resolveEditedSets(
  next: unknown,
  current: unknown
): ExerciseEntrySetRequest[] | undefined {
  if (next === undefined) return undefined;
  if (!Array.isArray(next))
    return exerciseEntrySetRequestSchema.array().parse(next);
  const stored = (Array.isArray(current) ? (current as unknown[]) : []).map(
    (value): Record<string, unknown> =>
      typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : {}
  );
  return next.map((value: unknown) => {
    const supplied =
      typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : {};
    const byId =
      supplied.id === null || supplied.id === undefined
        ? undefined
        : stored.find((row) => String(row.id) === String(supplied.id));
    // Older clients may retain IDs from before a delete-and-reinsert save.
    const previous =
      byId ??
      stored.find(
        (row) => Number(row.set_number) === Number(supplied.set_number)
      );
    const resolved: Record<string, unknown> = {};
    for (const field of Object.keys(exerciseEntrySetRequestSchema.shape)) {
      const fieldValue =
        supplied[field] === undefined ? previous?.[field] : supplied[field];
      if (fieldValue !== undefined) resolved[field] = fieldValue;
    }
    for (const field of SET_NUMBERS) {
      if (resolved[field] !== null && resolved[field] !== undefined)
        resolved[field] = Number(resolved[field]);
    }
    if (resolved.is_pr !== undefined)
      resolved.is_pr = resolved.is_pr === true || resolved.is_pr === 'true';
    const completed = resolved.completed_at;
    if (completed instanceof Date) {
      resolved.completed_at = completed.toISOString();
    } else if (
      typeof completed === 'string' &&
      Number.isFinite(Date.parse(completed))
    ) {
      resolved.completed_at = new Date(completed).toISOString();
    }
    return exerciseEntrySetRequestSchema.parse(resolved);
  });
}

// IDs and database bookkeeping do not describe a set edit. Numeric strings,
// absent nullable fields and pg timestamps must compare like the wire values.
function comparableSets(value: unknown): string {
  const sets = Array.isArray(value) ? value : [];
  const normalized = sets.map((item: unknown) => {
    const set =
      typeof item === 'object' && item !== null
        ? (item as Record<string, unknown>)
        : {};
    const numbers = SET_NUMBERS.map((field) => {
      const number = set[field];
      return number === null || number === undefined || number === ''
        ? null
        : Number(number);
    });
    const completedAt = set.completed_at;
    const completed =
      completedAt instanceof Date
        ? completedAt.toISOString()
        : typeof completedAt === 'string' &&
            Number.isFinite(Date.parse(completedAt))
          ? new Date(completedAt).toISOString()
          : (completedAt ?? null);
    return [
      ...numbers,
      set.set_type ?? null,
      set.notes ?? '',
      set.is_pr === true || set.is_pr === 'true',
      completed,
    ];
  });
  normalized.sort((left, right) => Number(left[0]) - Number(right[0]));
  return JSON.stringify(normalized);
}

const sameValue = (
  field: SyncProtectedField,
  next: unknown,
  current: unknown
): boolean => {
  if (field === 'sets') return comparableSets(next) === comparableSets(current);
  if (TEXT_FIELDS.has(field)) {
    return (next ?? '') === (current ?? '');
  }
  if (next === null || next === undefined || next === '') {
    return current === null || current === undefined || current === '';
  }
  if (current === null || current === undefined || current === '') {
    return false;
  }
  // pg returns numeric columns as strings; compare as numbers.
  return Number(next) === Number(current);
};

/**
 * Explicitly corrected fields, plus the distance derived from an edited set
 * list. Re-saving unchanged sets does not freeze them or their derived total.
 */
export function editedSyncFields(
  updateData: Record<string, unknown>,
  currentEntry: Record<string, unknown>
): SyncProtectedField[] {
  const resolvedUpdate: Record<string, unknown> = {
    ...updateData,
    sets: resolveEditedSets(updateData.sets, currentEntry.sets),
  };
  const fields = SYNC_PROTECTED_FIELDS.filter(
    (field) =>
      resolvedUpdate[field] !== undefined &&
      !sameValue(field, resolvedUpdate[field], currentEntry[field])
  );
  if (
    fields.includes('sets') &&
    resolvedUpdate.distance === undefined &&
    Array.isArray(resolvedUpdate.sets)
  ) {
    const distance = setsDistanceKm(
      (resolvedUpdate.sets as unknown[]).map((set) => ({
        distance:
          typeof set === 'object' &&
          set !== null &&
          'distance' in set &&
          set.distance !== null &&
          set.distance !== undefined
            ? Number(set.distance)
            : null,
      }))
    );
    if (distance !== null) return mergeManualFields(fields, ['distance']);
  }
  return fields;
}

/** Stored manual_fields value, limited to known names. */
export function storedManualFields(value: unknown): SyncProtectedField[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (field): field is SyncProtectedField =>
      typeof field === 'string' && isProtectedField(field)
  );
}

/** Union of two field lists, in SYNC_PROTECTED_FIELDS order. */
export function mergeManualFields(
  current: readonly string[],
  added: readonly string[]
): SyncProtectedField[] {
  const names = new Set([...current, ...added]);
  return SYNC_PROTECTED_FIELDS.filter((field) => names.has(field));
}

/** A copy of a sync payload without the fields the user edited. */
export function withoutManualFields<T extends Record<string, unknown>>(
  updateData: T,
  manualFields: readonly string[]
): T {
  if (manualFields.length === 0) return updateData;
  const copy: Record<string, unknown> = { ...updateData };
  for (const field of manualFields) {
    delete copy[field];
  }
  return copy as T;
}
