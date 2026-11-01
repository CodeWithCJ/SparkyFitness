import {
  LAB_MARKER_PRESETS,
  labPresetRange,
  labRangeStatus,
  type LabMarkerPreset,
  type LabMarkerResponse,
  type LabRangeStatus,
  type LabResultResponse,
  type LabSex,
} from '@workspace/shared';
import { formatLocalizedNumber } from '../localization';

/** Localized names of the built-in markers, keyed by preset key. */
export type LabMarkerLabels = Record<string, string>;

/**
 * A marker as the screens show it: a built-in preset that has results, or one
 * of the user's own markers. `id` is `builtin:<key>` or `custom:<uuid>`; it
 * keys the query caches and list rows.
 */
export interface LabMarker {
  id: string;
  markerKey: string | null;
  markerId: string | null;
  name: string;
  unit: string;
  /** The range to judge a result by when it was saved without its own. */
  ref_range_low: number | null;
  ref_range_high: number | null;
  /** The unit that range is in, which a result's own unit may not match. */
  ref_range_unit: string;
  latest: LabResultResponse | null;
}

export const builtinMarkerId = (key: string) => `builtin:${key}`;
export const customMarkerId = (id: string) => `custom:${id}`;

/** The query for a marker id (`builtin:<key>` or `custom:<uuid>`), or null if it is neither. */
export const labMarkerQueryFromId = (
  id: string
): { markerKey: string } | { markerId: string } | null => {
  if (id.startsWith('builtin:')) return { markerKey: id.slice(8) };
  if (id.startsWith('custom:')) return { markerId: id.slice(7) };
  return null;
};

const presetByKey = (key: string): LabMarkerPreset | undefined =>
  LAB_MARKER_PRESETS.find((p) => p.key === key);

/** The localized name of a built-in preset. */
export const labPresetName = (
  preset: LabMarkerPreset,
  labels: LabMarkerLabels = {}
): string => labels[preset.key] ?? preset.displayName;

/**
 * Parses a typed lab value; accepts a decimal comma and a minus sign (base
 * excess and bone-density T-scores are negative). Null when not a number.
 */
export const parseLabValue = (text: string): number | null => {
  const trimmed = text.trim().replace(',', '.').replace('\u2212', '-');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
};

/** Parses an optional range bound: empty is "no bound", junk is invalid. */
export const parseRangeBound = (
  text: string
): { ok: true; value: number | null } | { ok: false } => {
  if (text.trim() === '') return { ok: true, value: null };
  const value = parseLabValue(text);
  return value === null ? { ok: false } : { ok: true, value };
};

/**
 * Spellings of the same unit, as printed by different labs, after the basic
 * normalisation below. Only exact equivalences belong here: a value in one
 * spelling is numerically identical in the other, so no conversion is needed.
 */
const UNIT_EQUIVALENTS: Readonly<Record<string, string>> = {
  // 1 uIU/mL = 1 mIU/L
  'uiu/ml': 'miu/l',
  // Enzyme activity: IU/L and U/L are the same.
  'iu/l': 'u/l',
  // 1 ng/mL = 1 ug/L
  'ug/l': 'ng/ml',
  'mcg/dl': 'ug/dl',
  // For the monovalent ions (sodium, potassium, chloride, bicarbonate).
  'meq/l': 'mmol/l',
  // Blood counts: x10E3/uL, K/uL, thousand/uL are 10^3 per uL.
  'x10e3/ul': '103/ul',
  '10e3/ul': '103/ul',
  'x10^3/ul': '103/ul',
  '10^3/ul': '103/ul',
  'k/ul': '103/ul',
  'thousand/ul': '103/ul',
  'x10e6/ul': '106/ul',
  '10e6/ul': '106/ul',
  'x10^6/ul': '106/ul',
  '10^6/ul': '106/ul',
  'm/ul': '106/ul',
  'million/ul': '106/ul',
  // eGFR is per 1.73 m2 of body surface whether or not the report prints it.
  'ml/min/1.73': 'ml/min/1.73m2',
  'ml/min/1.73m^2': 'ml/min/1.73m2',
};

/** "mg/dL" and "MG/DL " are the same unit; "µ" and "u" are interchangeable. */
const normalizeUnit = (unit: string | null | undefined): string => {
  const base = (unit ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[µμ]/g, 'u')
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/⁶/g, '6');
  return UNIT_EQUIVALENTS[base] ?? base;
};

