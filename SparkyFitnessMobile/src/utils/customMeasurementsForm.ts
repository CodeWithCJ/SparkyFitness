import type {
  CustomCategory,
  CustomMeasurementEntry,
} from '../types/customMeasurements';

/**
 * Pure form state for custom measurements, keyed by category id.
 *
 * Frequencies:
 * - `Daily`: at most one entry per category per day → a single row.
 * - `Hourly`: multiple entries per day, identified by id + `entry_hour`.
 * - `All` / `Unlimited`: an independent list of entries identified by id +
 *   `entry_timestamp`. The server always INSERTs on POST, so existing entries
 *   are edited via PUT-by-id and new ones are created with POST.
 *
 * This module contains no React or side effects so every frequency rule can be
 * unit tested directly.
 */

export interface CustomRow {
  /** Stable local key; survives refetches so dirty rows are not clobbered. */
  key: string;
  /** Server entry id; `null` for rows that have not been saved yet. */
  entryId: string | null;
  /** `entry_hour` from the server (Hourly) or the hour chosen on add. */
  hour: number | null;
  /** `entry_timestamp` from the server or the creation timestamp on add. */
  timestamp: string | null;
  /** `source` from the server, or `'manual'` for locally added rows. */
  source: string | null;
  /** Editable value: numeric/text as typed, boolean as 'true' | 'false' | ''. */
  value: string;
}

export interface DeletedCustomRow {
  entryId: string;
}

export interface CustomCategoryForm {
  rows: CustomRow[];
  deleted: DeletedCustomRow[];
}

export type CustomFormState = Record<string, CustomCategoryForm>;

export type CustomOp =
  | {
      kind: 'save';
      categoryId: string;
      /** `null` → POST (new entry); set → PUT-by-id (edit existing entry). */
      entryId: string | null;
      value: string | number | boolean;
      hour: number | null;
      timestamp: string | null;
    }
  | { kind: 'delete'; entryId: string; categoryId: string };

export type BuildCustomOpsResult =
  | { ok: true; operations: CustomOp[] }
  | { ok: false };

export type CustomCategoryMeta = Pick<
  CustomCategory,
  'id' | 'name' | 'display_name' | 'data_type' | 'frequency'
>;

export function isMultiEntryFrequency(
  frequency: string | null | undefined,
): boolean {
  return frequency === 'Hourly' || frequency === 'All' || frequency === 'Unlimited';
}

export function rowValue(
  value: string,
  dataType: string | null | undefined,
): string | number | boolean | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (dataType === 'boolean') {
    if (trimmed === 'true') return 'true';
    if (trimmed === 'false') return 'false';
    return null;
  }
  if (dataType === 'numeric' || dataType == null) {
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return trimmed;
}

/**
 * Builds an ISO-8601 UTC instant from a calendar-day string and an hour chosen
 * in the local timezone. Near a timezone boundary the serialized instant may
 * land on the adjacent UTC day, but the `entry_date` column is the separate
 * calendar-day string passed in, so it is never shifted by UTC conversion.
 */
export function entryTimestampFor(
  selectedDate: string,
  hour: number,
  options: { minutes?: number } = {},
): string {
  const [year, month, day] = selectedDate.split('-').map(Number);
  const date = new Date(year, month - 1, day, hour, options.minutes ?? 0, 0, 0);
  return date.toISOString();
}

export interface HourlyHourConflict {
  categoryId: string;
  hour: number;
}

/**
 * Detects a duplicate Hourly slot: a locally added row whose (hour, source)
 * collides with a server entry or with another local row in the same category.
 * Server rows at the same hour with a different source are legitimate and do
 * not conflict, so the occupied slots are tracked as a set of `hour:source`
 * combinations rather than a single source per hour.
 *
 * Only rows that will actually be saved are considered: existing rows keep
 * their server slot, empty rows produce no POST, and rows absent from
 * `dirtyKeys` (when provided) are unchanged. A server entry that was deleted
 * locally (tombstone) is ignored because it will no longer exist after the
 * save, so its slot can be reused. Returns the first conflict or null.
 */
