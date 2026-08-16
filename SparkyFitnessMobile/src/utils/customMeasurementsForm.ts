import type {
  CustomCategory,
  CustomMeasurementEntry,
} from '../types/customMeasurements';
import { parseDecimalInput } from './numericInput';

/**
 * Pure form state for MANUAL DAILY custom measurements.
 *
 * Scope (post maintainer review): this screen only edits manual `Daily`
 * custom entries. Hourly / All / Unlimited are intentionally not exposed
 * (future feature PR), and health-synced entries (source !== 'manual') are
 * never treated as editable manual form state.
 *
 * Write contract (matches upstream backend POST semantics):
 * - `Daily` saves through POST with upsert semantics matched by
 *   (category, date, source). This screen always sends `source: 'manual'`, so
 *   a manually entered value never overwrites (nor is overwritten by) a synced
 *   entry — and a synced source is never preserved into a manual edit.
 * - Clearing an existing manual entry means deleting it (DELETE by entry id).
 *
 * This module contains no React or side effects so every rule can be unit
 * tested directly.
 */

export interface CustomRow {
  /** Stable local key; survives refetches so dirty rows are not clobbered. */
  key: string;
  /** Server entry id; `null` for rows that have not been saved yet. */
  entryId: string | null;
  /** Editable value: numeric/text as typed, boolean as 'true' | 'false' | ''. */
  value: string;
  /** Always `'manual'` — synced entries never become editable rows. */
  source: string;
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
      value: string | number | boolean;
      source: string;
      /** Local row key; lets a partial save drop exactly the rows that succeeded. */
      rowKey: string;
    }
  | { kind: 'delete'; entryId: string; categoryId: string; rowKey: string };

export type BuildCustomOpsResult =
  | { ok: true; operations: CustomOp[] }
  | { ok: false };

export type CustomCategoryMeta = Pick<
  CustomCategory,
  'id' | 'name' | 'display_name' | 'data_type'
>;

/** Manual entries only. Strict contract matching the DB column
 * (`source VARCHAR(50) NOT NULL DEFAULT 'manual'`): null/undefined/missing
 * sources are NOT manual — only the literal string 'manual' is. */
export function isManualSource(source: string | null | undefined): boolean {
  return source === 'manual';
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
    // parseDecimalInput is locale-aware (accepts both '.' and ',' as the
    // decimal separator) but does not accept a leading sign. Custom numeric
    // values have no API min constraint, so preserve the previous negative
    // acceptance by stripping a leading '-' before parsing and re-applying it.
    const negative = trimmed.startsWith('-');
    const unsigned = negative ? trimmed.slice(1) : trimmed;
    const parsed = parseDecimalInput(unsigned);
    if (Number.isNaN(parsed)) return null;
    return negative ? -parsed : parsed;
  }
  return trimmed;
}

/**
 * Reconciles server entries with the local Daily form. Rules:
 * - Only manual entries (source === 'manual') become editable
 *   rows. A synced entry (or a null/missing source — the DB column is
 *   NOT NULL DEFAULT 'manual') for the same category is never prefilled as
 *   manual state — the user can add a fresh manual value that the backend
 *   keeps separate by source.
 * - Dirty rows keep their local value; non-dirty rows mirror the server.
 * - A non-dirty entry that disappears from the response is dropped.
 * - A dirty row whose entry disappears is kept and re-targeted as a new row so
 *   it can still be saved (POST) rather than carried as an existing entry.
 * - Deleted markers (tombstones) are kept only while the server still returns
 *   the entry, so a stale refetch can never resurrect a deleted row.
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
    const manualServer = server.filter((e) => isManualSource(e.source));
    if (manualServer.length > 0) prefilledKeys.add(cat.id);
    form[cat.id] = syncDailyCategory(manualServer, prev, dirtyKeys, server);
  }

  return { form, prefilledKeys };
}

function syncDailyCategory(
  manualServer: CustomMeasurementEntry[],
  prev: CustomCategoryForm | undefined,
  dirtyKeys: ReadonlySet<string>,
  allServer: CustomMeasurementEntry[],
): CustomCategoryForm {
  const serverEntry = manualServer[0];
  const prevRow = prev?.rows[0] ?? null;
  const isDirty = prevRow != null && dirtyKeys.has(prevRow.key);
  const rows: CustomRow[] = [];

  // A tombstoned id (deleted locally, DELETE not confirmed yet) that the
  // server still returns must not be resurrected into rows; it stays in the
  // deleted markers until the server stops reporting it.
  const isTombstoned =
    serverEntry != null &&
    (prev?.deleted ?? []).some((d) => d.entryId === serverEntry.id);

  if (serverEntry != null && !isTombstoned) {
    rows.push({
      key: isDirty && prevRow ? prevRow.key : `entry-${serverEntry.id}`,
      entryId: serverEntry.id,
      source: 'manual',
      value: isDirty && prevRow ? prevRow.value : String(serverEntry.value),
    });
  } else if (prevRow != null && isDirty) {
    // Keep the user's unsaved value; it has no server id yet.
    rows.push({ ...prevRow, entryId: null });
  }

  const serverIds = new Set(allServer.map((e) => e.id));
  return { rows, deleted: (prev?.deleted ?? []).filter((d) => serverIds.has(d.entryId)) };
}

/**
 * Builds the list of mutations from the form, generating operations ONLY for
 * rows the user actually changed (present in `dirtyKeys` or marked deleted).
 * An invalid value in any changed row aborts the whole save; unchanged rows are
 * never parsed, so a bad historical value cannot block unrelated fields.
 * Every save sends `source: 'manual'` — a synced source is never preserved.
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
      operations.push({
        kind: 'delete',
        entryId: deleted.entryId,
        categoryId: cat.id,
        rowKey: deleted.entryId,
      });
    }

    for (const row of catForm.rows) {
      const value = row.value.trim();
      if (value === '') {
        // Clearing an existing entry means deleting it.
        if (row.entryId != null && dirtyKeys.has(row.key)) {
          operations.push({
            kind: 'delete',
            entryId: row.entryId,
            categoryId: cat.id,
            rowKey: row.key,
          });
        }
        continue;
      }

      // Unchanged rows are never re-sent.
      if (!dirtyKeys.has(row.key)) continue;

      const parsed = rowValue(value, cat.data_type);
      if (parsed === null) {
        const label = cat.display_name ?? cat.name;
        onInvalid?.(label);
        return { ok: false };
      }

      operations.push({
        kind: 'save',
        categoryId: cat.id,
        value: parsed,
        source: 'manual',
        rowKey: row.key,
      });
    }
  }

  return { ok: true, operations };
}

export function emptyFormFor(categories: CustomCategoryMeta[]): CustomFormState {
  return Object.fromEntries(categories.map((cat) => [cat.id, { rows: [], deleted: [] }]));
}