export const sameLabUnit = (
  a: string | null | undefined,
  b: string | null | undefined
): boolean => normalizeUnit(a) === normalizeUnit(b);

/** What the add form filled in for a marker: its unit and the range typed alongside. */
export interface LabFormPrefill {
  unit: string;
  low: string;
  high: string;
}

/**
 * The range texts to use once the unit may have been changed. A range the
 * form filled in belongs to the unit it was filled in for, so when that unit
 * is changed and the range was not edited, it is dropped rather than saved
 * under the new unit. A range the person typed or edited is theirs and stays.
 */
export const dropStalePrefilledRange = (
  current: LabFormPrefill,
  prefill: LabFormPrefill | null
): { low: string; high: string } => {
  const stale =
    prefill !== null &&
    !sameLabUnit(current.unit, prefill.unit) &&
    current.low === prefill.low &&
    current.high === prefill.high;
  return stale
    ? { low: '', high: '' }
    : { low: current.low, high: current.high };
};

type Range = {
  ref_range_low: number | null;
  ref_range_high: number | null;
};

type LabRangeBounds = { low: number | null; high: number | null };

/** A marker's fallback range, with the unit that range is in. */
type FallbackRange = Range & { ref_range_unit?: string };

/**
 * The range a result is read against: the one saved with it, else the
 * marker's. A result with neither bound falls back as a whole, so a bound is
 * never taken from one range and its partner from the other. The marker's
 * range is only applied to a result in the same unit: a result saved in
 * another unit has no range to judge it by, rather than a wrong one.
 */
export const effectiveLabRange = (
  result: (Range & { unit?: string }) | null | undefined,
  fallback: FallbackRange
): LabRangeBounds => {
  const own =
    result != null &&
    (result.ref_range_low !== null || result.ref_range_high !== null);
  if (own) {
    return { low: result.ref_range_low, high: result.ref_range_high };
  }
  const otherUnit =
    result?.unit &&
    fallback.ref_range_unit &&
    !sameLabUnit(result.unit, fallback.ref_range_unit);
  if (otherUnit) return { low: null, high: null };
  return {
    low: fallback.ref_range_low ?? null,
    high: fallback.ref_range_high ?? null,
  };
};

/** A result is judged by its own range, else the marker's. */
export const labResultStatus = (
  result: Pick<LabResultResponse, 'value_numeric' | 'unit'> & Range,
  fallback: FallbackRange
): LabRangeStatus => {
  if (result.value_numeric === null) return 'unknown';
  const { low, high } = effectiveLabRange(result, fallback);
  return labRangeStatus(result.value_numeric, low, high);
};

/** Decimal places in a number's shortest round-trip form ("5.6" is 1, "4e-7" is 7). */
const decimalPlaces = (value: number): number => {
  const [mantissa = '', exponent = '0'] = String(value).split('e');
  const fraction = mantissa.split('.')[1]?.length ?? 0;
  return Math.min(Math.max(0, fraction - Number(exponent)), 100);
};

/**
 * A lab number in the app locale with exactly the decimals it was entered
 * with: no rounding of small values and no float tail ("5.6" stays "5.6"),
 * whatever the platform's Intl does with a long maximumFractionDigits.
 */
