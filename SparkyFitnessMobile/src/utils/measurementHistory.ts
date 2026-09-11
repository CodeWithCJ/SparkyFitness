import { compareDays } from '@workspace/shared';
import type { CheckInMeasurement } from '../types/measurements';
import type {
  CustomMeasurementEntry,
  LatestManualCustomEntry,
} from '../types/customMeasurements';
import {
  FIELD_FORM_KEYS,
  buildStandardFormFromMeasurement,
  type FieldKey,
  type FormState,
  type MeasurementUnitModes,
} from './measurementForm';

/**
 * Previous-value hints for the measurements editor.
 *
 * A hint is a *suggestion only*. It never enters the form state, so it can
 * never be submitted; the user has to adopt it explicitly through `Use last`.
 * Everything here is pure so these rules can be tested without a renderer.
 *
 * The rule for offering a hint is the same for standard fields and custom
 * categories, and follows from one question: does the selected day already have
 * a value of its own? If it does, that value is the editable one and no
 * suggestion is offered. If it does not, the newest value on or before the day
 * is offered instead.
 *
 * Callers pass the selected day's own values (`submitted*`) and the
 * carry-forward lookup (`previous*`); both are derived from query data, so no
 * extra bookkeeping is needed to keep them honest.
 */

export interface StandardFieldHint {
  /** Value to show as the field's placeholder, in the field's display unit. */
  display: string;
  /** Placeholder for the second input of a two-input field, else null. */
  companionDisplay: string | null;
  /**
   * Form keys to write when the user adopts the suggestion. Applying every key
   * the field owns keeps two-input fields (stones+lbs, feet+inches) coherent.
   */
  adopt: Partial<FormState>;
}

export type StandardFieldHints = Partial<Record<FieldKey, StandardFieldHint>>;

/**
 * Derives the suggestion for every standard field from the carry-forward row.
 *
 * Steps and BMR are deliberately same-day only on the server, so their
 * "previous" value is only ever the selected day's own value — which means they
 * never produce a suggestion of their own while the field is empty.
 */
export function deriveStandardFieldHints(
  previous: CheckInMeasurement | null | undefined,
  units: MeasurementUnitModes
): StandardFieldHints {
  const { values } = buildStandardFormFromMeasurement(previous, units);
  const hints: StandardFieldHints = {};

  for (const field of Object.keys(FIELD_FORM_KEYS) as FieldKey[]) {
    const [primaryKey, companionKey] = FIELD_FORM_KEYS[field];
    const display = values[primaryKey];
    if (display == null || display === '') continue;

    const adopt: Partial<FormState> = { [primaryKey]: display };
    let companionDisplay: string | null = null;
    if (companionKey) {
      const companion = values[companionKey];
      if (companion != null) {
        adopt[companionKey] = companion;
        companionDisplay = companion;
      }
    }

    hints[field] = { display, companionDisplay, adopt };
  }

  return hints;
}

/**
 * The display values the selected day's own measurement row produces. This is
 * what a field would hold if nothing had been edited, and therefore the
 * baseline that decides whether a hint is offered at all.
 */
export function selectedDayDisplayValues(
  measurement: CheckInMeasurement | null | undefined,
  units: MeasurementUnitModes
): Partial<FormState> {
  return buildStandardFormFromMeasurement(measurement, units).values;
}

/** Whether the selected day already holds a value for this field. */
export function hasSelectedDayValue(
  field: FieldKey,
  selectedDayValues: Partial<FormState>
): boolean {
  const [primaryKey] = FIELD_FORM_KEYS[field];
  const raw = selectedDayValues[primaryKey];
  return raw != null && raw.trim() !== '';
}

/**
 * Whether the suggestion for one standard field should currently be offered.
 *
 * The input must be empty, a suggestion must exist, and the field must not
 * already hold a value recorded on the selected day — a value the user cleared
 * deliberately must not silently reappear as a suggestion.
 */
export function shouldOfferStandardHint(params: {
  currentRaw: string;
  selectedDayValues: Partial<FormState>;
  field: FieldKey;
  hint: StandardFieldHint | undefined;
}): boolean {
  const { currentRaw, selectedDayValues, field, hint } = params;
  if (!hint) return false;
  if (currentRaw.trim() !== '') return false;
  return !hasSelectedDayValue(field, selectedDayValues);
}