export function findHourlyHourConflict(params: {
  categories: CustomCategoryMeta[];
  form: CustomFormState;
  serverEntries: CustomMeasurementEntry[];
  dirtyKeys?: ReadonlySet<string>;
}): HourlyHourConflict | null {
  const { categories, form, serverEntries, dirtyKeys } = params;
  for (const cat of categories) {
    if (cat.frequency !== 'Hourly') continue;
    const catForm = form[cat.id];
    if (!catForm) continue;
    const tombstonedIds = new Set(catForm.deleted.map((d) => d.entryId));
    const serverCombos = new Set<string>();
    for (const entry of serverEntries) {
      if (entry.category_id !== cat.id || entry.entry_hour == null) continue;
      if (tombstonedIds.has(entry.id)) continue;
      serverCombos.add(`${entry.entry_hour}:${entry.source ?? 'manual'}`);
    }
    const seen = new Set<string>();
    for (const row of catForm.rows) {
      if (row.hour == null) continue;
      if (row.entryId != null) continue; // existing rows keep their server slot
      if (row.value.trim() === '') continue; // empty rows produce no POST
      if (dirtyKeys != null && !dirtyKeys.has(row.key)) continue; // unchanged rows produce no POST
      const key = `${row.hour}:${row.source ?? 'manual'}`;
      if (serverCombos.has(key) || seen.has(key)) {
        return { categoryId: cat.id, hour: row.hour };
      }
      seen.add(key);
    }
  }
  return null;
}

/**
 * Reconciles server entries with the local form. Rules:
 * - Dirty rows keep their local value; non-dirty rows mirror the server.
 * - A non-dirty entry that disappears from the response is dropped.
 * - A dirty row whose entry disappears is kept and re-targeted as a new row so
 *   it can still be saved (POST) instead of PUT-ing a stale id.
 * - A date change must clear the dirty set beforehand; this function never
 *   reuses a previous day's rows across categories beyond the dirty rules.
 * - Multi-entry categories keep one row per server entry (never flattened).
 * - Deleted markers are kept only while the server still returns the entry.
 */
export function syncCustomForm(params: {
  categories: CustomCategoryMeta[];
  serverEntries: CustomMeasurementEntry[];
  current: CustomFormState;
  dirtyKeys: ReadonlySet<string>;
}): { form: CustomFormState; prefilledKeys: Set<string> } {
  const { categories, serverEntries, current, dirtyKeys } = params;
  const form: CustomFormState = {};
  const prefilledKeys = new Set<string>();

  const entriesByCategory = new Map<string, CustomMeasurementEntry[]>();
  for (const entry of serverEntries) {
    const list = entriesByCategory.get(entry.category_id) ?? [];
    list.push(entry);
    entriesByCategory.set(entry.category_id, list);
  }

  for (const cat of categories) {
    const server = entriesByCategory.get(cat.id) ?? [];
    const prev = current[cat.id];
    if (server.length > 0) prefilledKeys.add(cat.id);
    if (isMultiEntryFrequency(cat.frequency)) {
      form[cat.id] = syncMultiEntry(server, prev, dirtyKeys, cat.frequency);
    } else {
      form[cat.id] = syncSingleEntry(server, prev, dirtyKeys);
    }
  }

  return { form, prefilledKeys };
}

function syncSingleEntry(
  server: CustomMeasurementEntry[],
  prev: CustomCategoryForm | undefined,
  dirtyKeys: ReadonlySet<string>,
): CustomCategoryForm {
  const serverEntry = server[0];
  const prevRow = prev?.rows[0] ?? null;
  const isDirty = prevRow != null && dirtyKeys.has(prevRow.key);
  const rows: CustomRow[] = [];

  if (serverEntry != null) {
    rows.push({
      key: isDirty && prevRow ? prevRow.key : `entry-${serverEntry.id}`,
      entryId: serverEntry.id,
      hour: serverEntry.entry_hour ?? null,
      timestamp: serverEntry.entry_timestamp ?? null,
      source: serverEntry.source ?? null,
      value: isDirty && prevRow ? prevRow.value : String(serverEntry.value),
    });
  } else if (prevRow != null && isDirty) {
    // Keep the user's unsaved value; it has no server id yet.
    rows.push({ ...prevRow, entryId: null });
  }

  const serverIds = new Set(server.map((e) => e.id));
  return { rows, deleted: (prev?.deleted ?? []).filter((d) => serverIds.has(d.entryId)) };
}