const labNumber = (value: number): string => {
  const digits = decimalPlaces(value);
  return formatLocalizedNumber(value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

/** "4 - 5.6 %", "< 200 mg/dL", "> 40 mg/dL", or null with no range. */
export const formatLabRange = (
  low: number | null | undefined,
  high: number | null | undefined,
  unit: string
): string | null => {
  const suffix = unit ? ` ${unit}` : '';
  if (low != null && high != null)
    return `${labNumber(low)} - ${labNumber(high)}${suffix}`;
  if (high != null) return `< ${labNumber(high)}${suffix}`;
  if (low != null) return `> ${labNumber(low)}${suffix}`;
  return null;
};

export const formatLabValue = (value: number, unit: string): string =>
  unit ? `${labNumber(value)} ${unit}` : labNumber(value);

/** The value to show for a result: the number with its unit, else the text. */
export const labResultText = (result: LabResultResponse): string =>
  result.value_numeric !== null
    ? formatLabValue(result.value_numeric, result.unit)
    : (result.value_text ?? '');

export type LabHistoryPoint = {
  day: string;
  value: number;
};

/**
 * Numeric results as chart points, oldest first; text-only results are
 * dropped. Given a unit, results in another unit are left out too, since
 * values in different units do not share a scale. Results on the same day
 * keep the order they were entered in.
 */
export const labHistoryPoints = (
  results: LabResultResponse[],
  unit?: string
): LabHistoryPoint[] =>
  results
    .filter(
      (r) =>
        r.value_numeric !== null &&
        (unit === undefined || sameLabUnit(r.unit, unit))
    )
    .sort(
      (a, b) =>
        a.entry_date.localeCompare(b.entry_date) ||
        (a.created_at ?? '').localeCompare(b.created_at ?? '')
    )
    .map((r) => ({ day: r.entry_date, value: r.value_numeric as number }));

/** Profile gender as a lab sex; anything else (unset, other) is unknown. */
export const labSexFromGender = (
  gender: string | null | undefined
): LabSex | null => (gender === 'male' || gender === 'female' ? gender : null);

/**
 * The markers to list: one per built-in preset that has a result, and every
 * custom marker (with or without results), newest result first.
 */
export const buildLabMarkers = (
  customMarkers: LabMarkerResponse[],
  latestResults: LabResultResponse[],
  labels: LabMarkerLabels = {},
  sex: LabSex | null = null
): LabMarker[] => {
  const markers: LabMarker[] = [];

  for (const result of latestResults) {
    if (result.marker_key === null) continue;
    const preset = presetByKey(result.marker_key);
    if (!preset) continue;
    const range = labPresetRange(preset, sex);
    markers.push({
      id: builtinMarkerId(preset.key),
      markerKey: preset.key,
      markerId: null,
      name: labPresetName(preset, labels),
      unit: result.unit || preset.unit,
      ref_range_low: range.low,
      ref_range_high: range.high,
      ref_range_unit: preset.unit,
      latest: result,
    });
  }

  for (const custom of customMarkers) {
    const latest =
      latestResults.find((r) => r.custom_marker_id === custom.id) ?? null;
    markers.push({
      id: customMarkerId(custom.id),
      markerKey: null,
      markerId: custom.id,
      name: custom.name,
      unit: latest?.unit || custom.unit,
      ref_range_low: custom.ref_range_low,
      ref_range_high: custom.ref_range_high,
      ref_range_unit: custom.unit,
      latest,
    });
  }

  return markers.sort((a, b) => {
    const byDate = (b.latest?.entry_date ?? '').localeCompare(
      a.latest?.entry_date ?? ''
    );
    return byDate !== 0 ? byDate : a.name.localeCompare(b.name);
  });
};

/** One row of the marker picker: a built-in preset or one of the user's own. */
export type LabPickerOption =
  | { kind: 'preset'; preset: LabMarkerPreset }
  | { kind: 'custom'; marker: LabMarker };

/**
 * Picker contents for a search string: the user's own markers first, then the
 * built-in presets. Presets match on their localized name, English name and
 * aliases.
 */
export const buildLabPickerOptions = (
  markers: LabMarker[],
  query: string,
  labels: LabMarkerLabels = {}
): LabPickerOption[] => {
  const needle = query.trim().toLowerCase();
  const matches = (text: string) =>
    needle === '' || text.toLowerCase().includes(needle);

  const custom = markers
    .filter((m) => m.markerId !== null && matches(m.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const presets = LAB_MARKER_PRESETS.filter(
    (p) =>
      matches(labPresetName(p, labels)) ||
      matches(p.displayName) ||
      p.aliases.some((alias) => matches(alias))
  ).sort((a, b) =>
    labPresetName(a, labels).localeCompare(labPresetName(b, labels))
  );

  return [
    ...custom.map((marker) => ({ kind: 'custom' as const, marker })),
    ...presets.map((preset) => ({ kind: 'preset' as const, preset })),
  ];
};

/** The unit and range a new result for a preset starts from. */
export const labPresetDefaults = (
  preset: LabMarkerPreset,
  sex: LabSex | null = null
) => {
  const range = labPresetRange(preset, sex);
  return {
    unit: preset.unit,
    ref_range_low: range.low,
    ref_range_high: range.high,
  };
};
