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
 * The protected fields an edit actually changes: present in the request and
 * different from the stored value. Re-saving an unchanged value does not mark
 * the field.
 */
export function editedSyncFields(
  updateData: Record<string, unknown>,
  currentEntry: Record<string, unknown>
): SyncProtectedField[] {
  return SYNC_PROTECTED_FIELDS.filter(
    (field) =>
      updateData[field] !== undefined &&
      !sameValue(field, updateData[field], currentEntry[field])
  );
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