function syncMultiEntry(
  server: CustomMeasurementEntry[],
  prev: CustomCategoryForm | undefined,
  dirtyKeys: ReadonlySet<string>,
  frequency: string | null | undefined,
): CustomCategoryForm {
  const serverIds = new Set(server.map((e) => e.id));
  const rows: CustomRow[] = [];

  for (const entry of server) {
    // A tombstoned id (deleted locally, DELETE not confirmed yet) that the
    // server still returns must not be resurrected into rows; it stays in the
    // deleted markers until the server stops reporting it.
    const isTombstoned = (prev?.deleted ?? []).some((d) => d.entryId === entry.id);
    if (isTombstoned) continue;
    const prevRow = prev?.rows.find((r) => r.entryId === entry.id);
    const isDirty = prevRow != null && dirtyKeys.has(prevRow.key);
    rows.push({
      key: isDirty && prevRow ? prevRow.key : `entry-${entry.id}`,
      entryId: entry.id,
      hour: entry.entry_hour ?? null,
      timestamp: entry.entry_timestamp ?? null,
      source: entry.source ?? null,
      value: isDirty && prevRow ? prevRow.value : String(entry.value),
    });
  }

  // Dirty rows whose server entry disappeared are kept as new rows.
  for (const prevRow of prev?.rows ?? []) {
    if (prevRow.entryId != null && !serverIds.has(prevRow.entryId) && dirtyKeys.has(prevRow.key)) {
      rows.push({ ...prevRow, entryId: null });
    }
  }

  // Locally added rows are kept while dirty.
  for (const prevRow of prev?.rows ?? []) {
    if (prevRow.entryId == null && dirtyKeys.has(prevRow.key)) {
      rows.push(prevRow);
    }
  }

  const ordered = orderRows(rows, frequency);
  return {
    rows: ordered,
    deleted: (prev?.deleted ?? []).filter((d) => serverIds.has(d.entryId)),
  };
}

function orderRows(
  rows: CustomRow[],
  frequency: string | null | undefined,
): CustomRow[] {
  // Hourly rows are ordered by hour; every other multi-entry category keeps
  // server order (server returns newest first) with local additions at the end.
  if (frequency !== 'Hourly') return rows;
  return [...rows].sort((a, b) => {
    const ha = a.hour ?? 0;
    const hb = b.hour ?? 0;
    if (ha !== hb) return ha - hb;
    return a.key.localeCompare(b.key);
  });
}

/**
 * Builds the list of mutations from the form, generating operations ONLY for
 * rows the user actually changed (present in `dirtyKeys` or marked deleted).
 * An invalid value in any changed row aborts the whole save; unchanged rows are
 * never parsed, so a bad historical value cannot block unrelated fields.
 */
export function buildCustomOps(params: {
  categories: CustomCategoryMeta[];
  form: CustomFormState;
  dirtyKeys: ReadonlySet<string>;
  onInvalid?: (label: string) => void;
}): BuildCustomOpsResult {
  const { categories, form, dirtyKeys, onInvalid } = params;
  const operations: CustomOp[] = [];

  for (const cat of categories) {
    const catForm = form[cat.id];
    if (!catForm) continue;

    for (const deleted of catForm.deleted) {
      operations.push({ kind: 'delete', entryId: deleted.entryId, categoryId: cat.id });
    }

    for (const row of catForm.rows) {
      const value = row.value.trim();
      if (value === '') {
        // Clearing an existing entry means deleting it.
        if (row.entryId != null && dirtyKeys.has(row.key)) {
          operations.push({ kind: 'delete', entryId: row.entryId, categoryId: cat.id });
        }
        continue;
      }

      // Unchanged rows are never re-sent.
      if (!dirtyKeys.has(row.key)) continue;

      // Hourly slots are constrained to the valid 0-23 range. The UI only
      // produces in-range hours, but a corrupted row must not reach the server.
      if (
        cat.frequency === 'Hourly' &&
        (row.hour == null || !Number.isInteger(row.hour) || row.hour < 0 || row.hour > 23)
      ) {
        const label = cat.display_name ?? cat.name;
        onInvalid?.(label);
        return { ok: false };
      }

      const parsed = rowValue(value, cat.data_type);
      if (parsed === null) {
        const label = cat.display_name ?? cat.name;
        onInvalid?.(label);
        return { ok: false };
      }

      // All/Unlimited entries are always INSERTed by upstream POST, so an
      // existing entry cannot be edited by id. The UI renders those rows
      // read-only; here we defensively skip a save so a stale id never turns
      // into an accidental duplicate insert. Clearing (delete) is handled above.
      if (
        row.entryId != null &&
        (cat.frequency === 'All' || cat.frequency === 'Unlimited')
      ) {
        continue;
      }

      operations.push({
        kind: 'save',
        categoryId: cat.id,
        entryId: row.entryId,
        value: parsed,
        hour: row.hour,
        timestamp: row.timestamp,
      });
    }
  }

  return { ok: true, operations };
}

export function emptyFormFor(categories: CustomCategoryMeta[]): CustomFormState {
  return Object.fromEntries(categories.map((cat) => [cat.id, { rows: [], deleted: [] }]));
}
