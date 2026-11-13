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
] as const;

export type SyncProtectedField = (typeof SYNC_PROTECTED_FIELDS)[number];

const TEXT_FIELDS: ReadonlySet<SyncProtectedField> = new Set(['notes']);

const isProtectedField = (field: string): field is SyncProtectedField =>
  (SYNC_PROTECTED_FIELDS as readonly string[]).includes(field);

const sameValue = (
  field: SyncProtectedField,
  next: unknown,
  current: unknown
): boolean => {
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