export type CustomFieldHints = Record<string, string>;

/**
 * Narrows a list of custom entries to the newest MANUAL value per category on
 * or before `date`.
 *
 * Only used against a server that predates the bulk hint endpoint, where the
 * client has to narrow the list itself. The result is shaped exactly like the
 * bulk endpoint's response so both paths feed the same derivation.
 *
 * Ordering mirrors the server's query: the newest day wins, and within a day
 * the newest timestamp wins. Entries after the selected day are ignored, so a
 * day in the past cannot suggest a value recorded later than it.
 */
export function reduceLatestManualEntries(
  entries: readonly CustomMeasurementEntry[],
  date: string,
  isManual: (source: string | null | undefined) => boolean
): LatestManualCustomEntry[] {
  const best = new Map<string, CustomMeasurementEntry>();

  for (const entry of entries) {
    if (!isManual(entry.source)) continue;
    if (entry.value == null || entry.value === '') continue;
    if (compareDays(entry.entry_date, date) > 0) continue;

    const current = best.get(entry.category_id);
    if (current == null || isNewerEntry(entry, current)) {
      best.set(entry.category_id, entry);
    }
  }

  return [...best.values()].map((entry) => ({
    id: entry.id,
    category_id: entry.category_id,
    value: entry.value,
    entry_date: entry.entry_date,
    // Always the literal 'manual': a non-manual entry never reaches here.
    source: 'manual',
  }));
}

/** Newest day first, then newest timestamp; a missing timestamp loses. */
function isNewerEntry(
  candidate: CustomMeasurementEntry,
  current: CustomMeasurementEntry
): boolean {
  const byDay = compareDays(candidate.entry_date, current.entry_date);
  if (byDay !== 0) return byDay > 0;
  return (candidate.entry_timestamp ?? '') > (current.entry_timestamp ?? '');
}

/**
 * Previous manual values for custom Daily categories, keyed by category id.
 *
 * The bulk lookup already filters to `source = 'manual'`, so a health-sync
 * sample is never offered as something to adopt. Values are returned verbatim:
 * the custom editor renders the API string as-is, so a hint has to be in that
 * same representation to be adoptable.
 *
 * Only categories the caller passes in are considered, which keeps hints
 * scoped to the eligible Daily categories the editor actually renders.
 */
export function deriveCustomFieldHints(
  categories: readonly { id: string }[],
  previous: readonly LatestManualCustomEntry[] | null | undefined
): CustomFieldHints {
  if (!previous || previous.length === 0) return {};

  const eligible = new Set(categories.map((category) => category.id));
  const hints: CustomFieldHints = {};

  for (const entry of previous) {
    // Keyed by category id: a value can only ever surface under its own
    // category, so two categories can never borrow each other's history.
    if (!eligible.has(entry.category_id)) continue;
    if (entry.value == null || entry.value === '') continue;
    hints[entry.category_id] = entry.value;
  }

  return hints;
}

/**
 * The manual values the selected day already holds, keyed by category id.
 *
 * Only manual sources count: a health-sync sample for the selected day is not a
 * manual value, so it must not suppress the offer to adopt the last manual one.
 */
export function selectedDayCustomValues(
  entries:
    | readonly { category_id: string; value: string; source?: string }[]
    | null
    | undefined,
  isManual: (source: string | null | undefined) => boolean
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const entry of entries ?? []) {
    if (!isManual(entry.source)) continue;
    values[entry.category_id] = entry.value;
  }
  return values;
}

/**
 * Whether a custom suggestion should be offered for one category. The category
 * id is part of the question so a hint for another category can never leak in.
 */
export function shouldOfferCustomHint(params: {
  categoryId: string;
  currentValue: string | undefined;
  selectedDayValues: Record<string, string>;
  hints: CustomFieldHints;
}): boolean {
  const { categoryId, currentValue, selectedDayValues, hints } = params;
  if (hints[categoryId] == null) return false;
  if ((currentValue ?? '').trim() !== '') return false;
  const existing = selectedDayValues[categoryId];
  return existing == null || existing.trim() === '';
}
